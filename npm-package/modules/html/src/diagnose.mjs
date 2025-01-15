import * as fs from 'node:fs'
import * as url from 'node:url'

import { TextDocument } from 'vscode-languageserver-textdocument'

import { getTextNodes } from '../parser/parser.mjs'

const severity = {
  error: 1,
  warning: 2,
  information: 3,
  hint: 4
}

const diagnoseTrueDefault = {
  textNodesMustBeTemplateLiterals: severity.error
}

/**
 * @typedef {object} Issue
 * @property {string} message - The message.
 * @property {{ start: { line: number, character: number }, end: { line: number, character: number } }} range - The range.
 * @property {1|2|3|4} severity - The severity (1 = error, 2 = warning, 3 = information, 4 = hint).
 * @property {string} source - The source.
 */

/**
 * Finds issues in the HTML.
 * @param {import('../../../src/pages.mjs').Page} page - The page.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../../src/pages.mjs').API} api - The API.
 * @returns {Promise<Issue[]>} The list of pages.
 */
export default async function diagnose (page, config, api) {
  if (!(config.html?.diagnose)) return []
  page.content = page.content || fs.readFileSync(url.fileURLToPath(page.fileUrl), 'utf8')

  const textDocument = TextDocument.create(page.fileUrl || 'page://tmp.page', 'page', 0, page.content)
  const diagnoseOptions = typeof config.html?.diagnose === 'object' ? config.html.diagnose : diagnoseTrueDefault

  const issues = []

  if (diagnoseOptions.textNodesMustBeTemplateLiterals) {
    const textNodes = getTextNodes(textDocument)
    for (const textNode of textNodes) {
      if (!(textNode.node.trim())) continue
      if (textNode.node.includes('<!')) continue

      const content = textNode.node.trim()
      if (!content.startsWith('${') || !content.endsWith('}')) {
        issues.push({
          message: `Text nodes ${diagnoseOptions.textNodesMustBeTemplateLiterals === 1 ? 'must' : 'should'} be template literals.`,
          range: {
            start: { line: textNode.start.line, character: textNode.start.character },
            end: { line: textNode.end.line, character: textNode.end.character }
          },
          severity: diagnoseOptions.textNodesMustBeTemplateLiterals,
          source: '@plushveil/pages'
        })
      }
    }
  }

  return issues
}
