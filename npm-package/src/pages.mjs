import * as fs from 'node:fs'
import * as path from 'node:path'
import * as url from 'node:url'

import * as css from '../modules/css/css.mjs'
import * as html from '../modules/html/html.mjs'
import * as js from '../modules/js/js.mjs'
import getApi from './api.mjs'
import getConfig from './config.mjs'

const api = await getApi()

/**
 * @typedef {object} Page
 * @property {URL} url - The URL of the page.
 * @property {object} params - Key-value pairs of additional information.
 * @property {URL} [fileUrl] - The file URL. Either `fileUrl` or `content` must be provided.
 * @property {string} [content] - The content. Either `content` or `fileUrl` must be provided.
 * @property {boolean} [root=true] - Whether the page is the root page. Default is `true`
 */

export { default as serve } from './serve.mjs'
export { default as build } from './build.mjs'

/**
 * Retrieves a list of pages from a file.
 *
 * @param {string} file - A specifier that points to the file.
 * @param {string | import('./config.mjs').Config} [config] - A specifier that points to the configuration file or the configuration itself.
 * @param {'html' | 'css' | 'js' | 'other'} [type] - The type of the file. Defaults to the file extension.
 * @returns {Promise<Page[]>} The list of pages.
 */
export async function pages(file, config, type = path.extname(file).slice(1)) {
  file = api.utils.resolve(file)
  config = await getConfig(config)
  if (!config.root) config.root = path.dirname(file)

  switch (type) {
    case 'page':
    case 'htms':
    case 'html':
      return html.pages(file, config, api)

    case 'ts':
    case 'js':
      return js.pages(file, config, api)

    case 'css':
      return css.pages(file, config, api)

    case 'other':
    default:
      break
  }

  return [
    {
      url: new URL(path.relative(config.root, file), config.baseURI),
      params: {
        headers: {
          ETag: fs.statSync(file).mtimeMs.toString(),
        },
      },
      fileUrl: url.pathToFileURL(file),
    },
  ]
}

/**
 * Renders a page.
 *
 * @param {Page} page - A specifier that points to the file or the page itself.
 * @param {string} [config] - A specifier that points to the configuration file.
 * @param {string} [encoding] - The encoding of the file. Defaults to 'utf-8'.
 * @param {'html' | 'js' | 'css' | 'other'} [type] - The type of the file. Defaults to the file extension.
 * @returns {Promise<string>} The rendered page.
 */
export async function render(page, config, encoding, type = undefined) {
  if (typeof page === 'string') page = (await pages(page, config))[0]
  if (typeof page !== 'object') throw new TypeError('The page must be an object.')
  config = await getConfig(config)
  if (!config.root) config.root = path.dirname(url.fileURLToPath(page.fileUrl))

  if (typeof type === 'undefined') type = path.extname(page.fileUrl.pathname).slice(1)
  switch (type) {
    case 'page':
    case 'htms':
    case 'html':
      return html.render(page, config, api)

    case 'js':
    case 'ts':
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
 * Formats a file.
 *
 * @param {string} file - A specifier that points to the file.
 * @param {string | import('./config.mjs').Config} [config] - A specifier that points to the configuration file or the configuration itself.
 * @param {string} [encoding] - The encoding of the file. Defaults to 'utf-8'.
 * @param {"html"} [type] - The type of the file. Defaults to the file extension.
 * @returns {Promise<string | fs.ReadStream>} The list of pages.
 */
export async function format(file, config, encoding = 'utf-8', type = path.extname(file).slice(1)) {
  file = api.utils.resolve(file)
  config = await getConfig(config)
  if (!config.root) config.root = path.dirname(file)

  switch (type) {
    case 'page':
    case 'htms':
    case 'html':
      return html.format(file, config, api)

    case 'other':
    default:
      break
  }

  const rs = fs.createReadStream(file)
  if (encoding) rs.setEncoding(encoding)

  return rs
}

/**
 * Runs a diagnosis on a file.
 *
 * @param {string} file - A specifier that points to the file.
 * @param {string | import('./config.mjs').Config} [config] - A specifier that points to the configuration file or the configuration itself.
 * @param {"html"} [type] - The type of the file. Defaults to the file extension.
 * @returns {Promise<{ message: string; position: { line: number; character: number } }[]>} The list of pages.
 */
export async function diagnose(file, config, type = path.extname(file).slice(1)) {
  file = api.utils.resolve(file)
  config = await getConfig(config)
  if (!config.root) config.root = path.dirname(file)

  switch (type) {
    case 'page':
    case 'htms':
    case 'html':
      return html.diagnose(file, config, api)

    case 'other':
    default:
      break
  }

  return []
}
