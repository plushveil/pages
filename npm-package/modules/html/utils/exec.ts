/**
 * @file This file is not imported, the content of the file is set as the source of a module script.
 *   Meaning: import.meta.url refers to an imported file, rather than exec.js.
 *   See the module loader hook in ../addons/template-literals.js.
 */

import * as module from 'node:module'
import * as path from 'node:path'
import * as url from 'node:url'

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor

const scriptsMap = {}

module.registerHooks({
  /**
   * @param {string} specifier - The specifier to resolve
   * @param {{ conditions: string[]; importAttributes: {}; parentURL: string }} context - The context object
   * @param {Function<string, {}>} nextResolve - The subsequent resolve hook in the chain, or the Node.js default resolve hook after the last user-supplied resolve hook
   * @returns {{ format: string; url: string; importAttributes: {}; shortCircuit: boolean }} - The result object
   * @see https://nodejs.org/api/module.html#resolvespecifier-context-nextresolve
   */
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === import.meta.url && specifier.includes('script_id=')) {
      try {
        const specifierUrl = new URL(specifier)
        if (specifierUrl.searchParams.has('script_id')) {
          return {
            format: 'module',
            url: specifierUrl.toString(),
            importAttributes: {
              ...context.importAttributes,
              script: specifierUrl.searchParams.get('script_id'),
              parentURL: import.meta.url,
            },
            shortCircuit: true,
          }
        }
      } catch {}
    }
    return nextResolve(specifier, context)
  },
  /**
   * @param {string} moduleUrl - The URL returned by the resolve chain
   * @param {{ conditions: string[]; format: string; importAttributes: {} }} context - The context object
   * @param {Function<string, {}>} nextLoad - The subsequent load hook in the chain, or the Node.js default load hook after the last user-supplied load hook
   * @returns {{ format: string; shortCircuit: boolean; source: string }} - The result object
   * @see https://nodejs.org/api/module.html#loadurl-context-nextload
   */
  load(moduleUrl, context, nextLoad) {
    if (context.importAttributes?.parentURL === import.meta.url && context.importAttributes.script) {
      const source = scriptsMap[context.importAttributes.script]
      return {
        format: 'module',
        shortCircuit: true,
        source,
      }
    }
    return nextLoad(moduleUrl, context)
  },
})

/**
 * Executes a code.
 *
 * @param {string} code - The code to execute.
 * @param {import('../addons/template-literals.js').nodeDetails[]} scripts - The scripts.
 * @param {import('../../../src/pages.js').Page} page - The page.
 * @param {import('../../../src/config.js').Config} config - The configuration.
 * @param {import('../../../src/api.js').API} api - The API.
 * @returns {Promise<any>} The result.
 */
export default async function exec(code, scripts, _page, _config, _api) {
  for (const script of scripts || []) scriptsMap[`${script.id}`] = script.node.code || script.node.text

  const imported = ['default']
  const codeWithContext = [
    ...(scripts || []).map((script) => {
      const imports = script.exports.filter((exportName) => {
        if (imported.includes(exportName)) return false
        imported.push(exportName)
        return true
      })
      if (imports.length === 0) return ''
      const importUrl = new URL(import.meta.url)
      importUrl.searchParams.set('script_id', script.id)
      const importCode = `const { ${imports.join(', ')} } = await import('${importUrl}')`
      return importCode
    }),
    `return ${code}`,
  ].join('\n')

  const execFilename = url.fileURLToPath(import.meta.url)
  const execDirname = path.dirname(execFilename)
  const context = {
    __filename: execFilename,
    __dirname: execDirname,
  }

  const fn = new AsyncFunction(...Object.keys(context), codeWithContext)
  try {
    const result = await fn(...Object.values(context))
    return result
  } catch (err) {
    if (err.stack) err.message = replaceError(err.stack)
    else err.message = replaceError(err.message)
    throw err
  }
}

/**
 * Replaces the file paths in the error message.
 *
 * @param {string} text - The text.
 * @returns {string} The text with the file paths replaced.
 */
function replaceError(text) {
  return text.replace(/\({0,1}file:\/\/[^\n]*/g, (match) => {
    const [file] = match.match(/file:\/\/[^?#)]*/) || ['']
    const pos = match
      .slice(file.length)
      .split(':')
      .slice(1, 3)
      .map((p) => {
        const [value] = p.match(/\d+/) || ['0']
        return value
      })
    return `(${file}${pos && pos.length === 2 ? `:${pos.join(':')}` : ''})`
  })
}
