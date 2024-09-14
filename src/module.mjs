import * as url from 'node:url'
import * as path from 'node:path'

import * as configurarion from './config/config.mjs'
import resolveSpecifier from '../utils/resolve.mjs'

/**
 * @typedef {Object} InitializeData
 * @property {any[]} arguments - The arguments used to invoke the module loader.
 */

/**
 * @typedef {Object} ResolveContext
 * @property {string[]} conditions - Export conditions of the relevant package.json.
 * @property {Object} importAttributes - An object whose key-value pairs represent the attributes for the module to import.
 * @property {string|undefined} parentURL - The module importing this one, or undefined if this is the Node.js entry point.
 */

/**
 * @typedef {Object} ResolveSpecifierResult
 * @property {string} url - The absolute URL to which this input resolves.
 * @property {string|null|undefined} [format] - A hint to the load hook.
 * @property {Object|undefined} [importAttributes] - The import attributes for caching.
 * @property {boolean|undefined} [shortCircuit=false] - Signals to terminate the chain of resolve hooks.
 */

/**
 * @typedef {Object} LoadContext
 * @property {string[]} conditions - Export conditions of the relevant package.json.
 * @property {string|null|undefined} format - The format optionally supplied by the resolve hook chain.
 * @property {Object} importAttributes - An object whose key-value pairs represent the attributes for the module to import.
 */

/**
 * @typedef {Object} LoadUrlResult
 * @property {string} format - The format of the module (e.g., 'module', 'commonjs').
 * @property {boolean|undefined} shortCircuit - A signal to terminate the chain of load hooks. Default is `false`.
 * @property {string|ArrayBuffer|TypedArray} source - The source code or content for Node.js to evaluate.
 */

/**
 * The configuration.
 * @type {import('./config/config.mjs').Config}
 */
let config

/**
 * Initializes the module.
 * @param {InitializeData} data - The import options.
 */
export async function initialize (data) {
  config = await configurarion.get(data)
  for (const module of config.modules) {
    if (typeof module.initialize === 'function') {
      await module.initialize(data)
    }
  }
}

/**
 * Resolves the specifier.
 * @param {string} specifier - The specifier.
 * @param {import('./utils/getConfig.mjs').ResolveContext} context - The context.
 * @param {function} nextResolve -  The subsequent resolve hook in the chain.
 * @returns {Promise<import('./utils/getConfig.mjs').ResolveSpecifierResult>} The resolved specifier.
 * @see https://nodejs.org/api/module.html#moduleregisterspecifier-parenturl-options
 */
export async function resolve (specifier, context, nextResolve) {
  if (!config) return nextResolve(specifier, context)

  // Parse the specifier for import attributes.
  if (specifier.includes('?') || specifier.includes('#')) {
    const specifierUrl = specifier.includes('://') ? new URL(specifier) : new URL(specifier, 'file://')
    for (const param of specifierUrl.searchParams) context.importAttributes[param[0]] = param[1]
    if (specifierUrl.searchParams.has('format')) context.format = specifierUrl.searchParams.get('format')
    if (specifierUrl.hash) context.importAttributes.hash = specifierUrl.hash.slice(1)
    specifier = (specifier.startsWith('/') || specifier.match(/:\/{3}/)) ? specifierUrl.pathname : specifierUrl.pathname.slice(1)
  }

  // Resolve the specifier to an absolute file path.
  const resolvedSpecifier = resolveSpecifier(specifier, [
    context.parentURL && context.parentURL.startsWith('file://') ? path.dirname(url.fileURLToPath(context.parentURL)) : null,
    config.file ? path.dirname(config.file) : null,
    process.cwd(),
  ])
  if (resolvedSpecifier) {
    const specifierUrl = url.pathToFileURL(resolvedSpecifier)
    for (const attr of Object.entries(context.importAttributes)) specifierUrl.searchParams.set(...attr)
    specifier = specifierUrl.toString()
  }

  const resolvers = [
    ...(config.modules?.map(module => module.resolve).filter(Boolean) || []),
    nextResolve,
  ]

  async function resolve (specifier, context) {
    while (resolvers.length) {
      const resolver = resolvers.shift()
      const result = await resolver(specifier, context, (specifier, context) => resolve(specifier, context))
      if (result) return result
    }
  }

  return resolve(specifier, context)
}

/**
 * Loads the content.
 * @param {string} fileUrl - The file URL.
 * @param {import('./utils/getConfig.mjs').LoadContext} context - The context.
 * @param {function} nextLoad - The subsequent load hook in the chain.
 * @param  {...any} args - The arguments.
 * @returns {Promise<import('./utils/getConfig.mjs').LoadUrlResult>} The loaded content.
 */
export async function load (fileUrl, context, nextLoad) {
  if (!config) return nextLoad(fileUrl, context)

  const loaders = [
    ...(config.modules?.map(module => module.load).filter(Boolean) || []),
    nextLoad,
  ]

  async function load (fileUrl, context) {
    while (loaders.length) {
      const loader = loaders.shift()
      const result = await loader(fileUrl, context, (fileUrl, context) => load(fileUrl, context))
      if (result) return result
    }
  }

  return load(fileUrl, context)
}
