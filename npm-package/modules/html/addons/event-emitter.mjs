/**
 * ForEach is executed for each node when the page is interpreted.
 *
 * @param {import('../parser/iterator.mjs').Node} node - The node
 * @param {import('../parser/iterator.mjs').Node[]} nodes - All nodes.
 * @param {import('../parser/parse.mjs').HTMLDocument} htmlDocument - The HTML document.
 * @param {import('../../../src/pages.mjs').Page} page - The page.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../../src/api.mjs').API} api - The API.
 */
export function forEachAsync(node, nodes, htmlDocument, page, config, api) {
  if (!global.eventEmitter) return
  global.eventEmitter.emit('node', node, nodes, htmlDocument, page, config, api)
}
