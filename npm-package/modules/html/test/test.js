import * as module from 'node:module'

module.registerHooks({
  /**
   * @param {string} specifier - The specifier to resolve
   * @param {{ conditions: string[], importAttributes: {}, parentURL: string }} context - The context object
   * @param {Function<string, {}>} nextResolve - The subsequent resolve hook in the chain, or the Node.js default resolve hook after the last user-supplied resolve hook
   * @returns {{ format: string, url: string, importAttributes: {}, shortCircuit: boolean }} - The result object
   * @see https://nodejs.org/api/module.html#resolvespecifier-context-nextresolve
   */
  resolve (specifier, context, nextResolve) {
    if (specifier === 'page:page') {
      const url = specifier + `?${Date.now()}${Math.random()}`
      return {
        format: 'module',
        url,
        importAttributes: { specifier: url },
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
    if (url.startsWith('page:page')) {
      return {
        format: 'module',
        shortCircuit: true,
        source: 'export default Date.now()'
      }
    }
    return nextLoad(url, context)
  }
})

console.log(await import('page:page'))
console.log(await import('page:page'))
