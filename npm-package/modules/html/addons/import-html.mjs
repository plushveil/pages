import * as fs from 'node:fs'
import * as module from 'node:module'
import * as path from 'node:path'
import * as url from 'node:url'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const extensions = ['.html', '.htms', '.page', '.svg']

global.importAttributes = global.importAttributes || {}

module.registerHooks({
  /**
   * @param {string} specifier - The specifier to resolve
   * @param {{ conditions: string[]; importAttributes: {}; parentURL: string }} context - The context object
   * @param {Function<string, {}>} nextResolve - The subsequent resolve hook in the chain, or the Node.js default resolve hook after the last user-supplied resolve hook
   * @returns {{ format: string; url: string; importAttributes: {}; shortCircuit: boolean }} - The result object
   * @see https://nodejs.org/api/module.html#resolvespecifier-context-nextresolve
   */
  resolve(specifier, context, nextResolve) {
    if (extensions.some((ext) => specifier.endsWith(ext))) {
      const parentPath = url.fileURLToPath(context.parentURL)
      const resolved = path.resolve(path.dirname(parentPath), ...specifier.split('/'))
      if (fs.existsSync(resolved)) {
        const fileUrl = url.pathToFileURL(resolved)
        const hash = new URL(context.parentURL).hash || `#${Date.now()}${Math.random()}`
        fileUrl.hash = hash
        return {
          format: 'module',
          url: fileUrl.href,
          importAttributes: {
            ...context.importAttributes,
            specifier,
            parentURL: import.meta.url,
          },
          shortCircuit: true,
        }
      }
    }
    return nextResolve(specifier, context)
  },
  /**
   * @param {string} url - The URL returned by the resolve chain
   * @param {{ conditions: string[]; format: string; importAttributes: {} }} context - The context object
   * @param {Function<string, {}>} nextLoad - The subsequent load hook in the chain, or the Node.js default load hook after the last user-supplied load hook
   * @returns {{ format: string; shortCircuit: boolean; source: string }} - The result object
   * @see https://nodejs.org/api/module.html#loadurl-context-nextload
   */
  load(url, context, nextLoad) {
    if (context.importAttributes?.parentURL === import.meta.url) {
      const keys = new URL(url).hash.split('|').filter(Boolean)
      const key = keys[keys.length - 1]
      global.importAttributes[key] = global.importAttributes[key] || []
      global.importAttributes[key].push(context.importAttributes)
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
            importAttributes: '${key}',
            params: {
              ...page.params,
              headers: {
                ...page.params.headers,
                'X-Partial': 'true'
              },
              __filename: url.fileURLToPath(import.meta.url),
              __dirname: path.dirname(url.fileURLToPath(import.meta.url)),
            }
          }
          const renderPromise = render(subpage, config, api)
          renderPromise.then(() => {
            global.importAttributes['${key}'].pop()
            if (global.importAttributes['${key}'].length === 0) delete global.importAttributes['${key}']
          })
          export default await renderPromise
        `,
      }
    }

    return nextLoad(url, context)
  },
})
