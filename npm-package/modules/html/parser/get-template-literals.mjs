import * as acorn from 'acorn'

/**
 * @typedef {object} TemplateLiteral
 * @property {import('vscode-languageserver-textdocument').Position} start - The start position
 * @property {import('vscode-languageserver-textdocument').Position} end - The end position
 * @property {string} text - The template literal
 */

/**
 * @param {import('vscode-languageserver-textdocument').TextDocument} textDocument - The HTML document
 * @param {import('vscode-html-languageservice').HTMLDocument} htmlDocument - The HTML document
 * @returns {TemplateLiteral[]} - The template literals
 */
export default function getTemplateLiterals (textDocument, htmlDocument) {
  const text = escapeHTML(textDocument.getText())

  /**
   * @type {TemplateLiteral[]}
   */
  const templateLiterals = []

  let i = text.indexOf('${')
  while (i !== -1) {
    const node = htmlDocument.findNodeAt(i)
    if (['script', 'pre', 'template'].some(tag => isOrHasParent(node, tag))) {
      i = text.indexOf('${', i + 2)
      continue
    }

    const outerHtml = text.slice(node.start, i < node.startTagEnd ? node.startTagEnd : node.end)
    const script = '`' + outerHtml + '`'
    const ast = getAST(script, i)

    /**
     * @type {import('estree').TemplateLiteral}
     */
    const templateLiteral = ast.body[0].expression
    const templateLiteralExpressions = templateLiteral.expressions
    for (const expression of templateLiteralExpressions) {
      const expressionStart = (node.start + getOffsetFromPosition(script, expression.loc.start) - 1)
      const expressionEnd = (node.start + getOffsetFromPosition(script, expression.loc.end) - 1)
      const start = { ...textDocument.positionAt(text.slice(0, expressionStart).lastIndexOf('${')), offset: expressionStart }
      const end = { ...textDocument.positionAt(text.slice(expressionEnd).indexOf('}') + expressionEnd + 1), offset: expressionEnd + 1 }
      if (!(templateLiterals.find(t => t.start.line === start.line && t.start.character === start.character))) {
        templateLiterals.push({ start, end, text: textDocument.getText({ start, end }) })
      }
    }

    i = text.indexOf('${', i + 2)
  }

  return templateLiterals
}

/**
 * @param {string} script - The script
 * @param {number} position - The offset
 * @returns {import('acorn').Program} - The AST
 */
function getAST (script, position) {
  try {
    const ast = acorn.parse(script, { ecmaVersion: 'latest', locations: true, sourceType: 'module', allowAwaitOutsideFunction: true })
    return ast
  } catch (err) {
    const error = new Error((err.message) + `\n    in:\n${script}`)
    error.position = position
    throw error
  }
}

/**
 * Check if the node is a descendant of a node with the given tag or has the given tag
 * @param {import('vscode-html-languageservice').HTMLNode} node - The node
 * @param {string} tag - The tag
 * @returns {boolean} - Whether the node has a parent with the given tag
 */
function isOrHasParent (node, tag) {
  if (!node.tag) return false
  if (node.tag.toLowerCase() === tag) return true
  while (node.parent) {
    if (node.parent.tag?.toLowerCase() === tag) return true
    node = node.parent
  }
  return false
}

/**
 * @param {string} text - The text
 * @param {{ line: number, column: number }} position - The position
 * @returns {number} - The offset
 */
function getOffsetFromPosition (text, position) {
  const lines = text.split('\n')
  let offset = 0
  for (let i = 0; i < position.line - 1; i++) offset += lines[i].length + 1
  return offset + position.column
}

/**
 * Replace all backticks that are not enclosed in ${} with a " to avoid syntax errors.
 * @param {string} html - The HTML
 * @returns {string} - The escaped HTML
 */
function escapeHTML (html) {
  const opens = getAllIndexes(html, '${')
  const closes = opens.map((_, i) => html.slice(opens[i], opens[i + 1] || html.length).lastIndexOf('}') + opens[i])

  let result = ''
  let start = 0
  while (start < html.length) {
    const open = opens.find(o => o > start)
    if (typeof open === 'undefined') {
      result += html.slice(start).replace(/`/g, '"')
      break
    }

    const close = closes.find(c => c > open)
    if (close === undefined) {
      result += html.slice(start).replace(/`/g, '"')
      break
    }

    result += html.slice(start, open).replace(/`/g, '"') + html.slice(open, close + 1)
    start = close + 1
  }

  return result
}

/**
 * Get all indexes of a string in another string
 * @param {string} str - The string
 * @param {string} val - The value
 * @returns {number[]} - The indexes
 */
function getAllIndexes (str, val) {
  const indexes = []
  let i = -1
  while ((i = str.indexOf(val, i + 1)) !== -1) indexes.push(i)
  return indexes
}
