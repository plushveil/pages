import * as fs from 'node:fs'
import * as os from 'node:os'
import * as url from 'node:url'
import * as path from 'node:path'
import * as http from 'node:http'
import * as https from 'node:https'
import * as threads from 'node:worker_threads'
import process from 'node:process'

import mime from 'mime'

import getConfig, { port } from './config.mjs'
import * as utils from './utils.mjs'
import { pages as getPages } from './pages.mjs'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const __worker = path.resolve(__dirname, 'worker.mjs')

const apps = []

process.on('SIGINT', (event) => {
  for (const app of apps) {
    app.closeAllConnections()
    app.close()
  }
  process.exit(0)
})

/**
 * Serves a folder.
 * @param {string} folder - The folder to build.
 * @param {string} [config] - A specifier that points to the configuration file.
 * @param {boolean} [cache] - Whether to enable caching.
 * @returns {Promise<http.Server>} The server.
 */
export default async function serve (folder, config, cache = true) {
  config = await getConfig(config)
  config.root = utils.resolve(folder, undefined, { exists: true, folder: true })

  const watcher = getPageWatcher(config)
  const parallel = os.cpus().length
  const workers = []
  const createWorkers = (count) => { while (workers.length < (count || parallel)) workers.push(createWorker(config, workers)) }
  setInterval(() => createWorkers(), 10000).unref()
  setTimeout(() => createWorkers(), 3000).unref()
  createWorkers(2)

  const requestHandler = getRequestHandler(config, watcher, workers, cache)
  const server = (port === '443') ? https.createServer(config.ssl, requestHandler) : http.createServer(requestHandler)
  const app = await new Promise((resolve, reject) => {
    server.on('error', reject)
    server.listen(Number(port), () => {
      console.log(`Serving ${path.relative(process.cwd(), config.root)} at ${config.baseURI}`)
      server.removeListener('error', reject)
      resolve(server)
    })
  })

  const close = app.close.bind(app)
  app.close = () => {
    while (workers.length) workers.pop().terminate()
    watcher.then((watcher) => watcher.close())
    close()
  }

  apps.push(app)
  return app
}

/**
 * Creates a worker.
 * @param {import('./config.mjs').Config} config - The configuration.
 * @param {threads.Worker[]} workers - The workers.
 * @returns {threads.Worker} The worker.
 */
function createWorker (config, workers) {
  const worker = new threads.Worker(__worker, { workerData: { config: JSON.stringify(config) } })
  const terminate = worker.terminate.bind(worker)
  worker.terminate = () => { workers.splice(workers.indexOf(worker), 1); terminate() }
  return worker
}

/**
 * Returns the request handler.
 * @param {import('./config.mjs').Config} config - The configuration.
 * @param {Promise<{ getPages: import('./pages.mjs').pages, close: () => void }>} watcher - The watcher.
 * @param {threads.Worker[]} workers - The workers.
 * @param {boolean} cache - Whether to enable caching.
 * @returns {(req: http.IncomingMessage, res: http.ServerResponse) => void} The request handler.
 */
function getRequestHandler (config, watcher, workers, cache) {
  /**
   * @returns {Promise<threads.Worker>} A free worker.
   */
  async function getWorker () {
    const worker = workers.find(worker => !worker.busy)
    if (worker) return worker
    return new Promise((resolve) => {
      const interval = setInterval(() => {
        if (workers.length) {
          const worker = workers.find(worker => !worker.busy)
          if (worker) { clearInterval(interval); resolve(worker) }
        }
      }, 100).unref()
    })
  }

  /**
   * Handles requests.
   * @param {http.IncomingMessage} req - The request.
   * @param {http.ServerResponse} res - The response.
   */
  return async (req, res) => {
    const reqUrl = new URL(req.url, config.baseURI)
    const page = (await watcher).getPages().find(page => page.url.pathname === reqUrl.pathname)
    if (!page) {
      res.writeHead(404)
      res.end('Not found')
      return
    }

    // ETag-based (entity tag) caching
    const etag = page.params?.headers?.ETag
    if (etag && req.headers['if-none-match'] === etag) {
      res.writeHead(304)
      res.end()
      return
    }

    const headers = page.params?.headers || {}
    if (!headers['Content-Type']) headers['Content-Type'] = mime.getType(page.url.pathname)

    // Content cache
    if (page.cache?.data) {
      headers['Content-Length'] = Buffer.byteLength(page.cache.data)
      if (etag) headers['ETag'] = etag
      res.writeHead(200, headers)
      res.end(page.cache.data)
      return
    }

    const worker = await getWorker()
    worker.busy = true

    let done = false
    worker.on('message', ([type, data]) => {
      if (done) return
      done = true
      if (type === 'content') {
        headers['Content-Length'] = Buffer.byteLength(data)
        if (page.params?.headers?.ETag) headers['ETag'] = page.params.headers.ETag
        res.writeHead(200, headers)
        res.end(data)
        worker.terminate()

        // Cache the content for 3 minutes
        if (!(os.totalmem() < 4 * 1024 * 1024 * 1024) && cache && !(data.includes('/*! tailwindcss'))) {
          if (page.cache?.timeout) clearTimeout(page.cache.timeout)
          const weakPage = new WeakRef(page)
          const timeout = setTimeout(() => { const derefPage = weakPage.deref(); if (derefPage) derefPage.cache = null }, 180000).unref()
          page.cache = { data, timeout }
        }
      } else if (type === 'stream') {
        headers['Transfer-Encoding'] = 'chunked'
        headers['ETag'] = page.params?.headers?.ETag
        res.writeHead(200, headers)
        const rs = fs.createReadStream(url.fileURLToPath(page.fileUrl))
        rs.pipe(res)
        worker.busy = false
      } else {
        res.writeHead(500)
        res.end('Internal server error')
        worker.busy = false
      }
    })

    worker.on('exit', (code) => {
      if (code === 0 || done) return
      done = true
      res.writeHead(500)
      res.end('Internal server error')
    })

    worker.postMessage(['pipe', JSON.stringify({ ...page, cache: undefined })])
  }
}

/**
 * Watches the configuration root for changes and updates the page list.
 * @param {import('./config.mjs').Config} config - The configuration.
 * @returns {Promise<{ getPages: () => import('./pages.mjs').Page[], close: () => void }>} The watcher.
 */
async function getPageWatcher (config) {
  const filter = (page) => page.params?.headers?.['X-Partial'] !== 'true'
  /**
   * @type {import('./pages.mjs').Page[]}
   */
  let pages = []
  await refreshAll()
  const inProgress = {}
  const watcher = fs.watch(config.root, { recursive: true }, (_event, filename) => getPagesUpdate(filename))
  return { getPages: () => pages, close: () => watcher.close() }

  /**
   *
   */
  async function refreshAll () {
    const files = (await Promise.all(utils.getFilesInFolder(config.root))).filter((file) => {
      if (['page', 'htms', 'html'].find(ext => file.endsWith(`.${ext}`))) return fs.readFileSync(file, { encoding: 'utf-8' }).includes('canonical')
      return true
    })
    const pagesUpdate = []
    for (const file of files) {
      const filePages = await getPages(file, config)
      for (const page of filePages) if (filter(page)) pagesUpdate.push(page)
    }
    pages = pagesUpdate
  }

  /**
   * Deletes cached pages that depend on the changed file.
   * @param {string} file - The changed file.
   * @param {URL} fileUrl - The changed file URL.
   */
  async function cachebuster (file, fileUrl) {
    const cachMappings = [
      { source: ['.page', '.htms', '.html', '.mjs', '.json'], target: ['.page', '.htms', '.html'], includeComponents: true },
      { source: ['.css'], target: ['.css'] },
      { source: ['.ts'], target: ['.ts'] },
      { source: ['.mjs', '.js', '.cjs'], target: ['.mjs', '.js', '.cjs'] },
    ]
    for (const mapping of cachMappings) {
      if (!(mapping.source.find(ext => file.endsWith(ext)))) continue
      for (const targetExt of mapping.target) {
        for (const page of pages) {
          if (!page.cache) continue
          if (page.fileUrl.toString().endsWith(targetExt)) {
            if (mapping.includeComponents !== true) {
              if (page.fileUrl.toString().includes('components')) {
                const componentFolder = page.fileUrl.toString().match(/components\/[^/]*/)[0]
                if (!file.includes(componentFolder)) continue
              }
              if (fileUrl.toString().includes('components')) {
                const componentFolder = fileUrl.toString().match(/components\/[^/]*/)[0]
                if (!page.fileUrl.toString().includes(componentFolder)) continue
              }
            }
            page.cache = null
          }
        }
      }
    }

    for (const page of pages) {
      if (!page.sources) page.sources = await getSources(page)
      if (page.sources.find(source => file.endsWith(source))) page.cache = null
    }
  }

  /**
   * Get page sources.
   * @param {import('./pages.mjs').Page} page - The page.
   * @returns {Promise<string[]>} The page sources.
   */
  async function getSources (page) {
    const sources = []
    const sourcemap = parseSourceMapComment(await readLastNonEmptyLine(path.resolve(url.fileURLToPath(page.fileUrl))))
    if (!sourcemap) return sources

    try {
      const sourcemapObj = JSON.parse(sourcemap)
      if (sourcemapObj.sources) return sourcemapObj.sources
    } catch {}

    return sources

    /**
     * @param {string} filePath - The path to the file.
     * @param {number} chunkSize - The size of the chunk to read from the end of the file.
     * @returns {Promise<string|null>} The last non-empty line or null if not found.
     */
    async function readLastNonEmptyLine (filePath, chunkSize = 2048) {
      const file = await fs.promises.open(filePath, 'r')

      try {
        const { size } = await file.stat()
        if (size === 0) return null

        const start = Math.max(0, size - chunkSize)
        const length = size - start

        const buffer = Buffer.alloc(length)
        await file.read(buffer, 0, length, start)

        const text = buffer.toString('utf8')

        // walk backwards without splitting whole string
        let end = text.length - 1

        // skip trailing whitespace/newlines
        while (end >= 0 && (text[end] === '\n' || text[end] === '\r' || text[end] === ' ' || text[end] === '\t')) {
          end--
        }

        if (end < 0) return null

        let startIdx = end
        while (startIdx >= 0 && text[startIdx] !== '\n' && text[startIdx] !== '\r') {
          startIdx--
        }

        return text.slice(startIdx + 1, end + 1)
      } finally {
        await file.close()
      }
    }

    /**
     * @param {string|null} line - The line to parse.
     * @returns {Promise<string|null>} The parsed source map comment or null if not found.
     */
    function parseSourceMapComment (line) {
      if (!line) return null
      const SOURCE_MAP_PREFIX = '//# sourceMappingURL='

      const trimmed = line.trim()
      if (!trimmed.startsWith(SOURCE_MAP_PREFIX)) return null

      const value = trimmed.slice(SOURCE_MAP_PREFIX.length).trim()
      if (!value) return null

      // Inline sourcemap: data:application/json;base64,XXXX
      if (value.startsWith('data:')) {
        const match = value.match(/^data:.*?;base64,(.+)$/)
        if (!match) return null
        const base64 = match[1]
        const decoded = Buffer.from(base64, 'base64').toString('utf8')
        return decoded
      }

      // file reference
      const sourceMapPage = pages.find(page => page.url.toString().endsWith(value))
      if (!sourceMapPage) return null
      return fs.promises.readFile(path.resolve(url.fileURLToPath(sourceMapPage.fileUrl)), { encoding: 'utf8' })
    }
  }

  /**
   * Handles page updates.
   * @param {string} filename - The changed filename.
   * @returns {Promise<void>}
   */
  async function getPagesUpdate (filename) {
    const file = path.resolve(config.root, filename)
    const fileUrl = url.pathToFileURL(file).toString()
    const isIgnored = config.build?.ignore?.some(pattern => file.match(new RegExp(pattern)))
    if (isIgnored) return
    if (inProgress[filename]) { inProgress[filename] = { repeat: true }; return }
    inProgress[filename] = { repeat: false }
    cachebuster(file, fileUrl)

    if (fs.existsSync(file)) {
      if (fs.statSync(file).isDirectory()) {
        refreshAll()
      } else {
        const pagesUpdate = (await getPages(file, config)).filter(filter)
        pages = [...pages.filter(page => page.fileUrl.toString() !== fileUrl), ...pagesUpdate]
      }
    } else {
      pages = pages.filter(page => page.fileUrl.toString() !== fileUrl)
    }

    if (inProgress[filename].repeat) {
      inProgress[filename] = false
      return getPagesUpdate(filename)
    }

    delete inProgress[filename]
  }
}
