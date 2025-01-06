import * as path from 'node:path'
import * as url from 'node:url'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * @typedef {object} ResolveContext
 * @property {string[]} conditions - Export conditions of the relevant package.json.
 * @property {object} importAttributes - An object whose key-value pairs represent the attributes for the module to import.
 * @property {string|undefined} parentURL - The module importing this one, or undefined if this is the Node.js entry point.
 */

/**
 * @typedef {object} ResolveSpecifierResult
 * @property {string} url - The absolute URL to which this input resolves.
 * @property {string|null|undefined} [format] - A hint to the load hook.
 * @property {object|undefined} [importAttributes] - The import attributes for caching.
 * @property {boolean|undefined} [shortCircuit=false] - Signals to terminate the chain of resolve hooks.
 */

/**
 * Resolves the specifier.
 * @param {string} specifier - The specifier.
 * @param {ResolveContext} context - The context.
 * @param {Function} nextResolve -  The subsequent resolve hook in the chain.
 * @returns {Promise<ResolveSpecifierResult>} The resolved specifier.
 * @see https://nodejs.org/api/module.html#moduleregisterspecifier-parenturl-options
 */
export async function resolve (specifier, context, nextResolve) {
  if (!(specifier.includes('pages-module-html-evaluate'))) return nextResolve(specifier, context)

  try {
    const url = new URL(specifier)
    if (url.searchParams.get('format') === 'pages-module-html-evaluate') {
      return {
        url: specifier,
        format: 'pages-module-html-evaluate',
        shortCircuit: true
      }
    } else if (url.searchParams.get('format') === 'pages-module-html-evaluate-template-literals') {
      return {
        url: specifier,
        format: 'pages-module-html-evaluate-template-literals',
        shortCircuit: true
      }
    }
  } catch (err) {}

  return nextResolve(specifier, context)
}

/**
 * @typedef {object} LoadContext
 * @property {string[]} conditions - Export conditions of the relevant package.json.
 * @property {string|null|undefined} format - The format optionally supplied by the resolve hook chain.
 * @property {object} importAttributes - An object whose key-value pairs represent the attributes for the module to import.
 */

/**
 * @typedef {object} LoadUrlResult
 * @property {"module"|"commonjs"} format - The format of the module (e.g., 'module', 'commonjs').
 * @property {boolean|undefined} shortCircuit - A signal to terminate the chain of load hooks. Default is `false`.
 * @property {string|ArrayBuffer} source - The source code or content for Node.js to evaluate.
 */

/**
 * Loads the content.
 * @param {string} fileUrl - The file URL.
 * @param {LoadContext} context - The context.
 * @param {Function} nextLoad - The subsequent load hook in the chain.
 * @returns {Promise<LoadUrlResult>} The loaded content.
 */
export async function load (fileUrl, context, nextLoad) {
  if (context?.format === 'pages-module-html-evaluate') {
    const url = new URL(fileUrl)
    const source = url.searchParams.get('code') ?? Buffer.from(url.pathname.slice('application/javascript;base64,'.length), 'base64').toString()
    const env = getEnvironmentImport(url.searchParams.get('env') ? JSON.parse(url.searchParams.get('env')) : undefined)

    // A preflight happens when the canonical url is evaluated.
    // script tags that rely on params should not be executed just yet.
    const isPreflight = !(env.includes('params')) && source.includes('params')

    return {
      format: 'module',
      source: isPreflight ? '' : (env + source),
      shortCircuit: true
    }
  } else if (context?.format === 'pages-module-html-evaluate-template-literals') {
    const evalModule = url.pathToFileURL(path.resolve(__dirname, 'eval.mjs'))
    return {
      format: 'module',
      source: `export { default as default, evaluate as evaluate } from '${evalModule}'`,
      shortCircuit: true
    }
  }

  return nextLoad(fileUrl, context)
}

/**
 * Retrieves the environment import.
 * @param {object} env - The environment.
 * @returns {string} The environment import.
 */
function getEnvironmentImport (env = {}) {
  const keys = Object.keys(env)
  if (keys.length === 0) return ''
  const code = keys.map(key => `export const ${key} = ${JSON.stringify(env[key])}`).join('\n')
  return `import { ${keys.join(', ')} } from 'data:application/javascript;base64,${Buffer.from(code).toString('base64')}'\n`
}
