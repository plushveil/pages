import * as url from 'node:url'
import * as path from 'node:path'
import * as fs from 'node:fs'

import getConfig from './config.mjs'
import * as utils from './utils.mjs'

import * as html from '../modules/html/html.mjs'
import * as js from '../modules/js/js.mjs'
import * as css from '../modules/css/css.mjs'

/**
 * @typedef {object} Page
 * @property {URL} url - The URL of the page.
 * @property {object} params - Key-value pairs of additional information.
 * @property {string} [fileUrl] - The file URL. Either `fileUrl` or `content` must be provided.
 * @property {string} [content] - The content. Either `content` or `fileUrl` must be provided.
 * @property {boolean} [root=true] - Whether the page is the root page.
 */

/**
 * @typedef {object} API
 * @property {import('./pages.mjs').pages} pages - Retrieves a list of pages from a file.
 * @property {import('./pages.mjs').render} render - Renders a page.
 * @property {import('./utils.mjs')} utils - The utilities.
 */

export { default as serve } from './serve.mjs'
export { default as build } from './build.mjs'

/**
 * Retrieves a list of pages from a file.
 * @param {string} file - A specifier that points to the file.
 * @param {string|import('./config.mjs').Config} [config] - A specifier that points to the configuration file or the configuration itself.
 * @param {"html"|"css"|"js"|"other"} [type] - The type of the file. Defaults to the file extension.
 * @returns {Promise<Page[]>} The list of pages.
 */
export async function pages (file, config, type) {
  file = utils.resolve(file)
  config = await getConfig(config)
  if (!config.root) config.root = path.dirname(file)
  const api = await getApi()

  switch (type || path.extname(file).slice(1)) {
    case 'html':
      return html.pages(file, config, api)

    case 'js':
      return js.pages(file, config, api)

    case 'css':
      return css.pages(file, config, api)

    case 'other':
    default:
      break
  }

  return [{
    url: new URL(path.relative(config.root, file), config.baseURI),
    params: {},
    fileUrl: url.pathToFileURL(file),
  }]
}

/**
 * Renders a page.
 * @param {Page} page - A specifier that points to the file or the page itself.
 * @param {string} [config] - A specifier that points to the configuration file.
 * @param {string} [encoding] - The encoding of the file. Defaults to 'utf-8'.
 * @param {"html"|"js"|"css"|"other"} [type] - The type of the file. Defaults to the file extension.
 * @returns {Promise<string>} The rendered page.
 */
export async function render (page, config, encoding = 'utf-8', type) {
  if (typeof page === 'string') page = (await pages(page, config))[0]
  if (typeof page !== 'object') throw new TypeError('The page must be an object.')
  config = await getConfig(config)
  if (!config.root) config.root = path.dirname(url.fileURLToPath(page.fileUrl))
  const api = await getApi()

  switch (type || path.extname(url.fileURLToPath(page.fileUrl)).slice(1)) {
    case 'html':
      return html.render(page, config, api)

    case 'js':
      return js.render(page, config, api)

    case 'css':
      return css.render(page, config, api)

    case 'other':
    default:
      break
  }

  const rs = fs.createReadStream(url.fileURLToPath(page.fileUrl))
  if (encoding) rs.setEncoding(encoding)

  return rs
}

/**
 * Retrieve the API.
 * @returns {Promise<API>} The API.
 */
async function getApi () {
  return { pages, render, utils }
}
