import * as path from 'node:path'
import * as url from 'node:url'

import * as ts from 'typescript'

const scripts = new Map()
let folder = path.resolve('.')

/**
 * @type {ts.LanguageServiceHost}
 */
const serviceHost = {
  getCompilationSettings: (...args) => ({
    ...ts.getDefaultCompilerOptions(),
    allowJs: true, // In case it's treated as JS
    moduleResolution: ts.ModuleResolutionKind.Node10, // Ensure module resolution
    resolveJsonModule: true,
    allowSyntheticDefaultImports: true
  }),
  getScriptFileNames: () => [...scripts.keys()],
  getScriptVersion: (fileName) => scripts.has(fileName) ? new Date().getTime().toString() : '0',
  getScriptSnapshot: (fileName) => {
    if (scripts.has(fileName)) return ts.ScriptSnapshot.fromString(scripts.get(fileName))
    return undefined
  },
  getCurrentDirectory: () => folder,
  getDefaultLibFileName: (...args) => ts.getDefaultLibFilePath(...args),
  fileExists: (...args) => ts.sys.fileExists(...args),
  readFile: (...args) => ts.sys.readFile(...args),
  readDirectory: (...args) => ts.sys.readDirectory(...args),
  directoryExists: (...args) => ts.sys.directoryExists(...args),
  getDirectories: (...args) => ts.sys.getDirectories(...args),
  realpath: (...args) => ts.sys.realpath(...args),
  trace: (...args) => ts.sys.trace(...args),
  useCaseSensitiveFileNames: (...args) => true,
  getNewLine: () => ts.sys.newLine,
  writeFile: (path, data, writeByteOrderMark) => { throw new Error(`writeFile called with path: ${path}`) },
  resolveModuleNames: (moduleNames, containingFile) => {
    return moduleNames.map((moduleName) => {
      if (scripts.has(moduleName)) {
        return {
          resolvedFileName: moduleName,
          isExternalLibraryImport: false,
          resolvedUsingTsExtension: false,
        }
      }
      return undefined
    })
  }
}

const documentRegistry = ts.createDocumentRegistry(serviceHost.useCaseSensitiveFileNames(), folder)

const languageService = ts.createLanguageService(serviceHost, documentRegistry)

/**
* Get Node code completions.
* @param {string} fileUrl - The file URL.
* @param {string} code - The code.
* @param {Object<string, string>} importToCodeMap - Inline imports.
* @param {number} offset - The offset of the cursor.
* @returns {ts.CompletionInfo | undefined} The completions.
*/
export default async function getCompletions (fileUrl, script, importToCodeMap, offset) {
  const filePath = url.fileURLToPath(fileUrl)
  const fileName = path.basename(filePath) + '.ts'
  folder = path.dirname(filePath)

  for (const [importSpecifier, code] of Object.entries(importToCodeMap)) {
    scripts.set(importSpecifier, code)
    const filepath = url.fileURLToPath(importSpecifier)
    const filename = path.basename(filepath)
    scripts.set(filename, code)
  }
  scripts.set(fileName, script)

  // const issues = languageService.getSemanticDiagnostics(fileName)
  // for (const issue of issues) console.log(issue.messageText || issue)

  const completions = languageService.getCompletionsAtPosition(fileName, offset)
  return completions
}
