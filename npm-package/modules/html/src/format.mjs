import * as fs from 'node:fs'
import * as url from 'node:url'

/**
 * Formats the HTML.
 * @param {import('../../../src/pages.mjs').Page} page - The page.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../../src/pages.mjs').API} api - The API.
 * @returns {Promise<string>} The list of pages.
 */
export default async function format (page, config, api) {
  page.content = page.content || fs.readFileSync(url.fileURLToPath(page.fileUrl), 'utf8')
  return page.content
}
