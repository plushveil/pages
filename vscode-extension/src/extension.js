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
  const triggerSuggest = debounce(() => vscode.commands.executeCommand('editor.action.triggerSuggest'), 3000)
  const triggerSuggestListener = vscode.workspace.onDidChangeTextDocument((event) => {
    const editor = vscode.window.activeTextEditor
    if (!editor || event.document !== editor.document) return
    if (event.contentChanges.length === 0) return
    triggerSuggest()

    const content = event.document.getText()
    const change = event.contentChanges[0]
    const before = content.slice(0, change.rangeOffset)
    const lastCharacter = change.text.slice(-1)
    const isInTemplateLiteral = before.includes('${') && (() => {
      const tl = before.slice(before.lastIndexOf('${'))
      const openCount = tl.split('{').length - 1
      const closeCount = tl.split('}').length - 1
      return openCount > closeCount
    })()
    const isInScript = !!before.match(/<script/i) && (() => {
      const script = before.slice(before.toLowerCase().lastIndexOf('<script'))
      const openCount = script.split('<script').length - 1
      const closeCount = script.split('</script').length - 1
      return openCount > closeCount
    })()

    // trigger characters for scripts and template literals
    if (isInTemplateLiteral || isInScript) {
      const triggerCharacters = '."\'[(:'.split('')
      if (triggerCharacters.includes(lastCharacter)) vscode.commands.executeCommand('editor.action.triggerSuggest')
      return
    }

    const triggerCharacters = '</="\' .{'.split('')
    if (triggerCharacters.includes(lastCharacter)) vscode.commands.executeCommand('editor.action.triggerSuggest')
    else if (change.text === '${}') vscode.commands.executeCommand('editor.action.triggerSuggest')
  })
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
