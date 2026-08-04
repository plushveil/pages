import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * Scans HTML files to discover ?ctx=X references in script/link tags
 *
 * @param {string[]} htmlFiles - Array of HTML file paths
 * @param {import('../../../src/config.mjs').Config} config - The configuration
 * @returns {Map<string, Set<string>>} Map of JS file URLs to Set of context names
 */
export default function discoverContexts(htmlFiles, config) {
  const contextsMap = new Map()

  for (const file of htmlFiles) {
    try {
      const content = fs.readFileSync(file, 'utf-8')

      // Match src="..." or href="..." attributes that contain query parameters
      // Captures: attribute name, full value including query params
      const attrRegex = /(?<attribute>src|href)=["'](?<fullValue>[^"']*\?[^"']*)["']/gi
      let match = null

      while ((match = attrRegex.exec(content)) !== null) {
        const fullValue = match.groups?.fullValue || ''

        // Parse the URL to extract path and query params
        if (!fullValue.includes('?ctx=')) continue

        const [pathname, queryString] = fullValue.split('?', 2)
        const params = new URLSearchParams(queryString)
        const ctxParam = params.get('ctx')

        if (!ctxParam) continue

        // Resolve relative path to absolute URL path
        // Handle ./, ../, and / prefixes
        let resolvedPath = ''
        if (pathname.startsWith('./') || pathname.startsWith('../')) {
          // Relative to the HTML file
          const htmlDir = path.dirname(file)
          const resolved = path.resolve(htmlDir, pathname)
          const relative = path.relative(config.root, resolved)
          resolvedPath = `/${relative.replaceAll(path.sep, '/').replaceAll('../', '')}`
        } else if (pathname.startsWith('/')) {
          // Absolute from root
          resolvedPath = pathname
        } else {
          // Treat as relative
          const htmlDir = path.dirname(file)
          const resolved = path.resolve(htmlDir, pathname)
          const relative = path.relative(config.root, resolved)
          resolvedPath = `/${relative.replaceAll(path.sep, '/').replaceAll('../', '')}`
        }

        // Convert .ts to .js for JS files
        if (resolvedPath.endsWith('.ts')) {
          resolvedPath = resolvedPath.replace(/\.ts$/, '.js')
        }

        // Store the context for this file
        if (!contextsMap.has(resolvedPath)) {
          contextsMap.set(resolvedPath, new Set())
        }
        contextsMap.get(resolvedPath).add(ctxParam)
      }
    } catch (err) {
      // Ignore files that can't be read
      console.warn(`Could not scan ${file} for contexts:`, err.message)
    }
  }

  return contextsMap
}
