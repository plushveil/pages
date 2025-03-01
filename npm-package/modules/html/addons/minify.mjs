/**
 * forEach is executed for each node when the page is interpreted.
 * @param {import('../parser/iterator.mjs').Node[]} nodes - All nodes.
 * @param {import('../parser/parse.mjs').HTMLDocument} htmlDocument - The HTML document.
 * @param {import('../../../src/pages.mjs').Page} page - The page.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../../src/api.mjs').API} api - The API.
 */
export function after (nodes, htmlDocument, page, config, api) {
  for (const node of nodes) {
    const text = typeof node.textUpdate === 'string' ? node.textUpdate : node.text
    const update = text.trim()
    if (update !== text) node.textUpdate = update
  }
}
