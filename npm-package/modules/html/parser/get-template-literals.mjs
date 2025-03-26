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
 * @param {boolean} ignoreErrors - `true` to ignore errors.
 * @returns {TemplateLiteral[]} - The template literals
 */
export default function getTemplateLiterals (textDocument, htmlDocument, ignoreErrors) {
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
    const ast = getAST(script, i, ignoreErrors)

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
 * @param {boolean} ignoreErrors - `true` to ignore errors.
 * @returns {import('acorn').Program} - The AST
 */
function getAST (script, position, ignoreErrors) {
  try {
    const ast = acorn.parse(script, { ecmaVersion: 'latest', locations: true, sourceType: 'module', allowAwaitOutsideFunction: true })
    return ast
  } catch (err) {
    if (ignoreErrors) {
      return {
        body: [
          {
            expression: {
              expressions: []
            }
          }
        ]
      }
    }
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
  const templateLiterals = getAllIndexes(html, '${').map((start) => {
    const text = html.slice(start + 2)
      .replace(/\/\/.*/g, (m) => 'x'.repeat(m.length)) // replace comments with x
      .replace(/\/\*[\s\S]*?\*\//g, (m) => 'x'.repeat(m.length)) // replace multi-line comments with x
      .replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, (m) => 'x'.repeat(m.length)) // replace strings with x
      .replace(/`(?:(?=(\\?))\1.)*?`/g, (m) => 'x'.repeat(m.length)) // replace strings in backticks with x

    // find closing }
    let i = 0
    let level = 1
    while (level > 0) {
      const char = text[i]
      if (typeof char === 'undefined') {
        i = -1
        break
      }
      if (char === '{') level++
      if (char === '}') level--
      i++
    }

    return {
      start,
      end: i === -1 ? html.lastIndexOf('}') + 1 : start + 2 + i,
    }
  }).filter((value, index, self) => {
    // remove template literals that are inside other template literals
    return self.every((other, i) => index === i || value.start < other.start || value.end > other.end)
  })

  const result = []
  let i = 0
  while (i < html.length) {
    const templateLiteral = templateLiterals.find(t => t.start > i)
    if (templateLiteral) {
      result.push(html.slice(i, templateLiteral.start).replace(/`/g, '"'))

      const length = templateLiteral.end - templateLiteral.start - 3
      if (length > 0) result.push('${' + '9'.repeat(length) + '}')
      else if (length === 0) result.push('${}')
      else if (length === -1) result.push('${')
      else throw new Error(`Invalid template literal:\n${html}`)
      i = templateLiteral.end
    } else {
      result.push(html.slice(i).replace(/`/g, '"'))
      break
    }
  }

  return result.join('')
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
