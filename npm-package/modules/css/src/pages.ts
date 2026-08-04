import * as path from 'node:path'
import * as url from 'node:url'

/**
 * Retrieves a list of pages from a file.
 *
 * @param {string} file - The file.
 * @param {import('../../../src/config.js').Config} config - The configuration.
 * @param {import('../../../src/pages.js')} api - The API.
 * @returns {Promise<import('../../../src/pages.js').Page[]>} The list of pages.
 */
export default async function pages(file, config, _api) {
  const filepath = path.relative(config.root, file).replaceAll(path.sep, '/').replaceAll('../', '')

  const src = {
    url: new URL(filepath, config.baseURI),
    params: {
      headers: {
        'Content-Type': 'text/css',
      },
    },
    fileUrl: url.pathToFileURL(file),
  }

  const map = {
    url: filepath.endsWith('.css') ? new URL(filepath.replace(/\.css$/, '.map.css'), config.baseURI) : new URL(`${filepath}.map`, config.baseURI),
    params: {
      headers: {
        'Content-Type': 'application/json',
      },
    },
    fileUrl: url.pathToFileURL(file),
  }

  return [src, map]
}
