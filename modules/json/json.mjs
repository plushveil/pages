import * as url from 'node:url'
import * as fs from 'node:fs'

/**
 * Loads the content.
 * @param {string} fileUrl - The URL returned by the resolve chain.
 * @param {import('../../src/module.mjs').LoadContext} context - Context information.
 * @param {function} nextLoad - The subsequent load hook in the chain
 * @returns {import('../../src/module.mjs').LoadUrlResult}
 */
export async function load (fileUrl, context, nextLoad) {
  const filepath = fileUrl.startsWith('file://') && url.fileURLToPath(fileUrl)
  if (filepath && filepath.endsWith('.json') && fs.existsSync(filepath)) {
    return {
      format: 'module',
      source: `export default ${fs.readFileSync(filepath, { encoding: 'utf8' })}`,
      shortCircuit: true,
    }
  }
}
