import * as path from 'node:path'
import * as url from 'node:url'
import * as fs from 'node:fs'
import * as cmd from 'node:child_process'

import getConfig from '../../src/config.mjs'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let config

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
  if (!(specifier.startsWith('file://') && specifier.endsWith('.css'))) return
  if (specifier.includes('node_modules')) return
  return {
    url: specifier,
    format: 'css-module',
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
  if (context.format !== 'css-module') return
  return {
    format: 'module',
    shortCircuit: true,
    source: [
      `import * as css from '${url.pathToFileURL(path.resolve(__dirname, 'css-api.mjs')).href}'`,
      `const config = ${config}`,
      `export default async function (page) { return css.default(page || '${fileUrl}', config) }`,
      `export async function getSources (page) { return css.getSources(page || '${fileUrl}', config) }`,
      `export async function getPages () { return css.getPages('${fileUrl}', config) }`,
    ].join('\n'),
  }
}
