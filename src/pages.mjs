import * as path from 'node:path'
import * as url from 'node:url'
import * as module from 'node:module'

import app from './serve.mjs'
import buildAllPages from './build.mjs'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const moduleFile = path.resolve(__dirname, 'module.mjs')

/**
 * @typedef {object} Page
 * @property {string} file - The input file.
 * @property {string} path - The output path.
 * @property {object} [params={}] - The parameters.
 */

/**
 * Runs a web server to serve a folder.
 * @param {string} folder - The folder to serve.
 * @param {string} [config] - The configuration file.
 */
export function serve (folder, config) {
  module.register(url.pathToFileURL(moduleFile), { parentURL: import.meta.url, data: { arguments: ['serve', folder, config] } })
  return app({ folder, config })
}

/**
 * Builds a folder.
 * @param {string} folder - The folder to build.
 * @param {string} [config] - The configuration file.
 */
export function build (folder, config) {
  module.register(url.pathToFileURL(moduleFile), { parentURL: import.meta.url, data: { arguments: ['build', folder, config] } })
  return buildAllPages({ folder, config })
}

/**
 * Parses a page and returns the evaluated content.
 * @param {string} file - The file to parse.
 * @param {string} [config] - The configuration file.
 */
export async function render (file, config) {
  module.register(url.pathToFileURL(moduleFile), { parentURL: import.meta.url, data: { arguments: ['render', file, config] } })
  const render = (await import(file)).default
  console.log(typeof render === 'function' ? await render() : render)
}

/**
 * Prints a list of pages a file can generate.
 * @param {string} file - The file to parse.
 * @param {string} [config] - The configuration file.
 */
export async function pages (file, config) {
  module.register(url.pathToFileURL(moduleFile), { parentURL: import.meta.url, data: { arguments: ['pages', file, config] } })
  const getPages = (await import(file)).getPages
  console.log(typeof getPages === 'function' ? await getPages() : getPages)
}
