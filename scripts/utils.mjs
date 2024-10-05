/**
 * Converts a string to an HTML ID.
 * @param {string} value The string to convert.
 * @returns {string} The converted string.
 */
export function toID (value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '-')
}
