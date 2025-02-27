import * as js from '../../js/js.mjs'
import * as css from '../../css/css.mjs'

/**
 * forEach is executed for each node when the page is interpreted.
 * @param {import('../parser/iterator.mjs').Node} node - The node.
 * @param {import('../parser/iterator.mjs').Node[]} nodes - All nodes.
 * @param {import('../parser/parse.mjs').HTMLDocument} htmlDocument - The HTML document.
 * @param {import('../../../src/pages.mjs').Page} page - The page.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../../src/api.mjs').API} api - The API.
 */
export async function forEachAsync (node, nodes, htmlDocument, page, config, api) {
  if (node.type !== 'raw' || node.textUpdate === '') return

  const tag = htmlDocument.findNodeAt(node.offset.start).tag.toLowerCase()
  const text = typeof node.textUpdate === 'string' ? node.textUpdate : node.text
  const snippetPage = { ...page, content: text }

  if (tag === 'script') {
    const content = (await js.render(snippetPage, config, api))
      .replace(/\/\/# sourceMappingURL.*/, '')
    node.textUpdate = content
  }
  if (tag === 'style') {
    const content = (await css.render(snippetPage, config, api))
      .replace(/\/\*# sourceMappingURL.*/, '')
    node.textUpdate = content
  }
}
