import * as path from 'node:path'
import * as url from 'node:url'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Loads the content.
 * @param {string} fileUrl - The URL returned by the resolve chain.
 * @param {import('../../src/module.mjs').LoadContext} context - Context information.
 * @param {function} nextLoad - The subsequent load hook in the chain
 * @returns {import('../../src/module.mjs').LoadUrlResult}
 */
export async function load (fileUrl, context, nextLoad) {
  if (!(fileUrl.startsWith('pages:'))) return

  if (fileUrl === 'pages:info') {
    return {
      format: 'module',
      shortCircuit: true,
      source: `export * from '${url.pathToFileURL(path.resolve(__dirname, 'info.mjs'))}'`,
    }
  }
}
