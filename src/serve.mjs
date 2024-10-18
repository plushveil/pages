import * as fs from 'node:fs'
import * as os from 'node:os'
import * as url from 'node:url'
import * as path from 'node:path'
import * as http from 'node:http'
import * as https from 'node:https'
import * as threads from 'node:worker_threads'
import process from 'node:process'

import mime from 'mime'

import { default as getConfig, port } from './config.mjs'
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
 * @param {string} [output] - The output folder.
 * @returns {Promise<http.Server>} The server.
 */
export default async function serve (folder, config, output) {
  config = await getConfig(config)
  config.root = utils.resolve(folder, undefined, { exists: true, folder: true })

  const watcher = await getPageWatcher(config)
  const parallel = os.cpus().length
  const workers = []
  const createWorkers = () => { while (workers.length < parallel) workers.push(createWorker(config, workers)) }
  setInterval(createWorkers, 10000).unref()
  createWorkers()

  const requestHandler = getRequestHandler(config, watcher, workers, createWorker)
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
    watcher.close()
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
 * @param {{ getPages: () => import('./pages.mjs').Page[], close: () => void }} watcher - The watcher.
 * @param {threads.Worker[]} workers - The workers.
 * @returns {(req: http.IncomingMessage, res: http.ServerResponse) => void} The request handler.
 */
function getRequestHandler (config, watcher, workers) {
  /**
   * Handles requests.
   * @param {http.IncomingMessage} req - The request.
   * @param {http.ServerResponse} res - The response.
   */
  return (req, res) => {
    const reqUrl = new URL(req.url, config.baseURI)
    const page = watcher.getPages().find(page => page.url.pathname === reqUrl.pathname)
    if (!page) {
      res.writeHead(404)
      res.end('Not found')
      return
    }

    const worker = workers.shift() || createWorker(config, workers)
    const headers = page.params?.headers || {}
    if (!headers['Content-Type']) headers['Content-Type'] = mime.getType(page.url.pathname)

    let done = false
    worker.on('message', ([type, data]) => {
      if (done) return
      done = true
      if (type === 'content') {
        headers['Content-Length'] = Buffer.byteLength(data)
        res.writeHead(200, headers)
        res.end(data)
      } else if (type === 'stream') {
        headers['Transfer-Encoding'] = 'chunked'
        res.writeHead(200, headers)
        const rs = fs.createReadStream(url.fileURLToPath(page.fileUrl))
        rs.pipe(res)
      } else {
        res.writeHead(500)
        res.end('Internal server error')
      }
      worker.terminate()
    })

    worker.on('exit', (code) => {
      if (code === 0 || done) return
      done = true
      res.writeHead(500)
      res.end('Internal server error')
    })

    worker.postMessage(['pipe', JSON.stringify(page)])
  }
}

/**
 * Watches the configuration root for changes and updates the page list.
 * @param {import('./config.mjs').Config} config - The configuration.
 * @returns {Promise<{ getPages: () => import('./pages.mjs').Page[], close: () => void }>} The watcher.
 */
async function getPageWatcher (config) {
  const filter = (page) => page.params?.headers?.['X-Partial'] !== 'true'
  let pages = (await Promise.all(utils.getFilesInFolder(config.root).map(file => getPages(file, config)))).flat().filter(filter)

  const watcher = fs.watch(config.root, { recursive: true }, async (event, filename) => {
    const file = path.resolve(config.root, filename)
    const fileUrl = url.pathToFileURL(file).toString()

    if (fs.existsSync(file)) {
      const pagesUpdate = (await getPages(file, config)).filter(filter)
      pages = pages.filter(page => page.fileUrl.toString() !== fileUrl)
      pages.push(...pagesUpdate)
    } else {
      pages = pages.filter(page => page.fileUrl.toString() !== fileUrl)
    }
  })

  return { getPages: () => pages, close: () => watcher.close() }
}
