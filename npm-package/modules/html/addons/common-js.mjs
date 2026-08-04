import * as fs from 'node:fs'

/**
 * When using the asynchronous load hook, omitting vs providing a source for 'commonjs' has very different effects, see the link below for more details.
 *
 * @param {string} url - The URL returned by the resolve chain
 * @param {{ conditions: string[]; format: string; importAttributes: {} }} context - The context object
 * @param {Function<string, {}>} nextLoad - The subsequent load hook in the chain, or the Node.js default load hook after the last user-supplied load hook
 * @returns {{ format: string; shortCircuit: boolean; source: string }} - The result object
 * @see https://nodejs.org/api/module.html#caveat-in-the-asynchronous-load-hook
 */
export function load(url, context, nextLoad) {
  const result = nextLoad(url, context)
  if (result.format === 'commonjs') result.source ??= fs.readFileSync(new URL(result.responseURL ?? url))
  return result
}
