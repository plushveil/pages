import * as fs from 'node:fs'
import * as os from 'node:os'
import * as url from 'node:url'
import * as path from 'node:path'

import vsCodeHtmlLanguageService from 'vscode-html-languageservice'
import { TextDocument } from 'vscode-languageserver-textdocument'
import cssSelect from 'css-select'

import getTemplateLiterals from './get-template-literals.mjs'
import getTextNodes from './get-text-nodes.mjs'
import iterator from './iterator.mjs'

import CSSSelectAdapter from './css-select-adapter.mjs'

const service = vsCodeHtmlLanguageService.getLanguageService()

/**
 * @typedef {import('vscode-html-languageservice/lib/umd/htmlLanguageTypes.d.ts').Node} Node
 */

/**
 * @typedef {import('./get-template-literals.mjs').TemplateLiteral} TemplateLiteral
 */

/**
 * @typedef {import('./get-text-nodes.mjs').TextNode} TextNode
 */

/**
 * @typedef {object} HTMLDocument
 * @property {Node[]} roots The root nodes of the HTML document
 * @property {(offset: number) => Node} findNodeBefore Find the node before the given offset
 * @property {(offset: number) => Node} findNodeAt Find the node at the given offset
 * @property {(selector: string, node?: Node) => Node[]} select Select nodes using a CSS selector
 * @property {() => TemplateLiteral[]} getTemplateLiterals Get all template literals from the HTML document
 * @property {() => TextDocument} getTextDocument Get the text document
 * @property {() => TextNode[]} getTextNodes Get all text nodes from the HTML document
 * @property {() => globalThis.Iterable<import('./iterator.mjs').Node>} iterator Iterate over all nodes in the HTML document
 */

/**
 * Parse the given HTML content
 * @param {string} fileUrl The HTML content to parse or a fileUrl
 * @returns {HTMLDocument} The parsed HTML document
 */
export default function parse (fileUrl) {
  if (typeof fileUrl !== 'string') fileUrl = fileUrl.toString()
  const content = fileUrl.startsWith('file://') ? fs.readFileSync(url.fileURLToPath(fileUrl), 'utf-8') : fileUrl
  if (!fileUrl.startsWith('file://')) fileUrl = url.pathToFileURL(path.resolve(os.tmpdir(), 'file.page')).toString()

  const textDocument = TextDocument.create(fileUrl, 'page', 0, content)
  const htmlDocument = service.parseHTMLDocument(textDocument)
  const adapter = new CSSSelectAdapter(textDocument, htmlDocument)

  htmlDocument.select = (selector, node = htmlDocument.roots) => cssSelect(selector, node, { adapter })
  htmlDocument.getTemplateLiterals = (ignoreErrors) => getTemplateLiterals(textDocument, htmlDocument, ignoreErrors)
  htmlDocument.getTextDocument = () => textDocument
  htmlDocument.getTextNodes = () => getTextNodes(textDocument, htmlDocument)
  htmlDocument.iterator = (ignoreErrors) => iterator(htmlDocument, ignoreErrors)

  return htmlDocument
}
