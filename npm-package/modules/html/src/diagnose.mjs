import getHtmlDocument from '../utils/getHtmlDocument.mjs'

/**
 * Retrieves a list of problems from a file.
 *
 * @param {import('../../../src/pages.mjs').Page} page - The page.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../../src/api.mjs').API} api - The API.
 * @returns {Promise<{ message: string; start: { line: number; character: number }; end: { line: number; character: number }; fix: string }[]>} The problems.
 */
export default async function diagnose(page, _config, _api) {
  try {
    const htmlDocument = getHtmlDocument(page)
    const textDocument = htmlDocument.getTextDocument()
    const problems = []

    /**
     * For each node
     *
     * @param {import('../parser/iterator.mjs').Node} node - The node.
     */
    const forEach = (node) => {
      if (node.type === 'text') {
        let i = 0
        while (node.text.indexOf('`', i) !== -1) {
          const offset = node.offset.start + node.text.indexOf('`', i)
          problems.push({
            message: 'Backticks in text nodes may cause problems when interpreting template literals. Use &#96; instead.',
            start: textDocument.positionAt(offset),
            end: textDocument.positionAt(offset + 1),
            fix: '&#96;',
          })
          i = offset + 1
        }
      }
    }
    htmlDocument.iterator().forEach(forEach)

    return problems
  } catch (err) {
    if (typeof err.position === 'number') {
      const end = (page.content ? page.content.indexOf('}', err.position) : err.position) + 1
      return [
        {
          message: err.message,
          offset: {
            start: err.position,
            end: end === 0 ? err.position + 1 : end,
          },
          fix: '',
        },
      ]
    } else {
      console.error(err)
    }
    return []
  }
}
