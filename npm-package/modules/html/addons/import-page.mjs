import * as module from 'node:module'

const submodules = ['page', 'config', 'api', 'args']

global.context = {}

/**
 * beforeAsync is executed before the page is interpreted.
 * @param {import('../parser/iterator.mjs').Iterator} iterator - The iterator
 * @param {import('../parser/parse.mjs').HTMLDocument} htmlDocument - The HTML document.
 * @param {import('../../../src/pages.mjs').Page} page - The page.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../../src/api.mjs').API} api - The API.
 */
export async function beforeAsync (iterator, htmlDocument, page, config, api) {
  global.context = { page, config, api }
}

module.registerHooks({
  /**
   * @param {string} specifier - The specifier to resolve
   * @param {{ conditions: string[], importAttributes: {}, parentURL: string }} context - The context object
   * @param {Function<string, {}>} nextResolve - The subsequent resolve hook in the chain, or the Node.js default resolve hook after the last user-supplied resolve hook
   * @returns {{ format: string, url: string, importAttributes: {}, shortCircuit: boolean }} - The result object
   * @see https://nodejs.org/api/module.html#resolvespecifier-context-nextresolve
   */
  resolve (specifier, context, nextResolve) {
    if (submodules.find(submodule => specifier === `page:${submodule}`)) {
      const hash = (new URL(context.parentURL)).hash || `#${Date.now()}${Math.random()}`
      const url = specifier + `${hash}`
      return { format: 'module', url, importAttributes: { specifier: url, ...context.importAttributes }, shortCircuit: true }
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
    if (url.startsWith('page:args')) {
      const ids = url.slice(url.lastIndexOf('#')).split('|').reverse()
      const id = ids.find(id => `${id}` in global.importAttributes) || ('#' + (ids.find(id => `#${id}` in global.importAttributes) || ''))
      if (id === '#') return { format: 'module', shortCircuit: true, source: `export default {}` }
      const i = global.importAttributes[id].length - 1
      return { format: 'module', shortCircuit: true, source: `export default global.importAttributes['${id}']?.[${i}] || {}` }
    }
    for (const key of submodules) {
      if (url.startsWith(`page:${key}`)) {
        return {
          format: 'module',
          shortCircuit: true,
          source: `export default global.context.${key}`
        }
      }
    }

    return nextLoad(url, context)
  }
})
