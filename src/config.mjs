import * as url from 'node:url'
import * as path from 'node:path'

import resolve from '../utils/resolve.mjs'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const defaultConfig = path.resolve(__dirname, '..', 'pages.config.mjs')

const defaultConfigNames = [
  'pages.config.mjs',
  'pages.config.js'
]

/**
 * Loads the configuration from the given data.
 * @param {import('./module.mjs').InitializeData} data - The import options.
 * @returns {Promise<import('./config/config.mjs').Config>} The configuration.
 */
export default async function get (data) {
  if (['render', 'sources', 'serve', 'build'].includes(data.arguments[0])) {
    const config = await loadConfig(data.arguments[2])
    return getValidatedConfig(config)
  }
  throw new Error('Invalid arguments.')
}

/**
 * Loads the configuration.
 * @param {string} input - The user provided input.
 * @returns {Promise<import('./config/config.mjs').Config>} The configuration.
 */
async function loadConfig (input = '') {
  if (!input) {
    for (const name of defaultConfigNames) {
      const file = resolve(name, [process.cwd()])
      if (file) return { ...(await import(url.pathToFileURL(file))), file }
    }
    return { ...(await import(defaultConfig)), file: defaultConfig }
  }

  const file = resolve(input, [process.cwd()])
  if (!file) throw new Error(`Configuration file not found: "${input}".`)
  return { ...(await import(url.pathToFileURL(file))), file }
}

/**
 * Validates the configuration.
 * @param {import('./config/config.mjs').Config} config - The configuration.
 * @returns {import('./config/config.mjs').Config} The validated configuration.
 */
function getValidatedConfig (config) {
  // modules
  if (typeof config.modules === 'undefined') config.modules = []
  if (!Array.isArray(config.modules)) throw new Error('Invalid Configuration: "modules" must be an array.')
  for (let i = 0; i < config.modules.length; i++) {
    const module = config.modules[i]
    const moduleName = `Module ${i}`
    if (typeof module !== 'object') throw new Error(`Invalid ${moduleName}: Modules must be objects.`)
    if (module.resolve && typeof module.resolve !== 'function') throw new Error(`Invalid ${moduleName}: "resolve" must be a function.`)
    if (module.load && typeof module.load !== 'function') throw new Error(`Invalid ${moduleName}: "load" must be a function.`)
  }

  // baseURI
  if (typeof config.baseURI === 'undefined') throw new Error('Invalid Configuration: "baseURI" must be provided.')

  return config
}
