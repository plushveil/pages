/**
 * ForEach is executed for each node when the page is interpreted.
 *
 * @param {import('../parser/iterator.js').Node} node - The node
 * @param {import('../parser/iterator.js').Node[]} nodes - All nodes.
 * @param {import('../parser/parse.js').HTMLDocument} htmlDocument - The HTML document.
 * @param {import('../../../src/pages.js').Page} page - The page.
 * @param {import('../../../src/config.js').Config} config - The configuration.
 * @param {import('../../../src/api.js').API} api - The API.
 */
export function forEachAsync(node, nodes, htmlDocument, page, config, api) {
  if (!global.eventEmitter) return
  global.eventEmitter.emit('node', node, nodes, htmlDocument, page, config, api)
}
