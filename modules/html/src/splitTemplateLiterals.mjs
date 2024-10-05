import * as acorn from 'acorn'
import * as walk from 'acorn-walk'

/**
 * Splits a text with template literals into parts.
 * @param {string} text - The text.
 * @returns {string[]} The parts.
 */
export default function splitTemplateLiterals (text) {
  if (typeof text !== 'string') throw new TypeError('text must be a string')

  const hasDollar = text.includes('$')
  if (!hasDollar) return text ? [text] : []

  // the text can not have backticks because it would be a syntax error
  // so we can replace them with double quotes or single quotes
  // if the text has both double quotes and single quotes, we can use a map to convert them back
  // the map may fail if the replacements produce syntax errors
  let map = false
  if (text.includes('`')) {
    const id = Date.now()
    const macros = {}
    for (const alt of ['"', "'"]) {
      if (!text.includes(alt)) {
        while (text.match(/`[^`]+`/g)) {
          text = text.replace(/`([^`]+)`/g, (match, code) => {
            const key = `%%MACRO_${id}_${Object.keys(macros).length}%%`
            macros[key] = match
            return alt + key + alt
          })
        }
        text = text.replace(/`/g, alt)
        map = (text) => {
          for (const [key, value] of Object.entries(macros)) text = text.replaceAll(alt + key + alt, value)
          text = text.replace(new RegExp(alt, 'g'), '`')
          return text
        }
        break
      }
    }
    if (!map) {
      // we just assume that double quotes parse (might not be true)
      text = text.replace(/`[^`]+`/g, (match) => {
        const key = `"%%MACRO_${id}_${Object.keys(macros).length}%%"`
        macros[key] = match
        return key
      }).replace(/`/g, `"%%MACRO_${id}_DQ%%"`)
      map = (text) => {
        for (const [key, value] of Object.entries(macros)) text = text.replace(new RegExp(key, 'g'), value)
        return text.replaceAll(`"%%MACRO_${id}_DQ%%"`, '`')
      }
    }
  }

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
    .map((part) => map ? map(part.text) : part.text)
    .filter((part) => part)

  return result
}
