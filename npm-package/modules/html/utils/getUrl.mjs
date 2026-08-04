/**
 * Returns a URL object from a string URL and a config object.
 *
 * @param {string} url - The URL.
 * @param {{ baseURI: string }} config - The config
 * @returns {URL} The URL object.
 */
export default function getUrl(url, config) {
  if (!config.baseURI) throw new Error('The base URI is not defined')
  while (url.startsWith('/')) url = url.slice(1)
  return new URL(url, config.baseURI)
}
