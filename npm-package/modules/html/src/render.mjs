import * as url from 'node:url'

import parse from '../parser/parse.mjs'

// todo:
// - [ ] insert canonical link (at head end or position where it was removed, if it was removed)
// - [ ] add integrity to script and style tags
// - [ ] add content-security-policy to html tag
// - [ ] resolve file paths in html to pages urls
// - [ ] <link rel="file" href="header.html">
// - [ ] ${import('header.html')}
// - [ ] value from import default export function result (in worker)
// - [ ] loadHTML change error location to the correct line
// - [ ] nested worker needs no new thread

/**
 * @typedef {object} Node
 * @property {string} text - The text node
 * @property {{ line: number, character: number, offset: number }} start - The start position
 * @property {{ line: number, character: number, offset: number }} end - The end position
 * @property {boolean} [isTemplateLiteral] - Whether the node is a template literal
 */

/**
 * Renders a page.
 * @param {import('../../../src/pages.mjs').Page} page - The page.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../../src/api.mjs').API} api - The API.
 * @returns {Promise<string>} The rendered page.
 */
export default async function render (page, config, api) {
  const isPartial = (page.params?.headers?.['X-Partial'] === 'true')
  const sectionFilePath = page.params?.__filename || url.fileURLToPath(page.fileUrl.toString())

  const htmlDocument = parse(page.content || page.fileUrl.toString())
  const textDocument = htmlDocument.getTextDocument()
}
