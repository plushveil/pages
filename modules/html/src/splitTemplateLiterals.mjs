/**
 * Splits a text with template literals into parts.
 * @param {string} text - The text.
 * @returns {string[]} The parts.
 */
export default function splitTemplateLiterals (text) {
  if (typeof text !== 'string') throw new TypeError('text must be a string')

  const hasDollar = text.includes('${')
  if (!hasDollar) return text ? [text] : []

  const parts = []

  let start = 0
  while (start < text.length) {
    const dollar = text.indexOf('${', start)
    if (dollar === -1) {
      parts.push(text.slice(start))
      break
    }

    if (dollar > start) parts.push(text.slice(start, dollar))

    const open = dollar + 2
    let close = open
    let depth = 1
    while (depth > 0) {
      const nextOpen = text.indexOf('${', close)
      const nextClose = text.indexOf('}', close)
      if (nextClose === -1) throw new SyntaxError('Unterminated template literal')
      if (nextOpen === -1 || nextClose < nextOpen) {
        close = nextClose + 1
        depth--
      } else {
        close = nextOpen + 2
        depth++
      }
    }

    const previous = parts[parts.length - 1]

    // check if the dollar sign is escaped
    let escaped = 0
    while (previous?.[previous.length - escaped - 1] === '\\') escaped++

    if (escaped % 2 !== 0) {
      const nextOpen = text.indexOf('${', close)
      if (nextOpen === -1) {
        parts[parts.length - 1] += text.slice(dollar)
        break
      } else {
        parts[parts.length - 1] += text.slice(dollar, nextOpen)
        start = nextOpen
        continue
      }
    }

    // check if the dollar sign is inside a string
    if (previous && countOccurrences(previous, '`') % 2 === 1) {
      const nextOpen = text.indexOf('${', close)
      if (nextOpen === -1) {
        parts[parts.length - 1] += text.slice(dollar)
        break
      } else {
        parts[parts.length - 1] += text.slice(dollar, nextOpen)
        start = nextOpen
        continue
      }
    }

    const part = text.slice(dollar, close)
    parts.push(part)
    start = close
  }

  return parts
}

/**
 * Returns the number of occurrences of a substring in a text.
 * @param {string} text - The text.
 * @param {string} substring - The substring.
 * @returns {number} The number of occurrences.
 */
function countOccurrences (text, substring) {
  let count = 0
  let position = text.indexOf(substring)

  while (position !== -1) {
    count++
    position = text.indexOf(substring, position + substring.length)
  }

  return count
}
