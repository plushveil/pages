import * as css from '../../css/css.js'
import * as js from '../../js/js.js'

/**
 * ForEach is executed for each node when the page is interpreted.
 *
 * @param {import('../parser/iterator.js').Node} node - The node.
 * @param {import('../parser/iterator.js').Node[]} nodes - All nodes.
 * @param {import('../parser/parse.js').HTMLDocument} htmlDocument - The HTML document.
 * @param {import('../../../src/pages.js').Page} page - The page.
 * @param {import('../../../src/config.js').Config} config - The configuration.
 * @param {import('../../../src/api.js').API} api - The API.
 */
export async function forEachAsync(node, nodes, htmlDocument, page, config, api) {
  if (node.type !== 'raw' || node.textUpdate === '') return

  const htmlNode = htmlDocument.findNodeAt(node.offset.start)
  const tag = htmlNode.tag.toLowerCase()
  if (tag !== 'script' && tag !== 'style') return
  if (tag === 'script' && htmlNode.attributes?.src) return

  const text = typeof node.textUpdate === 'string' ? node.textUpdate : node.text
  const snippetPage = { ...page, content: text }
  if (tag === 'script') node.textUpdate = await js.render(snippetPage, config, api)
  else if (tag === 'style') node.textUpdate = await css.render(snippetPage, config, api)
}
