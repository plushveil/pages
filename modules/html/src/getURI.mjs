/**
 * Gets the URI of a path.
 * @param {URL} baseURI - The base URI.
 * @param {string} path - The path.
 * @returns {URL}
 */
export default function getURI (baseURI, path) {
  if (baseURI.pathname.endsWith('/') && path.startsWith('/')) while (path.startsWith('/')) path = path.slice(1)
  const url = new URL(`${baseURI.pathname}${path}`, baseURI)
  return url
}
