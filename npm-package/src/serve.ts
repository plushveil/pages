import * as fs from 'node:fs'
import * as http from 'node:http'
import * as https from 'node:https'
import * as os from 'node:os'
import * as path from 'node:path'
import process from 'node:process'
import * as url from 'node:url'
import * as threads from 'node:worker_threads'

import mime from 'mime'

import getConfig, { port } from './config.js'
import { pages as getPages } from './pages.js'
import * as utils from './utils.js'

const serveFilename = url.fileURLToPath(import.meta.url)
const serveDirname = path.dirname(serveFilename)
const workerEntrypoint = path.resolve(serveDirname, 'worker.js')

const apps = []
const sourcesWatchers = {}

process.on('SIGINT', () => {
  for (const app of apps) {
    app.closeAllConnections()
    app.close()
  }
  process.exit(0)
})

/**
 * Serves a folder.
 *
 * @param {string} folder - The folder to build.
 * @param {string} [config] - A specifier that points to the configuration file.
 * @param {boolean} [cache] - Whether to enable caching.
 * @returns {Promise<http.Server>} The server.
 */
export default async function serve(folder, config, cache = true) {
  const root = utils.resolve(folder, undefined, { exists: true, folder: true })
  void cache

  // If no config specified, look for config in the served folder first
  if (!config) {
    const configInFolder = path.join(root, 'pages.config.js')
    if (fs.existsSync(configInFolder)) {
      config = configInFolder
    }
  }

  config = await getConfig(config)
  config.root = root

  const watcher = getPageWatcher(config)
  const workerCountOverride = Number(process.env.PAGES_SERVE_WORKERS)
  const defaultWorkerCount = Math.max(2, Math.min(6, os.cpus().length))
  const parallel = Number.isFinite(workerCountOverride) && workerCountOverride > 0 ? Math.floor(workerCountOverride) : defaultWorkerCount
  const workers = []
  let closing = false
  const createWorkers = (count) => {
    while (workers.length < (count || parallel)) workers.push(createWorker(config, workers))
  }
  createWorkers(parallel)
  setInterval(() => {
    if (!closing) createWorkers()
  }, 2000).unref()

  const requestHandler = getRequestHandler(config, watcher, workers)
  const server = port === '443' ? https.createServer(config.ssl, requestHandler) : http.createServer(requestHandler)
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
    closing = true
    while (workers.length) workers.pop().terminate()
    watcher.then((pageWatcher) => pageWatcher.close())
    close()
  }

  apps.push(app)
  return app
}

/**
 * Creates a worker.
 *
 * @param {import('./config.js').Config} config - The configuration.
 * @param {threads.Worker[]} workers - The workers.
 * @returns {threads.Worker} The worker.
 */
function createWorker(config, workers) {
  const threadWorker = new threads.Worker(workerEntrypoint, { workerData: { config: JSON.stringify(config) } })
  const removeWorker = () => {
    const index = workers.indexOf(threadWorker)
    if (index !== -1) workers.splice(index, 1)
  }
  threadWorker.once('exit', removeWorker)
  const terminate = threadWorker.terminate.bind(threadWorker)
  threadWorker.terminate = () => {
    threadWorker.off('exit', removeWorker)
    removeWorker()
    terminate()
  }
  return threadWorker
}

/**
 * Returns the request handler.
 *
 * @param {import('./config.js').Config} config - The configuration.
 * @param {Promise<{ getPages: import('./pages.js').pages; close: () => void }>} watcher - The watcher.
 * @param {threads.Worker[]} workers - The workers.
 * @param {boolean} cache - Whether to enable caching.
 * @returns {(req: http.IncomingMessage, res: http.ServerResponse) => void} The request handler.
 */
function getRequestHandler(config, watcher, workers) {
  const queuedResolvers = []

  /**
   * Marks a worker as available and wakes one waiter, if any.
   *
   * @param {threads.Worker} worker - The worker to release.
   */
  function releaseWorker(worker) {
    const resolver = queuedResolvers.shift()
    if (resolver) {
      worker.busy = true
      resolver(worker)
      return
    }
    worker.busy = false
  }

  /**
   * @returns {Promise<threads.Worker>} A free worker.
   */
  async function getWorker() {
    const freeWorker = workers.find((entry) => !entry.busy)
    if (freeWorker) {
      freeWorker.busy = true
      return freeWorker
    }
    return new Promise((resolve) => {
      queuedResolvers.push(resolve)
    })
  }

  /**
   * Handles requests.
   *
   * @param {http.IncomingMessage} req - The request.
   * @param {http.ServerResponse} res - The response.
   */
  return async (req, res) => {
    const reqUrl = new URL(req.url, config.baseURI)
    const matchedPage = (await watcher).findByPathname(reqUrl.pathname)
    if (!matchedPage) {
      res.writeHead(404)
      res.end('Not found')
      return
    }

    const queryParams = Object.fromEntries(reqUrl.searchParams.entries())

    const headers = matchedPage.params?.headers || {}
    if (!headers['Content-Type']) headers['Content-Type'] = mime.getType(matchedPage.url.pathname)

    const worker = await getWorker()

    let done = false
    const onMessage = ([type, data]) => {
      if (done) return
      done = true
      if (type === 'content') {
        headers['Content-Length'] = Buffer.byteLength(data)
        res.writeHead(200, headers)
        res.end(data)
        releaseWorker(worker)
      } else if (type === 'stream') {
        headers['Transfer-Encoding'] = 'chunked'
        res.writeHead(200, headers)
        const rs = fs.createReadStream(url.fileURLToPath(matchedPage.fileUrl))
        rs.pipe(res)
        releaseWorker(worker)
      } else {
        res.writeHead(500)
        res.end('Internal server error')
        releaseWorker(worker)
      }
      worker.off('exit', onExit)
    }

    const onExit = (code) => {
      worker.off('message', onMessage)
      if (code === 0 || done) return
      done = true
      res.writeHead(500)
      res.end('Internal server error')
    }

    worker.on('message', onMessage)
    worker.once('exit', onExit)

    // Resolve context before sending to worker (functions can't be serialized)
    const ctxName = queryParams.ctx
    const resolvedCtx = await ((ctxName && config?.js?.contextResolve?.(ctxName)) || undefined)
    const pageWithContext = {
      ...matchedPage,
      params: { ...matchedPage.params, ...queryParams, __resolvedCtx: resolvedCtx },
      cache: undefined,
    }
    worker.postMessage(['pipe', JSON.stringify(pageWithContext)])
  }
}

/**
 * Watches the configuration root for changes and updates the page list.
 *
 * @param {import('./config.js').Config} config - The configuration.
 * @returns {Promise<{ getPages: () => import('./pages.js').Page[]; close: () => void }>} The watcher.
 */
async function getPageWatcher(config) {
  const filter = (page) => page.params?.headers?.['X-Partial'] !== 'true'
  /**
   * @type {import('./pages.js').Page[]}
   */
  let pages = []
  /**
   * @type {Map<string, import('./pages.js').Page>}
   */
  let pagesByPathname = new Map()
  await refreshAll()
  const inProgress = {}
  const watcher = fs.watch(config.root, { recursive: true }, (_unusedEvent, filename) => getPagesUpdate(filename))
  return {
    getPages: () => pages,
    findByPathname: (pathname) => pagesByPathname.get(pathname),
    close: () => watcher.close(),
  }

  function updatePathnameIndex() {
    pagesByPathname = new Map()
    for (const page of pages) {
      if (!pagesByPathname.has(page.url.pathname)) pagesByPathname.set(page.url.pathname, page)
    }
  }

  async function refreshAll() {
    const files = (await Promise.all(utils.getFilesInFolder(config.root))).filter((file) => {
      if (['page', 'htms', 'html'].find((ext) => file.endsWith(`.${ext}`))) return fs.readFileSync(file, { encoding: 'utf-8' }).includes('canonical')
      return !(config.build?.ignore && config.build.ignore.some((pattern) => file.match(new RegExp(pattern))))
    })
    const pagesUpdate = []
    for (const file of files) {
      const filePages = await getPages(file, config)
      for (const page of filePages) if (filter(page)) pagesUpdate.push(page)
    }
    pages = pagesUpdate
    updatePathnameIndex()
  }

  /**
   * Deletes cached pages that depend on the changed file.
   *
   * @param {string} file - The changed file.
   * @param {URL} fileUrl - The changed file URL.
   */
  async function cachebuster(file, fileUrl) {
    const cachMappings = [
      { source: ['.page', '.htms', '.html', '.js', '.json'], target: ['.page', '.htms', '.html'], includeComponents: true },
      { source: ['.css'], target: ['.css'] },
      { source: ['.ts'], target: ['.ts'] },
      { source: ['.js', '.js', '.cjs'], target: ['.js', '.js', '.cjs'] },
    ]
    for (const mapping of cachMappings) {
      if (!mapping.source.find((ext) => file.endsWith(ext))) continue
      for (const targetExt of mapping.target) {
        for (const page of pages) {
          if (!page.cache) continue
          if (page.fileUrl.toString().endsWith(targetExt)) {
            if (mapping.includeComponents !== true) {
              if (page.fileUrl.toString().includes('components')) {
                const [componentFolder] = page.fileUrl.toString().match(/components\/[^/]*/) || []
                if (!componentFolder) continue
                if (!file.includes(componentFolder)) continue
              }
              if (fileUrl.toString().includes('components')) {
                const [componentFolder] = fileUrl.toString().match(/components\/[^/]*/) || []
                if (!componentFolder) continue
                if (!page.fileUrl.toString().includes(componentFolder)) continue
              }
            }
            page.cache = null
          }
        }
      }
    }

    for (const page of pages) {
      if (!page.sources) {
        page.sources = await getPageSources(page)
        for (const source of page.sources) {
          if (sourcesWatchers[source]) continue
          if (source.includes('node_modules') || !fs.existsSync(source)) continue
          const sourceWatcher = fs.watch(source, () => cachebuster(source, url.pathToFileURL(source)))
          sourcesWatchers[source] = sourceWatcher
          sourceWatcher.unref()
        }
      }
      if (page.sources && page.sources.includes(file)) page.cache = null
    }

    /**
     * @param {import('./pages.js').Page} page - The page.
     * @returns {Promise<string[]>} The source files that the page depends on.
     */
    async function getPageSources(page) {
      const arg = path.relative(process.cwd(), config.root)
      const pageUrl = page.url.toString()
      if (!(pageUrl.endsWith('.js') || pageUrl.endsWith('.css'))) return []
      if (pageUrl.endsWith('.map.css') || pageUrl.endsWith('.map.js')) {
        const source = pageUrl.replace(/\.map\.(?<ext>css|js)$/, '.$<ext>')
        const sourcePage = pages.find((p) => p.url.toString() === source)
        if (sourcePage) return [path.resolve(url.fileURLToPath(sourcePage.fileUrl))]
        return []
      }
      const sourceMapUrl = pageUrl.replace(/(?<ext>\.js|\.css)$/, '.map$<ext>')
      const sourceMapPage = pages.find((p) => p.url.toString() === sourceMapUrl)
      if (!sourceMapPage) return []
      try {
        const response = await fetch(sourceMapPage.url)
        if (!response.ok) return []
        const sourceMap = await response.json()
        if (!sourceMap.sources) return []
        return sourceMap.sources.map((source) => {
          if (!source.startsWith(arg)) {
            if (source === '<no source>') return '<no source>'
            return path.resolve(process.cwd(), source)
          }
          let relativePath = source.slice(arg.length)
          while (relativePath.startsWith('/')) relativePath = relativePath.slice(1)
          return path.resolve(config.root, relativePath)
        })
      } catch {
        return []
      }
    }
  }

  /**
   * Handles page updates.
   *
   * @param {string} filename - The changed filename.
   * @returns {Promise<void>}
   */
  async function getPagesUpdate(filename) {
    const file = path.resolve(config.root, filename)
    const fileUrl = url.pathToFileURL(file).toString()
    const isIgnored = config.build?.ignore?.some((pattern) => file.match(new RegExp(pattern)))
    if (isIgnored) return
    if (inProgress[filename]) {
      inProgress[filename] = { repeat: true }
      return
    }
    inProgress[filename] = { repeat: false }
    cachebuster(file, fileUrl)

    if (fs.existsSync(file)) {
      if (fs.statSync(file).isDirectory()) {
        refreshAll()
      } else {
        const pagesUpdate = (await getPages(file, config)).filter(filter)
        pages = [...pages.filter((page) => page.fileUrl.toString() !== fileUrl), ...pagesUpdate]
        updatePathnameIndex()
      }
    } else {
      pages = pages.filter((page) => page.fileUrl.toString() !== fileUrl)
      updatePathnameIndex()
    }

    if (inProgress[filename].repeat) {
      inProgress[filename] = false
      return getPagesUpdate(filename)
    }

    delete inProgress[filename]
  }
}
