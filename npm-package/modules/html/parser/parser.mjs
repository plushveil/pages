import vsCodeHtmlLanguageService from 'vscode-html-languageservice'
import { TextDocument } from 'vscode-languageserver-textdocument'

import esprima from 'esprima'

import { getOffsetFromPosition } from './utils.mjs'

const service = vsCodeHtmlLanguageService.getLanguageService()

/**
 * @typedef {object} TemplateLiteral
 * @property {import('vscode-languageserver-textdocument').Position} start - The start position
 * @property {import('vscode-languageserver-textdocument').Position} end - The end position
 * @property {string} text - The template literal
 */

/**
 * @param {string|TextDocument} string - The HTML document
 * @returns {TemplateLiteral[]} - The template literals
 */
export function getTemplateLiterals (string) {
  const textDocument = typeof string === 'object' ? string : TextDocument.create('page://tmp.page', 'page', 0, string)
  const htmlDocument = service.parseHTMLDocument(textDocument)
  const text = textDocument.getText()

  /**
   * @type {TemplateLiteral[]}
   */
  const templateLiterals = []

  let i = text.indexOf('${')
  while (i !== -1) {
    const node = htmlDocument.findNodeAt(i)
    if (['script', 'pre', 'template'].includes(node.tag.toLowerCase())) {
      i = text.indexOf('${', i + 2)
      continue
    }

    const outerHtml = text.slice(node.start, node.end)
    const script = '`' + outerHtml + '`'
    const ast = esprima.parse(script, { loc: true })

    /**
     * @type {import('estree').TemplateLiteral}
     */
    const templateLiteral = ast.body[0].expression
    const templateLiteralExpressions = templateLiteral.expressions
    for (const expression of templateLiteralExpressions) {
      const expressionStart = (node.start + getOffsetFromPosition(script, expression.loc.start) - 1)
      const expressionEnd = (node.start + getOffsetFromPosition(script, expression.loc.end) - 1)
      const start = textDocument.positionAt(text.slice(0, expressionStart).lastIndexOf('${'))
      const end = textDocument.positionAt(text.slice(expressionEnd).indexOf('}') + expressionEnd + 1)
      if (!(templateLiterals.find(t => t.start.line === start.line && t.start.character === start.character))) {
        templateLiterals.push({ start, end, text: textDocument.getText({ start, end }) })
      }
    }

    i = text.indexOf('${', i + 2)
  }

  return templateLiterals
}

/**
 * @typedef {object} TextNode
 * @property {import('vscode-languageserver-textdocument').Position} start - The start position
 * @property {import('vscode-languageserver-textdocument').Position} end - The end position
 * @property {string} node - The text node
 */

/**
 * Get all text nodes from an HTML document.
 * Note: This function interprets comment and document type annotations as text nodes.
 * @param {string|TextDocument} string - The HTML document
 * @returns {TextNode[]} - The text nodes
 */
export function getTextNodes (string) {
  const textDocument = typeof string === 'object' ? string : TextDocument.create('page://tmp.page', 'page', 0, string)
  const htmlDocument = service.parseHTMLDocument(textDocument)

  /**
   * @param {import('vscode-html-languageservice/lib/umd/htmlLanguageTypes').Node} node - The node to traverse
   * @returns {void}
   */
  function traverse (node) {
    if (!node.tag || ['script', 'style', 'pre', 'template'].includes(node.tag.toLowerCase())) return

    let last = node.startTagEnd
    for (const child of (node.children || [])) {
      if (child.start > last) {
        textNodes.push({
          start: textDocument.positionAt(last),
          end: textDocument.positionAt(child.start),
          node: textDocument.getText().slice(last, child.start)
        })
      }
      last = child.end
      traverse(child)
    }
    if (last < node.endTagStart) {
      textNodes.push({
        start: textDocument.positionAt(last + 1),
        end: textDocument.positionAt(node.endTagStart),
        node: textDocument.getText().slice(last, node.endTagStart)
      })
    }
  }

  const textNodes = []
  if (htmlDocument.roots[0]?.start !== 0) {
    const text = textDocument.getText().slice(0, htmlDocument.roots[0].start)
    textNodes.push({
      start: textDocument.positionAt(0),
      end: textDocument.positionAt(htmlDocument.roots[0].start),
      node: textDocument.getText().slice(0, text.indexOf('>') + 1)
    })
  }
  for (const node of htmlDocument.roots) traverse(node)
  return textNodes
}
