import getNodesInRange, { createNodesInRangeContext } from '../utils/getNodesInRange.js'

/**
 * ForEach is executed for each node when the page is interpreted.
 *
 * @param {import('../parser/iterator.js').Node[]} nodes - All nodes.
 * @param {import('../parser/parse.js').HTMLDocument} htmlDocument - The HTML document.
 * @param {import('../../../src/pages.js').Page} page - The page.
 * @param {import('../../../src/config.js').Config} config - The configuration.
 * @param {import('../../../src/api.js').API} api - The API.
 */
export function afterAsync(nodes, htmlDocument, _page, _config, _api) {
  const nodesInRangeContext = createNodesInRangeContext(nodes)

  for (const node of nodes) {
    if (node.type === 'tag-open' && node.text.match(/<link/i)) {
      const htmlNode = htmlDocument.findNodeAt(node.offset.start + 1)
      if (!(htmlNode.tag === 'link' && htmlNode.attributes.rel.slice(1, -1) === 'canonical')) continue
      node.isCanonical = true
      const nodesInCanonical = getNodesInRange(htmlNode.start, htmlNode.end, nodes, nodesInRangeContext)
      nodesInCanonical.forEach((entry) => {
        entry.isCanonicalPart = true
        entry.textUpdate = ''
      })
    }
  }
}
