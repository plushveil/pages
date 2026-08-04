import * as config from '../config.js'

/**
 * @typedef {object} Node - A node.
 * @property {'tag-open' | 'tag-close' | 'template' | 'text' | 'raw'} type - The type of the node.
 * @property {string} text - The text of the node.
 * @property {import('vscode-html-languageservice/lib/umd/htmlLanguageTypes.d.ts').Range} range - The range of the node.
 * @property {{ start: number; end: number }} offset - The offset of the node.
 */

/**
 * @param {import('./parse.js').HTMLDocument} htmlDocument - The HTML content to interpret
 * @param {boolean} ignoreErrors - Whether to ignore errors. Defaults to false.
 * @returns {Node[]} The nodes.
 */
export default function iterator(htmlDocument, ignoreErrors) {
  const textDocument = htmlDocument.getTextDocument()
  const textNodes = htmlDocument.getTextNodes()
  const templateLiterals = htmlDocument.getTemplateLiterals(ignoreErrors)
  const { roots } = htmlDocument

  /**
   * @type {{ start: number; end: number }[]}
   */
  const rawRanges = []

  // First all nodes are collected.
  // Collecting all html nodes in a flat array.
  /**
   * @type {Node[]}
   */
  let nodes = []
  traverseHtmlNodes(roots, false, (node) => {
    const { start, startTagEnd } = node
    const { endTagStart, end } = node

    if (start || start === 0) {
      nodes.push({
        type: 'tag-open',
        text: textDocument.getText({
          start: textDocument.positionAt(start),
          end: textDocument.positionAt(startTagEnd),
        }),
        range: {
          start: textDocument.positionAt(start),
          end: textDocument.positionAt(startTagEnd),
        },
        offset: {
          start,
          end: startTagEnd,
        },
      })
    }
    if (end && endTagStart) {
      nodes.push({
        type: 'tag-close',
        text: textDocument.getText({
          start: textDocument.positionAt(endTagStart),
          end: textDocument.positionAt(end),
        }),
        range: {
          start: textDocument.positionAt(endTagStart),
          end: textDocument.positionAt(end),
        },
        offset: {
          start: endTagStart,
          end,
        },
      })
    }
    if (node.tag && config.rawTextNodes.includes(node.tag.toLowerCase())) {
      const rawOffset = {
        start: startTagEnd,
        end: endTagStart,
      }
      nodes.push({
        type: 'raw',
        text: textDocument.getText({
          start: textDocument.positionAt(startTagEnd),
          end: textDocument.positionAt(endTagStart),
        }),
        range: {
          start: textDocument.positionAt(startTagEnd),
          end: textDocument.positionAt(endTagStart),
        },
        offset: rawOffset,
      })
      rawRanges.push(rawOffset)
    }
  })

  rawRanges.sort((a, b) => a.start - b.start)

  // Collecting all template literals in a flat array.
  const topLevelTemplateLiterals = getTopLevelTemplateLiterals(templateLiterals, textDocument)

  let rawIndex = 0
  topLevelTemplateLiterals.forEach((templateLiteral) => {
    const { offset } = templateLiteral
    while (rawIndex < rawRanges.length && rawRanges[rawIndex].end <= offset.start) rawIndex++

    const enclosingRawRange = rawRanges[rawIndex]
    const isInsideRawNode = enclosingRawRange && offset.start > enclosingRawRange.start && offset.end < enclosingRawRange.end
    if (isInsideRawNode) return

    nodes.push({
      type: 'template',
      text: textDocument.getText({
        start: templateLiteral.start,
        end: templateLiteral.end,
      }),
      range: {
        start: templateLiteral.start,
        end: templateLiteral.end,
      },
      offset,
    })
  })

  // Collecting all text nodes in a flat array.
  traverse(textNodes, (node) => {
    if (!node.start && node.start !== 0) return
    nodes.push({
      type: 'text',
      text: textDocument.getText({
        start: node.start,
        end: node.end,
      }),
      range: {
        start: node.start,
        end: node.end,
      },
      offset: {
        start: textDocument.offsetAt(node.start),
        end: textDocument.offsetAt(node.end),
      },
    })
  })

  // Now there are some duplicates in the nodes array.
  // Text nodes also contain template literals.
  // HTML nodes also contain template literals in their attributes.
  nodes = nodes.sort((a, b) => a.offset.start - b.offset.start)
  const templateNodes = nodes.filter((node) => node.type === 'template')

  let templateStartIndex = 0
  nodes = nodes
    .reduce((resultNodes, node) => {
      if (node.type === 'template') {
        resultNodes.push(node)
        return resultNodes
      }

      while (templateStartIndex < templateNodes.length && templateNodes[templateStartIndex].offset.end <= node.offset.start) {
        templateStartIndex++
      }

      /**
       * @type {Node[]}
       */
      const overlappingTemplates = []
      for (let i = templateStartIndex; i < templateNodes.length && templateNodes[i].offset.start < node.offset.end; i++) {
        const templateNode = templateNodes[i]
        const containsNode = templateNode.offset.start <= node.offset.start && templateNode.offset.end >= node.offset.end
        if (containsNode) return resultNodes

        if (
          (templateNode.offset.start >= node.offset.start && templateNode.offset.end <= node.offset.end) ||
          (templateNode.offset.start < node.offset.end && templateNode.offset.start > node.offset.start) ||
          (templateNode.offset.end > node.offset.start && templateNode.offset.end < node.offset.end)
        ) {
          overlappingTemplates.push(templateNode)
        }
      }

      if (!overlappingTemplates.length || node.type === 'raw') {
        resultNodes.push(node)
        return resultNodes
      }

      const last = overlappingTemplates.length
      for (let i = 0; i <= overlappingTemplates.length; i++) {
        if (i !== last && node.offset.start > overlappingTemplates[i].offset.start) continue
        const textStart = i === 0 ? node.offset.start : overlappingTemplates[i - 1].offset.end
        const textEnd = i === last ? node.offset.end : overlappingTemplates[i].offset.start
        if (i === last && overlappingTemplates[i - 1].offset.end >= node.offset.end) continue

        resultNodes.push({
          type: node.type,
          text: textDocument.getText({
            start: textDocument.positionAt(textStart),
            end: textDocument.positionAt(textEnd),
          }),
          range: {
            start: textDocument.positionAt(textStart),
            end: textDocument.positionAt(textEnd),
          },
          offset: {
            start: textStart,
            end: textEnd,
          },
        })
      }

      return resultNodes
    }, [])
    .sort((a, b) => a.offset.start - b.offset.start)

  return nodes
}

/**
 * @param {any} templateLiterals - Template literal nodes to flatten and de-nest.
 * @param {import('vscode-html-languageservice/lib/umd/htmlLanguageTypes.d.ts').TextDocument} textDocument - The text document.
 */
function getTopLevelTemplateLiterals(templateLiterals, textDocument) {
  /**
   * @type {{ start: any; end: any; offset: { start: number; end: number } }[]}
   */
  const flattenedTemplateLiterals = []

  traverse(templateLiterals, (node) => {
    if (!node.start && node.start !== 0) return
    flattenedTemplateLiterals.push({
      start: node.start,
      end: node.end,
      offset: {
        start: textDocument.offsetAt(node.start),
        end: textDocument.offsetAt(node.end),
      },
    })
  })

  flattenedTemplateLiterals.sort((a, b) => {
    if (a.offset.start !== b.offset.start) return a.offset.start - b.offset.start
    return b.offset.end - a.offset.end
  })

  /**
   * @type {typeof flattenedTemplateLiterals}
   */
  const topLevelTemplateLiterals = []
  const stack = []

  flattenedTemplateLiterals.forEach((templateLiteral) => {
    while (stack.length && templateLiteral.offset.start >= stack[stack.length - 1].offset.end) stack.pop()

    const parentTemplateLiteral = stack[stack.length - 1]
    const isNested = Boolean(parentTemplateLiteral) && templateLiteral.offset.start > parentTemplateLiteral.offset.start && templateLiteral.offset.end < parentTemplateLiteral.offset.end

    if (!isNested) topLevelTemplateLiterals.push(templateLiteral)
    stack.push(templateLiteral)
  })

  return topLevelTemplateLiterals
}

/**
 * Traverses over a list of html nodes and their children.
 *
 * @param {any} node - The node to traverse.
 * @param {boolean} insideRawNode - Whether the node is inside a raw node.
 * @param {Function} callback - The callback to call for each node.
 */
function traverseHtmlNodes(node, insideRawNode, callback) {
  if (Array.isArray(node)) {
    node.forEach((n) => traverseHtmlNodes(n, insideRawNode, callback))
    return
  }

  if (insideRawNode) return

  callback(node)
  const isRawNode = node.tag && config.rawTextNodes.includes(node.tag.toLowerCase())
  if (isRawNode) return

  if (node.children) traverseHtmlNodes(node.children, insideRawNode, callback)
}

/**
 * Traverses over a list of nodes and their children.
 *
 * @param {any} node - The node to traverse.
 * @param {Function} callback - The callback to call for each node.
 */
function traverse(node, callback) {
  if (Array.isArray(node)) {
    node.forEach((n) => traverse(n, callback))
    return
  }

  callback(node)
  if (node.children) traverse(node.children, callback)
}
