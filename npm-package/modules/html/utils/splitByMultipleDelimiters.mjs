/**
 * Split a string by multiple delimiters
 * @param {string} str The string to split
 * @param {string[]} delimiters The delimiters to split by
 * @returns {string[]} The split segments
 */
export default function splitByMultipleDelimiters (str, delimiters) {
  const uniqueDelimiters = [...new Set(delimiters)].filter(d => d !== '')
  uniqueDelimiters.sort((a, b) => b.length - a.length)

  const result = []
  let currentSegment = ''
  let i = 0

  while (i < str.length) {
    let found = false
    for (const delimiter of uniqueDelimiters) {
      const endIndex = i + delimiter.length
      if (endIndex > str.length) continue

      const substring = str.substring(i, endIndex)
      if (substring === delimiter) {
        if (currentSegment !== '') {
          result.push(currentSegment)
          currentSegment = ''
        }
        result.push(delimiter)
        i = endIndex
        found = true
        break
      }
    }

    if (!found) {
      currentSegment += str[i]
      i++
    }
  }

  if (currentSegment !== '') {
    result.push(currentSegment)
  }

  return result
}
