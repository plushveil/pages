const url = require('node:url')
const path = require('node:path')
const util = require('node:util')

const languageServer = require('vscode-languageserver/node')
const languageService = require('vscode-html-languageservice')
const languageServerTextDocument = require('vscode-languageserver-textdocument')

util.inspect.defaultOptions.depth = null

const connection = languageServer.createConnection(languageServer.ProposedFeatures.all)
const documents = new languageServer.TextDocuments(languageServerTextDocument.TextDocument)
const service = languageService.getLanguageService()

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
  const document = documents.get(event.textDocument.uri)
  const text = document.getText()
  const range = languageServer.Range.create(0, 0, text.split('\n').length, text.split('\n').pop().length)
  const edits = service.format(document, range, {
    tabSize: settings.editor.tabSize || 2,
    ...settings.html.format
  })

  return edits
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
connection.onCompletion(throwable((event) => {
  const completions = []

  if (settings?.pages?.suggestions) {
    const document = documents.get(event.textDocument.uri)
    const position = event.position
    const htmlDocument = htmlDocuments.get(event.textDocument.uri)
    const htmlCompletions = service.doComplete(document, position, htmlDocument)
    completions.push(...htmlCompletions.items)
  }

  return {
    isIncomplete: false,
    items: completions
  }
}))

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
  const diagnostics = await diagnose(page, config, api)
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
