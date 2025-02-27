import executeAddons from '../addons/addons.mjs'

// todo:
// - [x] insert canonical link (at head end or position where it was removed, if it was removed)
// - [x] minify inline scripts and styles
// - [ ] add integrity to script and style tags
// - [ ] add content-security-policy to html tag
// - [x] resolve file paths in html to pages urls
// - [ ] <link rel="file" href="header.html">
// - [x] ${import('header.html')}
// - [x] value from import default export function result (in worker)

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
  const nodes = await executeAddons(page, config, api)
  const canonical = nodes.find(node => node.isCanonical)
  if (canonical) canonical.textUpdate = `<link rel="canonical" href="${page.url}">`
  const html = nodes.map(node => typeof node.textUpdate === 'string' ? node.textUpdate : node.text).join('')
  return html
}
