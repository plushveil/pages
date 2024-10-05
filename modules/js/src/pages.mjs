import * as path from 'node:path'
import * as url from 'node:url'

/**
 * Retrieves a list of pages from a file.
 * @param {string} file - The file.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../../src/pages.mjs')} api - The API.
 * @returns {Promise<import('../../../src/pages.mjs').Page[]>} The list of pages.
 */
export default async function pages (file, config, api) {
  const filepath = path.relative(config.root, file).replaceAll(path.sep, '/').replaceAll('../', '')

  const src = {
    url: new URL(filepath, config.baseURI),
    params: {
      headers: {
        'Content-Type': 'application/javascript',
      },
    },
    fileUrl: url.pathToFileURL(file),
  }

  const map = {
    url: filepath.endsWith('.js') ? new URL(filepath.replace(/\.js$/, '.map.js'), config.baseURI) : new URL(filepath + '.map', config.baseURI),
    params: {
      headers: {
        'Content-Type': 'application/json',
      },
    },
    fileUrl: url.pathToFileURL(file),
  }

  return [src, map]
}
