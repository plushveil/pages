import * as path from 'node:path'
import * as url from 'node:url'
import * as util from 'node:util'

import * as languageService from 'vscode-html-languageservice'
import * as languageServerTextDocument from 'vscode-languageserver-textdocument'
import * as languageServer from 'vscode-languageserver/node'

import getCompletions from './languageservice-ts'

const connection = languageServer.createConnection(languageServer.ProposedFeatures.all)
const documents = new languageServer.TextDocuments(languageServerTextDocument.TextDocument)
const service = languageService.getLanguageService()

util.inspect.defaultOptions.depth = null

const htmlDocuments = new Map<string, languageService.HTMLDocument>()
let settings: any = {}

documents.onDidOpen(
  throwable((event: any) => {
    const { document } = event
    const htmlDocument = service.parseHTMLDocument(document)
    htmlDocuments.set(document.uri, htmlDocument)
  }),
)

documents.onDidChangeContent(
  throwable((event: any) => {
    const { document } = event
    const htmlDocument = service.parseHTMLDocument(document)
    htmlDocuments.set(document.uri, htmlDocument)
  }),
)

connection.onDocumentFormatting(
  throwableAsync(async (event: any) => {
    const textDocument = documents.get(event.textDocument.uri)
    if (textDocument.languageId !== 'pages' || settings?.pages?.diagnostics === false) {
      return
    }

    const format = (await import('../../npm-package/dist/modules/html/src/format.js')).default
    const [page, config, api] = await getPageConfigApi(textDocument)
    const textEdits = await format(page, config, api)

    return textEdits
  }),
)

documents.onDidClose(
  throwable((event: any) => {
    htmlDocuments.delete(event.document.uri)
  }),
)

connection.onDidChangeConfiguration(
  throwable((event: any) => {
    settings = event.settings
  }),
)

connection.onCompletion(
  throwableAsync(async (event: any) => {
    await new Promise((resolve) => setTimeout(resolve, 10))

    const completions: languageServer.CompletionItem[] = []

    if (settings?.pages?.suggestions) {
      const document = documents.get(event.textDocument.uri)
      const { position } = event
      const offset = document.offsetAt(position)
      const text = document.getText()
      const parse = (await import('../../npm-package/dist/modules/html/parser/parse.js')).default
      const htmlDocument = parse(text)

      const node = htmlDocument
        .iterator(true)
        .filter((node: any) => {
          if (node.offset.start <= offset && offset <= node.offset.end) {
            return true
          }
          return false
        })
        .reduce((node: any, next: any) => {
          if (!node) {
            return next
          }
          if (node.offset.start > next.offset.start) {
            return node
          }
          return next
        }, null)

      const isTemplateStringWithSyntaxError = node.type === 'text' && node.text.trim().startsWith('${') && node.text.trim().endsWith('}')
      if (isTemplateStringWithSyntaxError) {
        const fixedNode = { ...node }

        const whitespaceStart = fixedNode.text.match(/^\s*/)[0]
        fixedNode.text = fixedNode.text.slice(whitespaceStart.length)
        fixedNode.offset.start += whitespaceStart.length

        const closingBracePosition = (() => {
          let depth = 1
          let i = 2
          while (i < fixedNode.text.length) {
            const char = fixedNode.text[i]
            if (char === '{') {
              depth++
            }
            if (char === '}') {
              depth--
            }
            if (depth === 0) {
              return i
            }
            i++
          }
          return -1
        })()
        if (closingBracePosition !== -1) {
          fixedNode.text = fixedNode.text.slice(0, closingBracePosition + 1)
          fixedNode.offset.end = fixedNode.offset.start + closingBracePosition + 1
        }

        const whitespaceEnd = fixedNode.text.match(/\s*$/)[0]
        fixedNode.text = fixedNode.text.slice(0, fixedNode.text.length - whitespaceEnd.length)
        fixedNode.offset.end -= whitespaceEnd.length

        fixedNode.range.start = htmlDocument.getTextDocument().positionAt(fixedNode.offset.start)
        fixedNode.range.end = htmlDocument.getTextDocument().positionAt(fixedNode.offset.end)

        completions.push(...(await getScriptCompletions(fixedNode, htmlDocument, offset, event.textDocument.uri)))
      } else if (node.type === 'template') {
        completions.push(...(await getScriptCompletions(node, htmlDocument, offset, event.textDocument.uri)))
      } else {
        const cachedHtmlDocument = htmlDocuments.get(event.textDocument.uri)
        const htmlCompletions = service.doComplete(document, position, cachedHtmlDocument)
        completions.push(...htmlCompletions.items)
      }
    }

    return {
      isIncomplete: false,
      items: completions,
    }
  }),
)

async function getScriptCompletions(node: any, htmlDocument: any, offset: number, fileUrl: string): Promise<languageServer.CompletionItem[]> {
  const script = node.text.slice(2, -1)
  const position = offset - node.offset.start - 2
  const closestHtmlNode = htmlDocument.findNodeAt(node.offset.start)

  const getContexts = (await import('../../npm-package/dist/modules/html/utils/getContexts.js')).default
  const getExports = (await import('../../npm-package/dist/modules/html/utils/getExports.js')).default

  const exported: string[] = []
  const importToCodeMap: Record<string, string> = {}
  const context = `${Object.entries(getContexts(htmlDocument, closestHtmlNode))
    .map(([index, code]: [string, any]) => {
      const exports = getExports(code).filter((e: string) => exported.indexOf(e) === -1)
      if (exports.length === 0) return ''
      exported.push(...exports)
      const importSpecifier = (fileUrl.includes('.') ? fileUrl.replace(/\.([^.]*)$/, `.${index}.$1`) : `${fileUrl}.${index}`).replaceAll('.', '-') + '.ts'
      importToCodeMap[importSpecifier] = code
      return `import { ${exports.join(', ')} } from '${importSpecifier}'`
    })
    .join('\n')}\n`

  const tscompletions = await getCompletions(fileUrl, context + script, importToCodeMap, context.length + position)

  const mappedCompletions =
    tscompletions?.entries?.map((entry: any) => {
      const item = languageServer.CompletionItem.create(entry.name)
      for (const key in entry) {
        if (key === 'name') {
          continue
        }
        if (key === 'kind') {
          const scriptElementKindToCompletionItemKind: Record<string, languageServer.CompletionItemKind> = {
            'JSX attribute': languageServer.CompletionItemKind.Property,
            alias: languageServer.CompletionItemKind.Reference,
            class: languageServer.CompletionItemKind.Class,
            const: languageServer.CompletionItemKind.Constant,
            constructor: languageServer.CompletionItemKind.Constructor,
            directory: languageServer.CompletionItemKind.Folder,
            enum: languageServer.CompletionItemKind.Enum,
            'enum member': languageServer.CompletionItemKind.EnumMember,
            'external module name': languageServer.CompletionItemKind.Module,
            function: languageServer.CompletionItemKind.Function,
            interface: languageServer.CompletionItemKind.Interface,
            keyword: languageServer.CompletionItemKind.Keyword,
            let: languageServer.CompletionItemKind.Variable,
            'local var': languageServer.CompletionItemKind.Variable,
            method: languageServer.CompletionItemKind.Method,
            module: languageServer.CompletionItemKind.Module,
            parameter: languageServer.CompletionItemKind.Variable,
            primitive: languageServer.CompletionItemKind.Text,
            property: languageServer.CompletionItemKind.Property,
            string: languageServer.CompletionItemKind.Text,
            type: languageServer.CompletionItemKind.TypeParameter,
            'type parameter': languageServer.CompletionItemKind.TypeParameter,
            var: languageServer.CompletionItemKind.Variable,
          }
          item.kind = scriptElementKindToCompletionItemKind[entry.kind] || languageServer.CompletionItemKind.Snippet
        }
        ;(item as any)[key] = entry[key]
      }
      return item
    }) || []

  return mappedCompletions.filter((completion: any) => {
    if (completion.sortText === '15') {
      return false
    }
    return true
  })
}

connection.onCompletionResolve(throwable((item: any) => item))

connection.onRequest(
  'textDocument/diagnostic',
  throwableAsync(async (event: any) => {
    const textDocument = documents.get(event.textDocument.uri)
    if (textDocument.languageId !== 'pages' || settings?.pages?.diagnostics === false) {
      return
    }

    const diagnose = (await import('../../npm-package/dist/modules/html/src/diagnose.js')).default
    const [page, config, api] = await getPageConfigApi(textDocument)
    const diagnostics = (await diagnose(page, config, api)).map((problem: any) => {
      if (problem.offset) {
        problem.start = textDocument.positionAt(problem.offset.start)
        problem.end = textDocument.positionAt(problem.offset.end)
      }
      return languageServer.Diagnostic.create(
        languageServer.Range.create(languageServer.Position.create(problem.start.line, problem.start.character), languageServer.Position.create(problem.end.line, problem.end.character)),
        problem.message,
        languageServer.DiagnosticSeverity.Error,
      )
    })

    connection.sendDiagnostics({ diagnostics, uri: textDocument.uri })
  }),
)

connection.onInitialize(
  throwable(() => ({
    capabilities: {
      textDocumentSync: languageServer.TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: true,
      },
      documentFormattingProvider: true,
      diagnosticProvider: {
        identifier: 'pages',
        workspaceDiagnostics: false,
        interFileDependencies: false,
      },
    },
  })),
)

console.log('Starting "Pages Language Server"')
documents.listen(connection)
connection.listen()

async function getPageConfigApi(textDocument: any) {
  const getConfig = (await import('../../npm-package/dist/src/config.js')).default
  const getApi = (await import('../../npm-package/dist/src/api.js')).default
  const file = url.fileURLToPath(textDocument.uri)
  const api = await getApi()
  const config = await getConfig()
  if (!config.root) {
    config.root = path.dirname(file)
  }
  const page = {
    content: textDocument.getText(),
    fileUrl: url.pathToFileURL(file),
    params: {
      headers: {
        'Content-Type': 'text/html',
        'X-Partial': 'true',
      },
    },
    url: new URL(path.relative(config.root, file), config.baseURI),
  }

  return [page, config, api]
}

function throwable(f: (...args: any[]) => any) {
  return (...args: any[]) => {
    try {
      return f(...args)
    } catch (err: any) {
      console.error(err)
      connection.console.log('Error in "Pages Language Server":')
      connection.console.error(err.stack)
    }
  }
}

function throwableAsync(f: (...args: any[]) => Promise<any>) {
  return async (...args: any[]) => {
    try {
      return await f(...args)
    } catch (err: any) {
      console.error(err)
      connection.console.log('Error in "Pages Language Server":')
      connection.console.error(err.stack)
    }
  }
}
