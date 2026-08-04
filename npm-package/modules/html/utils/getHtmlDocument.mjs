import * as url from 'node:url'

import parse from '../parser/parse.mjs'

/**
 * Get the HTML document.
 *
 * @param {import('../../../src/pages.mjs').Page} page - The page.
 * @returns {import('../parser/parse.mjs').HTMLDocument} The HTML document.
 */
export default function getHtmlDocument(page) {
  if (typeof page.content === 'string') return parse(page.content)
  if (page.params?.['__filename']) return parse(url.pathToFileURL(page.params['__filename']).toString())
  return parse(page.fileUrl.toString())
}
