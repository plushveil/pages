const url = require('node:url')
const path = require('node:path')
const util = require('node:util')

const languageServer = require('vscode-languageserver/node')
const languageService = require('vscode-html-languageservice')
const languageServerTextDocument = require('vscode-languageserver-textdocument')

const connection = languageServer.createConnection(languageServer.ProposedFeatures.all)
const documents = new languageServer.TextDocuments(languageServerTextDocument.TextDocument)
const service = languageService.getLanguageService()

util.inspect.defaultOptions.depth = null

/**
 * @type {Map<string, languageService.HTMLDocument>}
 */
const htmlDocuments = new Map()

// settings
let settings = {}

// Handle document open events
documents.onDidOpen(throwable((event) => {
  const document = event.document
  const htmlDocument = service.parseHTMLDocument(document)
  htmlDocuments.set(document.uri, htmlDocument)
}))

// Handle document open/change events
documents.onDidChangeContent(throwable((event) => {
  const document = event.document
  const htmlDocument = service.parseHTMLDocument(document)
  htmlDocuments.set(document.uri, htmlDocument)
}))

// Handle document formatting requests
connection.onDocumentFormatting(throwableAsync(async (event) => {
  const textDocument = documents.get(event.textDocument.uri)
  if (textDocument.languageId !== 'pages' || settings?.pages?.diagnostics === false) {
    return
  }

  const format = (await import('@plushveil/pages/modules/html/src/format.mjs')).default
  const [page, config, api] = await getPageConfigApi(textDocument)
  const textEdits = await format(page, config, api)

  return textEdits
}))

// Handle document close events
documents.onDidClose(throwable((event) => {
  htmlDocuments.delete(event.document.uri)
}))

// Handle configuration changes
connection.onDidChangeConfiguration(throwable((event) => {
  settings = event.settings
}))

// Handle completion requests
connection.onCompletion(throwableAsync(async (event) => {
  await new Promise(resolve => setTimeout(resolve, 10))

  const completions = []

  if (settings?.pages?.suggestions) {
    const document = documents.get(event.textDocument.uri)
    const position = event.position
    const offset = document.offsetAt(position)
    const text = document.getText()
    const parse = (await import('@plushveil/pages/modules/html/parser/parse.mjs')).default
    const htmlDocument = parse(text)

    const node = htmlDocument.iterator(true).filter(node => {
      if (node.offset.start <= offset && offset <= node.offset.end) return true
      return false
    }).reduce((node, next) => {
      if (!node) return next
      if (node.offset.start > next.offset.start) return node
      return next
    }, null)

    const isTemplateStringWithSyntaxError = (node.type === 'text' && node.text.trim().startsWith('${') && node.text.trim().endsWith('}'))
    if (isTemplateStringWithSyntaxError) {
      const fixedNode = { ...node }

      // fix whitespace in beginning
      const whitespaceStart = fixedNode.text.match(/^\s*/)[0]
      fixedNode.text = fixedNode.text.slice(whitespaceStart.length)
      fixedNode.offset.start += whitespaceStart.length

      // approximate closing brace position
      const closingBracePosition = (() => {
        let depth = 1
        let i = 2
        while (i < fixedNode.text.length) {
          const char = fixedNode.text[i]
          if (char === '{') depth++
          if (char === '}') depth--
          if (depth === 0) return i
          i++
        }
        return -1
      })()
      if (closingBracePosition !== -1) {
        fixedNode.text = fixedNode.text.slice(0, closingBracePosition + 1)
        fixedNode.offset.end = fixedNode.offset.start + closingBracePosition + 1
      }

      // fix whitespace in end
      const whitespaceEnd = fixedNode.text.match(/\s*$/)[0]
      fixedNode.text = fixedNode.text.slice(0, fixedNode.text.length - whitespaceEnd.length)
      fixedNode.offset.end -= whitespaceEnd.length

      fixedNode.range.start = htmlDocument.getTextDocument().positionAt(fixedNode.offset.start)
      fixedNode.range.end = htmlDocument.getTextDocument().positionAt(fixedNode.offset.end)

      completions.push(...(await getScriptCompletions(fixedNode, htmlDocument, offset, event.textDocument.uri)))
    } else if (node.type === 'template') {
      completions.push(...(await getScriptCompletions(node, htmlDocument, offset, event.textDocument.uri)))
    } else {
      const htmlDocument = htmlDocuments.get(event.textDocument.uri)
      const htmlCompletions = service.doComplete(document, position, htmlDocument)
      completions.push(...htmlCompletions.items)
    }
  }

  return {
    isIncomplete: false,
    items: completions
  }
}))

/**
 * @param {import('@plushveil/pages/modules/html/parser/iterator.mjs').Node} node
 * @param {import('@plushveil/pages/modules/html/parser/parse.mjs').HTMLDocument} htmlDocument
 * @param {number} offset
 * @param {string} fileUrl
 * @returns {Promise<languageServer.CompletionItem[]>}
 */
async function getScriptCompletions (node, htmlDocument, offset, fileUrl) {
  const script = node.text.slice(2, -1)
  const position = offset - node.offset.start - 2
  const closestHtmlNode = htmlDocument.findNodeAt(node.offset.start)

  const getCompletions = (await import('./languageservice-ts.mjs')).default
  const getContexts = (await import('@plushveil/pages/modules/html/utils/getContexts.mjs')).default
  const getExports = (await import('@plushveil/pages/modules/html/utils/getExports.mjs')).default

  const exported = []
  const importToCodeMap = {}
  const context = Object.entries(getContexts(htmlDocument, closestHtmlNode)).map(([index, code]) => {
    const exports = getExports(code).filter(e => exported.indexOf(e) === -1)
    if (exports.length === 0) return ''
    exported.push(...exports)
    const importSpecifier = (fileUrl.includes('.') ? fileUrl.replace(/\.([^.]*)$/, `.${index}.$1`) : `${fileUrl}.${index}`).replaceAll('.', '-') + '.ts'
    importToCodeMap[importSpecifier] = code
    return `import { ${exports.join(', ')} } from '${importSpecifier}'`
  }).join('\n') + '\n'

  const tscompletions = await getCompletions(fileUrl, context + script, importToCodeMap, context.length + position)

  const completions = tscompletions?.entries?.map(entry => {
    const item = languageServer.CompletionItem.create(entry.name)
    for (const key in entry) {
      if (key === 'name') continue
      if (key === 'kind') {
        const scriptElementKindToCompletionItemKind = {
          alias: languageServer.CompletionItemKind.Reference,
          class: languageServer.CompletionItemKind.Class,
          interface: languageServer.CompletionItemKind.Interface,
          module: languageServer.CompletionItemKind.Module,
          type: languageServer.CompletionItemKind.TypeParameter,
          enum: languageServer.CompletionItemKind.Enum,
          'enum member': languageServer.CompletionItemKind.EnumMember,
          function: languageServer.CompletionItemKind.Function,
          method: languageServer.CompletionItemKind.Method,
          property: languageServer.CompletionItemKind.Property,
          var: languageServer.CompletionItemKind.Variable,
          'local var': languageServer.CompletionItemKind.Variable,
          parameter: languageServer.CompletionItemKind.Variable,
          'type parameter': languageServer.CompletionItemKind.TypeParameter,
          keyword: languageServer.CompletionItemKind.Keyword,
          string: languageServer.CompletionItemKind.Text,
          primitive: languageServer.CompletionItemKind.Text,
          'JSX attribute': languageServer.CompletionItemKind.Property,
          constructor: languageServer.CompletionItemKind.Constructor,
          directory: languageServer.CompletionItemKind.Folder,
          'external module name': languageServer.CompletionItemKind.Module,
          const: languageServer.CompletionItemKind.Constant,
          let: languageServer.CompletionItemKind.Variable
        }
        item.kind = scriptElementKindToCompletionItemKind[entry.kind] || languageServer.CompletionItemKind.Snippet
      }
      item[key] = entry[key]
    }
    return item
  }) || []

  return completions.filter(completion => {
    if (completion.sortText === '15') return false
    return true
  })
}

// Handle completion resolve requests
connection.onCompletionResolve(throwable((item) => {
  return item
}))

// Handle diagnostics requests
connection.onRequest('textDocument/diagnostic', throwableAsync(async (event) => {
  const textDocument = documents.get(event.textDocument.uri)
  if (textDocument.languageId !== 'pages' || settings?.pages?.diagnostics === false) {
    return
  }

  const diagnose = (await import('@plushveil/pages/modules/html/src/diagnose.mjs')).default
  const [page, config, api] = await getPageConfigApi(textDocument)
  const diagnostics = (await diagnose(page, config, api)).map(problem => {
    if (problem.offset) {
      problem.start = textDocument.positionAt(problem.offset.start)
      problem.end = textDocument.positionAt(problem.offset.end)
    }
    return languageServer.Diagnostic.create(
      languageServer.Range.create(
        languageServer.Position.create(problem.start.line, problem.start.character),
        languageServer.Position.create(problem.end.line, problem.end.character)
      ),
      problem.message,
      languageServer.DiagnosticSeverity.Error
    )
  })

  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics })
}))

// Initialize the language server
connection.onInitialize(throwable((...args) => {
  return {
    capabilities: {
      textDocumentSync: languageServer.TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: true
      },
      documentFormattingProvider: true,
      diagnosticProvider: {
        identifier: 'pages',
        workspaceDiagnostics: false,
        interFileDependencies: false,
      },
    },
  }
}))

// Start the language server
console.log('Starting "Pages Language Server"')
documents.listen(connection)
connection.listen()

/**
 *
 * @param {languageService.TextDocument} textDocument
 */
async function getPageConfigApi (textDocument) {
  const getConfig = (await import('@plushveil/pages/src/config.mjs')).default
  const getApi = (await import('@plushveil/pages/src/api.mjs')).default
  const file = url.fileURLToPath(textDocument.uri)
  const api = await getApi()
  const config = await getConfig()
  if (!config.root) config.root = path.dirname(file)
  const page = {
    url: new URL(path.relative(config.root, file), config.baseURI),
    params: {
      headers: {
        'Content-Type': 'text/html',
        'X-Partial': 'true',
      },
    },
    fileUrl: url.pathToFileURL(file),
    content: textDocument.getText(),
  }

  return [page, config, api]
}

/**
 * Creates a function that catches and logs errors.
 * @param {function} f - The function to wrap.
 * @returns {function} The wrapped function.
 */
function throwable (f) {
  return (...args) => {
    try {
      return f(...args)
    } catch (err) {
      console.error(err)
      connection.console.log('Error in "Pages Language Server":')
      connection.console.error(err.stack)
    }
  }
}

/**
 * Creates a function that catches and logs errors.
 * @param {function} f - The function to wrap.
 * @returns {function<Promise<any>>} The wrapped function.
 */
function throwableAsync (f) {
  return async (...args) => {
    try {
      return await f(...args)
    } catch (err) {
      console.error(err)
      connection.console.log('Error in "Pages Language Server":')
      connection.console.error(err.stack)
    }
  }
}
