import * as path from 'node:path'

import getConfig from './config.mjs'

import resolve from '../utils/resolve.mjs'
import readDir from '../utils/readDir.mjs'

/**
 * @typedef {object} BuildConfig
 * @property {string} output - The output folder.
 */

/**
 * Builds a folder.
 * @param {object} options - The options.
 * @param {string} options.folder - The folder to build.
 * @param {string} [options.config] - The configuration file.
 * @returns {Promise<void>} A promise that resolves when the folder is built.
 */
export default async function build (options) {
  const config = await getConfig({ arguments: ['build', options.folder, options.config] })
  const folder = resolve(options.folder, [process.cwd(), path.dirname(config.file)])
  if (!folder) throw new Error(`Folder not found: "${options.folder}".`)

  const output = resolve(config.build?.output || './dist', [path.dirname(config.file), process.cwd(), path.dirname(config.file)], { exists: false })
  console.log(await readDir(folder))
}
