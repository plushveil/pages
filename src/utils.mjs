import * as process from 'node:process'
import * as path from 'node:path'
import * as url from 'node:url'
import * as fs from 'node:fs'

/**
 * Resolve a specifier to a file path.
 * @param {string} specifier - The specifier.
 * @param {string[]} [folders] - The folders to search.
 * @param {object} [options] - The options.
 * @param {boolean} [options.exists] - Whether the file must exist. Prefers absolute paths and then files that exist.
 * @param {boolean} [options.file] - Whether the file must be a file.
 * @param {boolean} [options.folder] - Whether the file must be a folder.
 * @returns {string} The file path.
 */
export function resolve (specifier, folders = [process.cwd()], options = { exists: true, file: true, folder: false }) {
  if (specifier.startsWith('file://')) specifier = url.fileURLToPath(specifier)
  if (path.isAbsolute(specifier)) {
    if (!options.exists || fs.existsSync(specifier)) return specifier
    if (!options.file || fs.statSync(specifier).isFile()) return specifier
    if (!options.folder || fs.statSync(specifier).isDirectory()) return specifier
    throw new Error(`Cannot resolve specifier "${specifier}". It's a ${fs.statSync(specifier).isDirectory() ? 'folder' : 'file'}.`)
  }

  for (const folder of folders) {
    const file = path.resolve(folder, specifier)
    if (fs.existsSync(file)) {
      if (options.folder && fs.statSync(file).isDirectory()) return file
      if (options.file && fs.statSync(file).isFile()) return file
    }
  }

  if (!options.exists) return path.resolve(folders[0], specifier)
  else throw new Error(`Cannot resolve specifier: ${specifier}`)
}

/**
 * Recursively gets all files in a folder.
 * @param {string} folder - The folder.
 * @returns {string[]} The files.
 */
export function getFilesInFolder (folder) {
  folder = resolve(folder, undefined, { folder: true })
  return fs.readdirSync(folder).reduce((files, file) => {
    const filepath = path.resolve(folder, file)
    if (fs.statSync(filepath).isDirectory()) files.push(...getFilesInFolder(filepath))
    else files.push(filepath)
    return files
  }, [])
}

/**
 * Picks one page from a list of pages that best matches the given page.
 * @param {import('./pages.mjs').Page[]} pages - The list of pages.
 * @param {import('./pages.mjs').Page} page - The page.
 * @returns {import('./pages.mjs').Page} The best matching page.
 */
export function getPageMatch (pages, page) {
  return pages.reduce((scoredPages, p) => {
    const score = Object.entries(p.params || {}).filter(([key, value]) => page.params[key] === value).length
    scoredPages.push({ page: p, score })
    return scoredPages
  }, []).sort((a, b) => b.score - a.score)[0].page
}
