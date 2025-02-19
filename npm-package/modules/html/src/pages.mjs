import * as fs from 'node:fs'
import * as url from 'node:url'

import parse from '../parser/parse.mjs'

/**
 * @typedef {object} UrlPart - A part of a URL.
 * @property {"dynamic"|"static"} type - The type of the part.
 * @property {string} name - The name of the part.
 * @property {string|string[]} [value] - The value of the part.
 */

/**
 * Retrieves a list of pages from a file.
 * @param {string} file - The file.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../../src/api.mjs').API} api - The API.
 * @param {object} options - Additional options.
 * @param {boolean} options.eval - Whether to evaluate the JavaScript code. Defaults to true.
 * @returns {Promise<import('../../../src/pages.mjs').Page[]>} The list of pages.
 */
export default async function pages (file, config, api, options = {}) {
  if (!fs.existsSync(file)) return []

  const fileUrl = url.pathToFileURL(file)
  const htmlDocument = parse(fileUrl)

  for (const node of htmlDocument.iterator()) {
    console.log(node.type, node.text)
  }

  console.log('')
  process.exit(0)
}
