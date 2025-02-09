import * as url from 'node:url'
import * as path from 'node:path'
import * as module from 'node:module'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const __root = path.resolve(__dirname, '..', '..', '..')

/**
 * @param {import('../../../src/pages.mjs').Page} page - The page.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../../src/api.mjs').API} api - The API.
 * @param {string} code - The code.
 * @param {string[]} context - The contexts.
 * @returns {Promise<any>} The result.
 */
export async function get (page, config, api, code, context) {
  const file = page.params?.headers?.['X-Partial-File']
  const fileUrl = file ? url.pathToFileURL(file) : page.fileUrl

  let active = true
  module.registerHooks({
    /**
     * @param {string} specifier The specifier.
     * @param {{ conditions: string[], importAttributes: Record<string, string>, parentURL: string}} context The context.
     * @param {(specifier: string, context: { conditions: string[], importAttributes: Record<string, string>, parentURL: string }) => Promise<any>} nextResolve The next resolve function.
     * @returns {{ format: string, importAttributes: Record<string, string>, url: string, shortCircuit: boolean }} The URL.
     */
    resolve (specifier, context, nextResolve) {
      if (active && specifier.startsWith('page:')) {
        return {
          format: 'page',
          url: page.fileUrl.toString() + '#' + specifier.slice(5) + `|${Date.now()}${Math.random()}`,
          shortCircuit: true
        }
      }
      return nextResolve(specifier, context)
    },
    /**
     * @param {string} fileUrl The URL.
     * @param {{ conditions: string[], format: string, importAttributes: Record<string, string>}} context The context.
     * @param {(url: string, context: { conditions: string[], format: string, importAttributes: Record<string, string> }) => Promise<any>} nextLoad The next load function.
     * @returns {{ format: string, shortCircuit: boolean, source: string }} The source.
     */
    load (fileUrl, context, nextLoad) {
      if (active && context.format === 'page') {
        const [topic] = fileUrl.slice(fileUrl.lastIndexOf('#') + 1).split('|')

        let source
        if (topic === 'config') {
          source = `
            import getConfig from '${url.pathToFileURL(path.resolve(__root, 'src', 'config.mjs'))}'
            export default getConfig('${config.fileUrl.toString()}')
          `
        }

        if (topic === 'info') {
          source = `
            import pageFromObj from '${url.pathToFileURL(path.resolve(__dirname, '..', 'utils', 'pageFromObj.mjs'))}'
            export default pageFromObj(${JSON.stringify(page)})
          `
        }

        return {
          format: 'module',
          source,
          shortCircuit: true
        }
      }
      return nextLoad(fileUrl, context)
    }
  })
  const pageApi = await import(fileUrl)
  let values = await pageApi.get(code, context)

  // a module was imported
  if (typeof values === 'object' && values && Object.prototype.toString.call(values) === '[object Module]') {
    values = typeof values.default === 'function' ? await values.default({}, page, config) : values.default
  }

  active = false
  return values
}
