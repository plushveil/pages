const path = require('path')
const vscode = require('vscode')

const languageClient = require('vscode-languageclient/node')
const serverPath = path.join(__dirname, 'languageserver.js')

const terminalName = 'pages serve'

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

  enableCommands(context)
  enableLanguageServer(context)
  enableConfigurationWatcher(context)
  enableEmmet()
  connectToLanguageServer(context)
}

/**
 * @param {vscode.ExtensionContext} context
 */
function enableCommands (context) {
  const disposable = vscode.commands.registerCommand('pages.serve', async () => {
    const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    const openTerminal = vscode.window.terminals.find(t => t.name === terminalName)
    const terminal = openTerminal || vscode.window.createTerminal(terminalName)
    terminal.show()

    if (openTerminal) {
      terminal.sendText('\u0003')
      terminal.sendText(process.platform === 'win32' ? 'cls' : 'clear')
    }

    if (!workspace) terminal.sendText('npx @plushveil/pages serve ', false)
    else terminal.sendText(`npx @plushveil/pages serve "${workspace}"`, true)
  })
  context.subscriptions.push(disposable)
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
  const triggerSuggest = () => vscode.commands.executeCommand('editor.action.triggerSuggest')
  const triggerSuggestListener = vscode.workspace.onDidChangeTextDocument((event) => {
    const editor = vscode.window.activeTextEditor
    if (!editor || event.document !== editor.document) return
    if (event.contentChanges.length === 0) return
    if (editor.document.languageId !== 'pages') return

    const content = event.document.getText()
    const change = event.contentChanges[0]
    const before = content.slice(0, change.rangeOffset + 1)
    const insertCharacter = change.text.slice(0, 1)
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
      if (triggerCharacters.includes(insertCharacter)) triggerSuggest()
      return
    }

    const triggerCharacters = '</="\'.{'.split('')
    if (triggerCharacters.includes(insertCharacter)) triggerSuggest()
    else if (change.text === '${}') triggerSuggest()

    const openHtmlTag = (() => {
      const tag = before.slice(before.lastIndexOf('<'))
      const openCount = tag.split('<').length - 1
      const closeCount = tag.split('>').length - 1
      return openCount > closeCount
    })()

    if (openHtmlTag) {
      const triggerCharacters = ' "'.split('')
      if (triggerCharacters.includes(insertCharacter)) triggerSuggest()
    }
  })
  context.subscriptions.push(triggerSuggestListener)
}

/**
 *
 */
function deactivate () {
  console.log('Extension "Pages" is now deactivated.')
  vscode.window.terminals.find(t => t.name === terminalName)?.dispose()
}
