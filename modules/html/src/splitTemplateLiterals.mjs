import * as acorn from 'acorn'
import * as walk from 'acorn-walk'

/**
 * Splits the template literals.
 * @param {string} text - The text.
 * @returns {string[]} The parts.
 */
export default function splitTemplateLiterals (text) {
  const code = `\`${text}\``

  let ast
  try {
    ast = acorn.parse(code, { sourceType: 'module', ecmaVersion: 'latest' })
  } catch (err) {
    err.message += `\n${text}`
    throw err
  }

  const parts = []

  walk.simple(ast, {
    TemplateLiteral (node) {
      for (const expression of node.expressions) {
        parts.push({
          text: code.slice(expression.start - 2, expression.end + 1),
          start: expression.start,
        })
      }
      for (const quasi of node.quasis) {
        parts.push({
          text: quasi.value.raw,
          start: quasi.start,
        })
      }
    },
  })

  const result = parts
    .sort((a, b) => a.start - b.start)
    .map((part) => part.text)
    .filter((part) => part)

  return result
}
