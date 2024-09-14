import * as url from 'node:url'
import * as path from 'node:path'
import * as fs from 'node:fs'

/**
 * Resolves a specifier to an absolute path.
 * @param {string} specifier - The specifier to resolve.
 * @param {string[]} [directories] - The directories to search.
 * @returns {string|undefined} The resolved path.
 */
export default function resolve (specifier, directories = []) {
  specifier = specifier.includes('://') ? url.pathToFileURL(specifier).href : specifier
  if (path.isAbsolute(specifier)) return specifier

  for (const directory of directories) {
    if (!directory) continue
    const resolved = path.resolve(directory, ...specifier.split('/'))
    if (fs.existsSync(resolved)) return resolved
  }
}
