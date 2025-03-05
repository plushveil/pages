const path = require('path')
const vscode = require('vscode')

const languageClient = require('vscode-languageclient/node')
const serverPath = path.join(__dirname, 'languageserver.js')

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

  enableLanguageServer(context)
  enableConfigurationWatcher(context)
  enableEmmet()
  connectToLanguageServer(context)
}

/**
 * @param {vscode.ExtensionContext} context
 */
function enableConfigurationWatcher (context) {
  client.sendNotification('workspace/didChangeConfiguration', { settings: vscode.workspace.getConfiguration() })
  const disposable = vscode.workspace.onDidChangeConfiguration((event) => {
    client.sendNotification('workspace/didChangeConfiguration', { settings: vscode.workspace.getConfiguration() })
  })
  context.subscriptions.push(disposable)
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
      debug: { command: process.execPath, args: ['--inspect=6009', serverPath, '--stdio'] }
    },
    // client options
    {
      documentSelector: [
        { scheme: 'file', language: 'pages' }
      ]
    }
  )
  context.subscriptions.push(client)
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
 *
 */
async function connectToLanguageServer (context) {
  console.log('Extension "Pages" is starting language server...')
  await client.start()
  console.log(`Extension "Pages" language server client is running (${client.isRunning()})`)

  // Enable triggerSuggest
  const triggerSuggestListener = vscode.workspace.onDidChangeTextDocument(debounce((event) => {
    const editor = vscode.window.activeTextEditor
    if (!editor || event.document !== editor.document) return
    if (event.contentChanges.length === 0) return
    vscode.commands.executeCommand('editor.action.triggerSuggest')
  }, 30))
  context.subscriptions.push(triggerSuggestListener)
}

/**
 *
 */
function deactivate () {
  console.log('Extension "Pages" is now deactivated.')
}

/**
 * A utility function to debounce a function. This is useful to prevent a function from being called too frequently.
 * @param {function} fn - The function to debounce
 * @param {number} delay - The delay in milliseconds
 * @returns {function} - The debounced function
 */
function debounce (fn, delay) {
  let timeout
  return (...args) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => fn(...args), delay)
  }
}
