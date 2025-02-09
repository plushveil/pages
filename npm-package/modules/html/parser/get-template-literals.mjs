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
  const text = textDocument.getText()

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

    const outerHtml = text.slice(node.start, node.end)
    const script = '`' + outerHtml + '`'
    const ast = getAST(script)

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
 * @returns {import('acorn').Program} - The AST
 */
function getAST (script) {
  try {
    const ast = acorn.parse(script, { ecmaVersion: 'latest', locations: true, sourceType: 'module', allowAwaitOutsideFunction: true })
    return ast
  } catch (err) {
    throw new Error((err.stack || err.message) + `\n    in:\n${script}`)
  }
}

/**
 * Check if the node is a descendant of a node with the given tag or has the given tag
 * @param {import('vscode-html-languageservice').HTMLNode} node - The node
 * @param {string} tag - The tag
 * @returns {boolean} - Whether the node has a parent with the given tag
 */
function isOrHasParent (node, tag) {
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
