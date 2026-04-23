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

/**
 * Configuration of the js module.
 */
export const js = {
  // Build: generate script-ctxdemo.js and script-ctxproduction.js variants
  buildContexts: ['demo', 'production'],

  // Resolve context names to configuration objects
  contextResolve: (ctxName) => {
    if (ctxName === 'demo') {
      return {
        apiUrl: 'https://demo.api.example.com',
        apiKey: 'demo_key_12345',
        features: {
          darkMode: true,
          analytics: false,
          debugMode: true
        }
      }
    }
    if (ctxName === 'production') {
      return {
        apiUrl: 'https://api.example.com',
        apiKey: 'prod_key_67890',
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
