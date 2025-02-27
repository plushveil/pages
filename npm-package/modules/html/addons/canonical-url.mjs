import getNodesInRange from '../utils/getNodesInRange.mjs'

/**
 * forEach is executed for each node when the page is interpreted.
 * @param {import('../parser/iterator.mjs').Node[]} nodes - All nodes.
 * @param {import('../parser/parse.mjs').HTMLDocument} htmlDocument - The HTML document.
 * @param {import('../../../src/pages.mjs').Page} page - The page.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../../src/api.mjs').API} api - The API.
 */
export function afterAsync (nodes, htmlDocument, page, config, api) {
  for (const node of nodes) {
    if (node.type === 'tag-open' && node.text.match(/<link/i)) {
      const htmlNode = htmlDocument.findNodeAt(node.offset.start + 1)
      if (!(htmlNode.tag === 'link' && htmlNode.attributes.rel.slice(1, -1) === 'canonical')) continue
      node.isCanonical = true
      const nodesInCanonical = getNodesInRange(htmlNode.start, htmlNode.end, nodes)
      nodesInCanonical.forEach(node => {
        node.isCanonicalPart = true
        node.textUpdate = ''
      })
    }
  }
}
