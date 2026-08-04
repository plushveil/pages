import * as path from 'node:path'
import * as url from 'node:url'

import * as ts from 'typescript'

const scripts = new Map<string, string>()
let folder = path.resolve('.')

const serviceHost = {
  directoryExists: (...args: Parameters<typeof ts.sys.directoryExists>) => ts.sys.directoryExists(...args),
  fileExists: (...args: Parameters<typeof ts.sys.fileExists>) => ts.sys.fileExists(...args),
  getCompilationSettings: () => ({
    ...ts.getDefaultCompilerOptions(),
    allowJs: true,
    moduleResolution: ts.ModuleResolutionKind.Node16,
    resolveJsonModule: true,
  }),
  getCurrentDirectory: () => folder,
  getDefaultLibFileName: (...args: Parameters<typeof ts.getDefaultLibFilePath>) => ts.getDefaultLibFilePath(...args),
  getDirectories: (...args: Parameters<typeof ts.sys.getDirectories>) => ts.sys.getDirectories(...args),
  getNewLine: () => ts.sys.newLine,
  getScriptFileNames: () => [...scripts.keys()],
  getScriptSnapshot: (fileName: string) => {
    if (scripts.has(fileName)) return ts.ScriptSnapshot.fromString(scripts.get(fileName) as string)
    return undefined
  },
  getScriptVersion: (fileName: string) => (scripts.has(fileName) ? new Date().getTime().toString() : '0'),
  readDirectory: (...args: Parameters<typeof ts.sys.readDirectory>) => ts.sys.readDirectory(...args),
  readFile: (...args: Parameters<typeof ts.sys.readFile>) => ts.sys.readFile(...args),
  realpath: (...args: Parameters<typeof ts.sys.realpath>) => ts.sys.realpath(...args),
  resolveModuleNames: (moduleNames: string[]) => {
    return moduleNames.map((moduleName) => {
      if (scripts.has(moduleName)) {
        return {
          resolvedFileName: moduleName,
          extension: ts.Extension.Ts,
          isExternalLibraryImport: false,
          resolvedUsingTsExtension: false,
        }
      }
      return undefined
    })
  },
  useCaseSensitiveFileNames: () => true,
  writeFile: (filepath: string) => {
    throw new Error(`writeFile called with path: ${filepath}`)
  },
} as ts.LanguageServiceHost

const documentRegistry = ts.createDocumentRegistry(serviceHost.useCaseSensitiveFileNames(), folder)
const languageService = ts.createLanguageService(serviceHost, documentRegistry)

export default async function getCompletions(fileUrl: string, script: string, importToCodeMap: Record<string, string>, offset: number): Promise<ts.CompletionInfo | undefined> {
  const filePath = url.fileURLToPath(fileUrl)
  const fileName = `${path.basename(filePath)}.ts`
  folder = path.dirname(filePath)
  setImports(importToCodeMap)
  scripts.set(fileName, script)

  const issues = languageService.getSemanticDiagnostics(fileName)
  for (const issue of issues) {
    console.log(issue.messageText || issue)
  }

  const completions = languageService.getCompletionsAtPosition(fileName, offset, undefined)
  clearImports(importToCodeMap)
  scripts.delete(fileName)
  return completions
}

function setImports(importToCodeMap: Record<string, string>) {
  for (const [importSpecifier, code] of Object.entries(importToCodeMap)) {
    scripts.set(importSpecifier, code)
    const filepath = url.fileURLToPath(importSpecifier)
    const filename = path.basename(filepath)
    scripts.set(filename, code)
  }
}

function clearImports(importToCodeMap: Record<string, string>) {
  for (const importSpecifier of Object.keys(importToCodeMap)) {
    scripts.delete(importSpecifier)
    const filepath = url.fileURLToPath(importSpecifier)
    const filename = path.basename(filepath)
    scripts.delete(filename)
  }
}
