/**
 * @param {string} text
 * @param {{ line: number, column: number }} position
 * @returns {number}
 */
export function getOffsetFromPosition (text, position) {
  const lines = text.split('\n')
  let offset = 0
  for (let i = 0; i < position.line - 1; i++) offset += lines[i].length + 1
  return offset + position.column
}
