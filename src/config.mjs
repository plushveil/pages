import * as path from 'node:path'
import * as url from 'node:url'
import * as fs from 'node:fs'
import * as process from 'node:process'

import * as utils from './utils.mjs'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const __root = path.resolve(__dirname, '..')

const host = process.env.HOST || 'localhost'
const port = String(process.env.PORT || 8080)
const pathname = process.env.PATHNAME || '/'
const protocol = port === '443' ? 'https' : 'http'

/**
 * @typedef {object} Config
 * @property {URL} fileUrl - The file URL of the configuration.
 * @property {URL} baseURI - The base URI of the website.
 * @property {string} [root] - The root page.
 * @property {import('../pages.config.mjs').HtmlConfig} html - Configuration of the html module.
 * @property {import('../pages.config.mjs').JsConfig} js - Configuration of the js module.
 * @property {import('../pages.config.mjs').CssConfig} css - Configuration of the css module.
 * @property {import('node:https').ServerOptions} [ssl] - The SSL options. If port is 443, this is required.
 */

/**
 * Retrieve the configuration from a given location hint.
 * @param {string} file - The name of the configuration.
 * @returns {Promise<Config>} The configuration.
 */
export default async function getConfig (file = 'pages.config.mjs') {
  if (typeof file === 'object' && file) return file
  if (typeof file !== 'string' && file) throw new TypeError('The file must be a string.')

  const filepath = utils.resolve(file, [process.cwd()], { exists: false })
  if (fs.existsSync(filepath)) {
    const fileUrl = url.pathToFileURL(filepath)
    return { ...await import(fileUrl), fileUrl }
  }

  if (file === 'pages.config.mjs') {
    const fileUrl = url.pathToFileURL(path.resolve(__root, 'pages.config.mjs'))
    return { ...await import(fileUrl), fileUrl }
  } else {
    throw new Error(`Cannot find configuration: ${file}`)
  }
}

/**
 * The base URI.
 * @type {URL}
 */
export const baseURI = new URL(pathname, `${protocol}://${host}${port === '80' || port === '443' ? '' : `:${port}`}`)
