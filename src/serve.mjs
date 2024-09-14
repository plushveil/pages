import * as path from 'node:path'
import * as url from 'node:url'
import * as http from 'node:http'
import * as https from 'node:https'
import * as fs from 'node:fs'

import mime from 'mime'

import resolve from '../utils/resolve.mjs'
import readDir from '../utils/readDir.mjs'

import getConfig from './config.mjs'

/**
 * Runs a web server to serve a folder.
 * @param {object} [options={}] - The options object.
 * @param {string} options.folder - The folder to serve.
 * @param {string} [options.config] - The configuration file.
 * @returns {Promise<http.Server>} The server.
 */
export default async function serve (options = {}) {
  const config = await getConfig({ arguments: ['serve', options.folder, options.config] })
  const folder = resolve(options.folder, [process.cwd(), path.dirname(config.file)])
  if (!folder) throw new Error(`Folder not found: "${options.folder}".`)

  const [pages, partials, close] = await watchDir(folder)

  if (config.baseURI.protocol === 'https:') {
    if (!config.ssl) throw new Error('SSL configuration is missing.')
    if (!config.ssl.key) throw new Error('SSL key is missing.')
    if (!config.ssl.cert) throw new Error('SSL certificate is missing.')
  }

  const server = config.baseURI.protocol === 'https:'
    ? https.createServer(config.ssl, (req, res) => response(req, res, config, pages, partials, folder))
    : http.createServer((req, res) => response(req, res, config, pages, partials, folder))

  const app = await new Promise((resolve, reject) => {
    const app = server.listen(config.baseURI.port, config.baseURI.hostname, (err) => err ? reject(err) : resolve(app))
  })

  console.log(`Server running at ${config.baseURI.href}`)
  const appClose = app.close.bind(app)
  app.close = () => { close(); return appClose() }

  return app
}

/**
 * Returns a request handler for the given folder and pages.
 * @param {http.IncomingMessage} request - The request.
 * @param {http.ServerResponse} response - The response.
 * @param {import('./config/config.mjs').Config} config - The configuration object.
 * @param {import('./pages.mjs').Page[]} pages - The pages.
 * @param {import('./pages.mjs').Page[]} partials - The partials.
 * @param {string} folder - The folder.
 * @returns {Promise<function>} The request handler.
 */
async function response (request, response, config, pages, partials, folder) {
  const { pathname } = new url.URL(request.url, 'http://localhost')
  const page = pages.find(page => (page.path === pathname)) || pages.find(page => {
    let pagePage = page.path
    let requestPath = pathname
    if (pagePage.endsWith('.html')) pagePage = pagePage.slice(0, -5)
    if (requestPath.endsWith('.html')) requestPath = requestPath.slice(0, -5)
    if (pagePage.endsWith('index')) pagePage = pagePage.slice(0, -5)
    if (requestPath.endsWith('index')) requestPath = requestPath.slice(0, -5)
    while (pagePage.endsWith('/')) pagePage = pagePage.slice(0, -1)
    while (requestPath.endsWith('/')) requestPath = requestPath.slice(0, -1)
    if (pagePage === requestPath) return true
    return false
  })

  if (!page) {
    const file = path.resolve(folder, ...pathname.split('/'))

    if (config.serve?.partials !== true) {
      const partial = partials.find(partial => partial.file === file)
      if (partial) {
        response.writeHead(404, 'Not found', { 'Content-Type': 'application/json' })
        response.end('{ "type": "error", "error": { "code": 404, "message": "Not found" } }')
        return
      }
    }

    if (file.startsWith(folder) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      const type = mime.getType(file) || 'application/octet-stream'
      response.writeHead(200, 'OK', { 'Content-Type': type })
      fs.createReadStream(file).pipe(response)
      return
    }

    response.writeHead(404, 'Not found', { 'Content-Type': 'application/json' })
    response.end('{ "type": "error", "error": { "code": 404, "message": "Not found" } }')
    return
  }

  try {
    const render = (await import(url.pathToFileURL(page.file).href)).default
    const content = await render(page)
    const type = (page.path.includes('.') ? mime.getType(page.path) : 'text/html') || 'application/octet-stream'
    response.writeHead(200, 'OK', { 'Content-Type': type })
    response.end(content)
  } catch (err) {
    console.error(err)
    response.writeHead(500, 'Internal server error', { 'Content-Type': 'application/json' })
    response.end('{ "type": "error", "error": { "code": 500, "message": "Internal server error" } }')
  }
}

/**
 * Watches a folder for pages and partials.
 * @param {string} folder - The folder to watch.
 * @returns {Promise<[import('./pages.mjs').Page[], import('./pages.mjs').Page[]]>} The pages and partials.
 */
async function watchDir (folder) {
  const pages = []
  const partials = []

  const files = await readDir(folder)
  for (const file of files) {
    try {
      const filePages = await (await import(url.pathToFileURL(file).href)).getPages?.()
      if (Array.isArray(filePages)) {
        pages.push(...filePages.filter(page => !!(page?.path)))
        partials.push(...filePages.filter(page => !(page?.path)))
      }
    } catch (err) {
      if (err.message.startsWith('Unknown file extension')) continue
      else throw err
    }
  }

  const pageFilter = (pages) => {
    const uniquePages = []
    for (const page of pages.reverse()) {
      if (uniquePages.find(uniquePage => uniquePage.path === page.path)) continue
      uniquePages.push(page)
    }
    pages.splice(0, pages.length, ...uniquePages)
  }

  const watchers = []
  async function watchDirectory (directory) {
    const watcher = fs.watch(directory, { recursive: true }, async (event, filename) => {
      try {
        const filepath = path.resolve(directory, filename)
        if (fs.existsSync(filepath)) {
          const filePages = await (await import(url.pathToFileURL(filepath).href)).getPages?.()
          if (Array.isArray(filePages)) {
            pageFilter(pages.push(...filePages.filter(page => !!(page?.path))))
            pageFilter(partials.push(...filePages.filter(page => !(page?.path))))
          }
        } else {
          for (const page of pages.filter(page => page.file === filepath)) pages.splice(pages.indexOf(page), 1)
          for (const partial of partials.filter(partial => partial.file === filepath)) partials.splice(partials.indexOf(partial), 1)
        }
      } catch (err) {}
    })
    watchers.push(watcher)
  }

  const directories = [folder, ...files.map(file => path.dirname(file))].filter((dir, i, arr) => arr.indexOf(dir) === i)
  for (const directory of directories) await watchDirectory(directory)

  const close = () => {
    for (const watcher of watchers) watcher.close()
  }

  return [pages, partials, close]
}
