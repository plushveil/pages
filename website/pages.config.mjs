/**
 * @file Configuration for the @plushveil/pages website
 */

/**
 * The base URI of the website.
 * @type {URL}
 */
export const baseURI = new URL(
  process.env.HOST
    ? (process.env.HOST.includes('://') ? process.env.HOST : `https://${process.env.HOST}`)
    : 'http://localhost:3000'
)

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

/**
 * Configuration of the js module.
 */
export const js = {
  // Resolve context names to configuration objects
  // Contexts are auto-discovered from HTML files with ?ctx=X query parameters
  contextResolve: (ctxName) => {
    if (ctxName === 'demo') {
      return {
        publicApiUrl: 'https://demo.api.example.com',
        publicApiKey: 'demo_key_12345',
        features: {
          darkMode: true,
          analytics: false,
          debugMode: true
        }
      }
    }
    if (ctxName === 'production') {
      return {
        publicApiUrl: 'https://api.example.com',
        publicApiKey: 'prod_key_67890',
        features: {
          darkMode: true,
          analytics: true,
          debugMode: false
        }
      }
    }
  }
}

/**
 * Configuration of the js module.
 */
