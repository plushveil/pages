export * from '../npm-package/pages.config'
import { js as jsConfig } from '../npm-package/pages.config'

/**
 * Configuration of the js module.
 */
export const js = {
  ...jsConfig,

  // Resolve context names to configuration objects
  // Contexts are auto-discovered from HTML files with ?ctx=X query parameters
  contextResolve: (ctxName: string) => {
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
