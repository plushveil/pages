import { rawTextNodes } from '../config.js'

/**
 * @typedef {object} TextNode
 * @property {import('vscode-languageserver-textdocument').Position} start - The start position
 * @property {import('vscode-languageserver-textdocument').Position} end - The end position
 * @property {string} text - The text node
 */

/**
 * Get all text nodes from an HTML document.
 * Note: This function interprets comment and document type annotations as text nodes.
 *
 * @param {import('vscode-languageserver-textdocument').TextDocument} textDocument - The text document
 * @param {import('vscode-html-languageservice').HTMLDocument} htmlDocument - The HTML document
 * @returns {TextNode[]} - The text nodes
 */
export default function getTextNodes(textDocument, htmlDocument) {
  if (htmlDocument.roots.length === 0) {
    return [
      {
        start: textDocument.positionAt(0),
        end: textDocument.positionAt(textDocument.getText().length),
        text: textDocument.getText(),
      },
    ]
  }

  /**
   * @param {import('vscode-html-languageservice/lib/umd/htmlLanguageTypes').Node} node - The node to traverse
   * @returns {void}
   */
  function traverse(node) {
    if (!node.tag || rawTextNodes.includes(node.tag.toLowerCase())) return

    let last = node.startTagEnd
    for (const child of node.children || []) {
      if (child.start > last) {
        const start = textDocument.positionAt(last)
        const end = textDocument.positionAt(child.start)
        textNodes.push({ start, end, text: textDocument.getText({ start, end }) })
      }
      last = child.end
      traverse(child)
    }
    if (last < node.endTagStart) {
      const start = textDocument.positionAt(last)
      const end = textDocument.positionAt(node.endTagStart)
      textNodes.push({ start, end, text: textDocument.getText({ start, end }) })
    }
  }

  const textNodes = []
  if (htmlDocument.roots[0]?.start) {
    const start = textDocument.positionAt(0)
    const end = textDocument.positionAt(htmlDocument.roots[0].start)
    if (end) textNodes.push({ start, end, text: textDocument.getText({ start, end }) })
  }

  for (let i = 0; i < htmlDocument.roots.length; i++) {
    if (i > 0 && htmlDocument.roots[i - 1].end !== htmlDocument.roots[i].start) {
      const start = textDocument.positionAt(htmlDocument.roots[i - 1].end)
      const end = textDocument.positionAt(htmlDocument.roots[i].start)
      textNodes.push({ start, end, text: textDocument.getText({ start, end }) })
    }
    const node = htmlDocument.roots[i]
    traverse(node)
  }

  if (htmlDocument.roots[htmlDocument.roots.length - 1].end < textDocument.getText().length) {
    const start = textDocument.positionAt(htmlDocument.roots[htmlDocument.roots.length - 1].end)
    const end = textDocument.positionAt(textDocument.getText().length)
    textNodes.push({ start, end, text: textDocument.getText({ start, end }) })
  }

  return textNodes
}
