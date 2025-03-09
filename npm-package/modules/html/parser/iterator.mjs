import * as config from '../config.mjs'

/**
 * @typedef {object} Node - A node.
 * @property {"tag-open"|"tag-close"|"template"|"text"|"raw"} type - The type of the node.
 * @property {string} text - The text of the node.
 * @property {import('vscode-html-languageservice/lib/umd/htmlLanguageTypes.d.ts').Range} range - The range of the node.
 * @property {{ start: number, end: number }} offset - The offset of the node.
 */

/**
 * @param {import('./parse.mjs').HTMLDocument} htmlDocument - The HTML content to interpret
 * @param {boolean} ignoreErrors - Whether to ignore errors. Defaults to false.
 * @returns {Node[]} The nodes.
 */
export default function iterator (htmlDocument, ignoreErrors) {
  const textDocument = htmlDocument.getTextDocument()
  const textNodes = htmlDocument.getTextNodes()
  const templateLiterals = htmlDocument.getTemplateLiterals(ignoreErrors)
  const roots = htmlDocument.roots

  // First all nodes are collected.
  // Collecting all html nodes in a flat array.
  /**
   * @type {Node[]}
   */
  let nodes = []
  traverse(roots, node => {
    const { start, startTagEnd } = node
    const { endTagStart, end } = node

    const isInsideRawNode = nodes.some(n => n.type === 'raw' && start > n.offset.start && end < n.offset.end)
    if (isInsideRawNode) return

    if (start || start === 0) {
      nodes.push({
        type: 'tag-open',
        text: textDocument.getText({
          start: textDocument.positionAt(start),
          end: textDocument.positionAt(startTagEnd)
        }),
        range: {
          start: textDocument.positionAt(start),
          end: textDocument.positionAt(startTagEnd)
        },
        offset: {
          start,
          end: startTagEnd
        }
      })
    }
    if (end && endTagStart) {
      nodes.push({
        type: 'tag-close',
        text: textDocument.getText({
          start: textDocument.positionAt(endTagStart),
          end: textDocument.positionAt(end)
        }),
        range: {
          start: textDocument.positionAt(endTagStart),
          end: textDocument.positionAt(end)
        },
        offset: {
          start: endTagStart,
          end
        }
      })
    }
    if (config.rawTextNodes.includes(node.tag.toLowerCase())) {
      nodes.push({
        type: 'raw',
        text: textDocument.getText({
          start: textDocument.positionAt(startTagEnd),
          end: textDocument.positionAt(endTagStart)
        }),
        range: {
          start: textDocument.positionAt(startTagEnd),
          end: textDocument.positionAt(endTagStart)
        },
        offset: {
          start: startTagEnd,
          end: endTagStart
        }
      })
    }
  })

  // Collecting all template literals in a flat array.
  traverse(templateLiterals, node => {
    if (!node.start && node.start !== 0) return
    const offset = { start: textDocument.offsetAt(node.start), end: textDocument.offsetAt(node.end) }

    const isInsideTemplateLiteral = templateLiterals.some(tl => {
      const otherOffset = { start: textDocument.offsetAt(tl.start), end: textDocument.offsetAt(tl.end) }
      return offset.start > otherOffset.start && offset.end < otherOffset.end
    })
    if (isInsideTemplateLiteral) return

    const isInsideRawNode = nodes.some(n => {
      if (n.type !== 'raw') return false
      return offset.start > n.offset.start && offset.end < n.offset.end
    })
    if (isInsideRawNode) return

    nodes.push({
      type: 'template',
      text: textDocument.getText({
        start: node.start,
        end: node.end
      }),
      range: {
        start: node.start,
        end: node.end
      },
      offset
    })
  })

  // Collecting all text nodes in a flat array.
  traverse(textNodes, node => {
    if (!node.start && node.start !== 0) return
    nodes.push({
      type: 'text',
      text: textDocument.getText({
        start: node.start,
        end: node.end
      }),
      range: {
        start: node.start,
        end: node.end
      },
      offset: {
        start: textDocument.offsetAt(node.start),
        end: textDocument.offsetAt(node.end)
      }
    })
  })

  // Now there are some duplicates in the nodes array.
  // Text nodes also contain template literals.
  // HTML nodes also contain template literals in their attributes.
  nodes = nodes.reduce((nodes, node, index, arr) => {
    const isInsideTemplateLiteral = arr.some(tl => (tl.type === 'template' && tl.offset.start < node.offset.start && tl.offset.end > node.offset.end))
    if (isInsideTemplateLiteral) return nodes

    const templateLiteralsInsideNode = (node.type === 'template' || node.type === 'raw')
      ? []
      : arr.filter(tl => {
        if (tl.type !== 'template') return false
        if (tl.offset.start >= node.offset.start && tl.offset.end <= node.offset.end) return true // the node is wrapped in a template literal
        if (tl.offset.start < node.offset.end && tl.offset.start > node.offset.start) return true // the beginning of the template literal is inside the node
        if (tl.offset.end > node.offset.start && tl.offset.end < node.offset.end) return true // is overlapping with the node to the right
        return false
      })

    if (!templateLiteralsInsideNode.length) {
      nodes.push(node)
      return nodes
    }

    const last = templateLiteralsInsideNode.length
    for (let i = 0; i <= templateLiteralsInsideNode.length; i++) {
      if (i !== last && node.offset.start > templateLiteralsInsideNode[i].offset.start) continue
      const textStart = i === 0 ? node.offset.start : templateLiteralsInsideNode[i - 1].offset.end
      const textEnd = i === last ? node.offset.end : templateLiteralsInsideNode[i].offset.start
      if (i === last && templateLiteralsInsideNode[i - 1].offset.end >= node.offset.end) continue
      const updatedNode = {
        type: node.type,
        text: textDocument.getText({
          start: textDocument.positionAt(textStart),
          end: textDocument.positionAt(textEnd)
        }),
        range: {
          start: textDocument.positionAt(textStart),
          end: textDocument.positionAt(textEnd)
        },
        offset: {
          start: textStart,
          end: textEnd
        }
      }
      nodes.push(updatedNode)
    }

    return nodes
  }, []).sort((a, b) => a.offset.start - b.offset.start)

  return nodes
}

/**
 * Traverses over a list of nodes and their children.
 * @param {*} node - The node to traverse.
 * @param {Function} callback - The callback to call for each node.
 */
function traverse (node, callback) {
  if (Array.isArray(node)) {
    node.forEach(n => traverse(n, callback))
    return
  }

  callback(node)
  if (node.children) traverse(node.children, callback)
}
