/**
 * @file Configuration for the @plushveil/pages website
 */

/**
 * The base URI of the website.
 * @type {URL}
 */
export const baseURI = new URL(process.env.HOST || 'http://localhost:3000')

/**
 * Configuration of the build module.
 */
export const build = {
  ignore: [
    /\/(node_modules|.git)\//,
    /\/(snippets)\//,
    /\.config\.mjs$/,
  ],
}

/**
 * Configuration of the html module.
 */
export const html = {
  minify: true,
  resolve: true
}

/**
 * Configuration of the css module.
 */
export const css = {
  minify: true,
  integrity: false,
}
