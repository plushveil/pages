import * as module from 'node:module'
import * as path from 'node:path'
import * as url from 'node:url'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const extensions = ['.html', '.htms', '.page']

module.registerHooks({
  /**
   * @param {string} specifier - The specifier to resolve
   * @param {{ conditions: string[], importAttributes: {}, parentURL: string }} context - The context object
   * @param {Function<string, {}>} nextResolve - The subsequent resolve hook in the chain, or the Node.js default resolve hook after the last user-supplied resolve hook
   * @returns {{ format: string, url: string, importAttributes: {}, shortCircuit: boolean }} - The result object
   * @see https://nodejs.org/api/module.html#resolvespecifier-context-nextresolve
   */
  resolve (specifier, context, nextResolve) {
    if (extensions.some(ext => specifier.endsWith(ext))) {
      const parentPath = url.fileURLToPath(context.parentURL)
      const resolved = path.resolve(path.dirname(parentPath), ...specifier.split('/'))
      const fileUrl = url.pathToFileURL(resolved)
      fileUrl.hash = `${Date.now()}${Math.random()}`
      return {
        format: 'module',
        url: fileUrl.href,
        importAttributes: {
          specifier,
          parentURL: import.meta.url
        },
        shortCircuit: true
      }
    }
    return nextResolve(specifier, context)
  },
  /**
   * @param {string} url - The URL returned by the resolve chain
   * @param {{ conditions: string[], format: string, importAttributes: {} }} context - The context object
   * @param {Function<string, {}>} nextLoad - The subsequent load hook in the chain, or the Node.js default load hook after the last user-supplied load hook
   * @returns {{ format: string, shortCircuit: boolean, source: string }} - The result object
   * @see https://nodejs.org/api/module.html#loadurl-context-nextload
   */
  load (url, context, nextLoad) {
    if (context.importAttributes?.parentURL === import.meta.url) {
      return {
        format: 'module',
        shortCircuit: true,
        source: `
          import * as url from 'node:url'
          import * as path from 'node:path'
          import page from 'page:page'
          import config from 'page:config'
          import api from 'page:api'
          import render from '${path.resolve(__dirname, '..', 'src', 'render.mjs')}'
          const subpage = {
            ...page,
            params: {
              ...page.params,
              __filename: url.fileURLToPath(import.meta.url),
              __dirname: path.dirname(url.fileURLToPath(import.meta.url))
            }
          }
          export default await render(subpage, config, api)
        `
      }
    }

    return nextLoad(url, context)
  }
})
