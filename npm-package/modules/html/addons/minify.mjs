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

    if (node.type === 'raw') {
      const closestHtmlNode = htmlDocument.findNodeAt(node.offset.start)
      if (closestHtmlNode.tag?.toLowerCase() === 'template') {
        node.textUpdate = text.replace(/\s+/g, ' ').replaceAll('> <', '><').trim()
      }
      continue
    }

    // if the last character is a space instead of a line break, assume it's on purpose and restore it
    let keepTrailingSpace = false
    const lastCharMatch = text.match(/([^\s])\s*$/)
    if (lastCharMatch) {
      const nextChar = text[lastCharMatch.index + 1]
      if (nextChar === ' ') keepTrailingSpace = true
    }

    const update = text.trim().replace(/\s+/g, ' ')
    if (update !== text) {
      node.textUpdate = update
      if (keepTrailingSpace) node.textUpdate += ' '
    }
  }
}
