const path = require('path')
const vscode = require('vscode')

const CompletionItemProvider = require('./CompletionItemProvider.js')
const VirtualDocumentProvider = require('./VirtualDocumentProvider.js')
const utils = require('./utils.js')

const provider = new VirtualDocumentProvider()

const languageClient = require('vscode-languageclient/node')
const serverPath = path.join(__dirname, 'server.js')

/**
 * @type {boolean}
 */
let active

/**
 * @type {languageClient.LanguageClient}
 */
let client

/**
 *
 */
module.exports = {
  activate,
  deactivate
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate (context) {
  console.log('Extension "Pages" is now active.')
  active = true

  enableVirtualDocuments(context)
  enableLanguageServer(context)
  enableEmmet()
  enableIntellisense(context)
  connectToLanguageServer()
}

/**
 * @param {vscode.ExtensionContext} context
 */
function enableVirtualDocuments (context) {
  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(VirtualDocumentProvider.scheme, provider))
}

/**
 * @param {vscode.ExtensionContext} context
 */
function enableLanguageServer (context) {
  client = new languageClient.LanguageClient(
    'pagesLanguageServer',
    'Pages Language Server',
    // server options
    {
      run: { command: process.execPath, args: [serverPath, '--stdio'] },
      debug: { command: process.execPath, args: ['--inspect=2992', serverPath, '--stdio'] }
    },
    // client options
    {
      documentSelector: [
        { scheme: 'file', language: 'pages' }
      ]
    }
  )
  context.subscriptions.push(client)
  client.onRequest('getVsCodeCompletions', (...args) => getVsCodeCompletions(...args))
  client.onRequest('getContextAndContent', (...args) => getContextAndContent(...args))
}

/**
 *
 */
async function getVsCodeCompletions ({ uri, position, content, language }) {
  const virtualUri = vscode.Uri.parse(`${VirtualDocumentProvider.scheme}:${uri.startsWith('file:') ? uri.slice(5) : uri}`)
  provider.createVirtualDocument(virtualUri, content)

  try {
    const doc = await vscode.workspace.openTextDocument(virtualUri)
    await vscode.languages.setTextDocumentLanguage(doc, language)

    // Request completions
    const pos = new vscode.Position(position.line, position.character)
    const completionList = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', doc.uri, pos)

    // Map completions to LSP format
    return completionList.items.map((item) => ({
      label: item.label,
      kind: item.kind,
      detail: item.detail,
      documentation: item.documentation,
      insertText: item.insertText || item.textEdit?.newText,
      sortText: item.sortText,
      filterText: item.filterText
    }))
  } finally {
    provider.deleteVirtualDocument(virtualUri)
  }
}

/**
 * @param {languageserver.TextDocumentIdentifier} textDocument
 * @param {languageServer.TextDocumentContentChangeEvent[]} contentChanges
 */
async function getContextAndContent (textDocument, contentChanges) {
  try {
    const doc = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === textDocument.uri)
    const range = contentChanges[0].range
    const position = new vscode.Position(range.start.line, range.start.character)
    return [...utils.getContextAndContent(doc, position), doc.getText()]
  } catch (err) {
    console.error(err)
  }
}

/**
 *
 */
function enableEmmet () {
  const emmetConfig = vscode.workspace.getConfiguration('emmet')
  const currentIncludeLanguages = emmetConfig.get('includeLanguages') || {}
  const updatedIncludeLanguages = {
    ...currentIncludeLanguages,
    pages: 'html'
  }
  emmetConfig.update('includeLanguages', updatedIncludeLanguages, vscode.ConfigurationTarget.Global)
}

/**
 * @param {vscode.ExtensionContext} context
 */
function enableIntellisense (context) {
  const disposable = vscode.languages.registerCompletionItemProvider(
    { language: 'pages', scheme: 'file' },
    new CompletionItemProvider(client),
    '<', '$', ' ', '=', '"', '.', '(',
    'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'
  )
  context.subscriptions.push(disposable)

  // Listen for text changes
  const changeListener = vscode.workspace.onDidChangeTextDocument((event) => {
    const editor = vscode.window.activeTextEditor
    if (!editor || event.document !== editor.document) return
    if (event.contentChanges.length === 0) return
    const change = event.contentChanges[0]

    // trim end of line whitespace
    if (change.text === '') {
      const position = editor.selection.active
      const line = editor.document.lineAt(position.line).text
      const nextPart = line.slice(position.character)
      const prevPart = line.slice(0, position.character)
      const clean = nextPart.trim()
      if (prevPart && clean !== nextPart) {
        editor.edit(editBuilder => {
          editBuilder.replace(new vscode.Range(position.line, position.character, position.line, position.character + nextPart.length), clean)
        })
      }
    }

    // immediately trigger suggestions when typing a double quote
    if (change.text.endsWith('"') || change.text === '${}') {
      vscode.commands.executeCommand('editor.action.triggerSuggest')
    }

    // add an extra level of intendation when pressing enter
    // if the next character is </ or if the new line is empty
    if (change.text.startsWith('\n')) {
      const position = editor.selection.active
      const line = editor.document.lineAt(position.line).text
      if (line.includes('>')) {
        const tag = line.match(/<(\w+)/)[1]
        const nextLine = editor.document.lineAt(position.line + 1).text
        if (nextLine.includes(`</${tag}`)) {
          const level = nextLine.match(/^\s*/)[0].length
          editor.edit(editBuilder => {
            editBuilder.insert(position, '\n' + ' '.repeat(level + 2))
            setTimeout(() => { editor.selection = new vscode.Selection(position.line + 1, level + 2, position.line + 1, level + 2) }, 1)
          })
        }
      }
    }
  })
  context.subscriptions.push(changeListener)
}

/**
 *
 */
async function connectToLanguageServer () {
  while (active) { // eslint-disable-line no-unmodified-loop-condition
    try {
      if (!client.isRunning()) {
        console.log('Extension "Pages" is starting language server...')
        await client.start()
        await onLanguageServerClientReady()
      }

      let interval
      await Promise.race([
        new Promise((resolve) => {
          client.onDidChangeState(() => {
            if (!client.isRunning()) {
              console.log('Extension "Pages" language server client disconnected.')
              resolve()
            }
          })
        }),
        new Promise((resolve) => {
          interval = setInterval(() => {
            if (!active) {
              console.log('Extension "Pages" is inactive.')
              resolve()
            }
          }, 10000)
        })
      ])
      clearInterval(interval)
    } catch (err) {
      console.error(err)
      await new Promise(resolve => setTimeout(resolve, 10000))
    }
  }
}

/**
 *
 */
async function onLanguageServerClientReady () {
  console.log(`Extension "Pages" client is running (${client.isRunning()})`)
}

/**
 *
 */
function deactivate () {
  console.log('Extension "Pages" is now deactivated.')
  active = false

  if (client) client.stop()
}
