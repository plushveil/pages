import * as path from 'node:path'
import * as url from 'node:url'
import * as fs from 'node:fs'
import * as cmd from 'node:child_process'

import getConfig from '../../src/config.mjs'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let config

/**
 * @typedef {object} JSConfig
 * @property {boolean} [minify] - Whether to minify the JavaScript.
 * @property {string} [target] - The path to the browserlist.
 */

/**
 * Initializes the module.
 * @param {import('../../src/module.mjs').InitializeData} data - The import options.
 */
export async function initialize (data) {
  config = JSON.stringify(await getConfig(data))

  if (!fs.existsSync(path.resolve(__dirname, 'node_modules'))) {
    cmd.execSync('npm install', { cwd: __dirname, stdio: 'ignore' })
  }
}

/**
 * Resolves the specifier.
 * @param {string} specifier - The string passed to the import statement.
 * @param {import('../../src/module.mjs').ResolveContext} context - Context information.
 * @param {function} nextResolve - The subsequent resolve hook in the chain
 * @returns {import('../../src/module.mjs').ResolveSpecifierResult}
 */
export async function resolve (specifier, context, nextResolve) {
  if (!(specifier.startsWith('file://') && specifier.endsWith('.js'))) return
  if (specifier.includes('node_modules')) return
  return {
    url: specifier,
    format: 'js-module',
    shortCircuit: true,
  }
}

/**
 * Loads the content.
 * @param {string} fileUrl - The URL returned by the resolve chain.
 * @param {import('../../src/module.mjs').LoadContext} context - Context information.
 * @param {function} nextLoad - The subsequent load hook in the chain
 * @returns {import('../../src/module.mjs').LoadUrlResult}
 */
export async function load (fileUrl, context, nextLoad) {
  if (context.format !== 'js-module') return
  return {
    format: 'module',
    shortCircuit: true,
    source: [
      `import * as js from '${url.pathToFileURL(path.resolve(__dirname, 'js-api.mjs')).href}'`,
      `const config = ${config}`,
      `export default async function (page) { return js.default(page || '${fileUrl}', config) }`,
      `export async function getSources (page) { return js.getSources(page || '${fileUrl}', config) }`,
      `export async function getPages () { return js.getPages('${fileUrl}', config) }`,
    ].join('\n'),
  }
}
