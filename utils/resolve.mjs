import * as url from 'node:url'
import * as path from 'node:path'
import * as fs from 'node:fs'

/**
 * Resolves a specifier to an absolute path.
 * @param {string} specifier - The specifier to resolve.
 * @param {string[]} [directories] - The directories to search.
 * @param {object} [options={}] - The options.
 * @param {boolean} [options.exists=true] - Whether the path must exist.
 * @returns {string|undefined} The resolved path.
 */
export default function resolve (specifier, directories = [], options = {}) {
  specifier = specifier.includes('://') ? url.pathToFileURL(specifier).href : specifier
  if (path.isAbsolute(specifier)) return specifier

  for (const directory of directories) {
    if (!directory) continue
    const resolved = path.resolve(directory, ...specifier.split('/'))
    if (options?.exists === false || fs.existsSync(resolved)) return resolved
  }
}
