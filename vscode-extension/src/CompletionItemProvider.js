const path = require('path')
const fs = require('fs')
const vscode = require('vscode')

const utils = require('./utils.js')

const html = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'html.json'), 'utf8'))

/**
 * @typedef {'html' | 'html-*-attribute-value' | 'html-*-*-value' | 'html-script-target-value' | 'javascript' | 'javascript-export' | 'javascript-template-literal'} Context
 */

// Export the CompletionItemProvider class
module.exports = class CompletionItemProvider {
  /**
   * @type {import('vscode-languageclient/node').LanguageClient}
   */
  client

  /**
   * @param {import('vscode-languageclient/node').LanguageClient} client
   */
  constructor (client) {
    this.client = client
  }

  /**
   * @param {vscode.TextDocument} document
   * @param {vscode.Position} position
   * @param {vscode.CancellationToken} token
   * @param {vscode.CompletionContext} context
   * @returns {Promise<vscode.CompletionItem[]>}
   */
  async provideCompletionItems (document, position, token, context) {
    try {
      const pages = `${document.languageId}`
      if (pages !== 'pages') {
        console.log(`CompletionItemProvider was called for an unknown languageId "${pages}".`)
        return []
      }

      const line = document.lineAt(position).text.substring(0, position.character)
      const lastCharacter = line.charAt(position.character - 1)
      const [completionContext, completionContent] = utils.getContextAndContent(document, position)

      const remoteCompletions = []
      try {
        const completions = await this.client.sendRequest('getCompletions', {
          textDocument: { uri: document.uri.toString() },
          position,
          context: completionContext,
          content: completionContent
        })
        remoteCompletions.push(...(completions || []).map((item) => {
          if (!item.insertText || typeof item.insertText !== 'string') return null
          item.position = new vscode.Position(position.line, position.character)
          if (!completionContext.startsWith('javascript') || item.insertText.includes('.')) {
            item.insertText = new vscode.SnippetString(utils.getCompletionValue(item.insertText, line, position))
          }
          return item
        }).filter(Boolean))
      } catch (err) {
        err.message = 'Error in "Pages Language Server":\n' + err.message
        console.error(err)
      }

      return [
        ...remoteCompletions,
        ...Completion.items
          .filter(item => item.filter(completionContext, line, lastCharacter, position))
          .map(item => item.toCompletionItem(completionContext, line, lastCharacter, position))
      ]
    } catch (err) {
      console.error(err)
      return []
    }
  }
}

/**
 * Represents a single completion item.
 */
class Completion {
  static items = []

  /**
   * The context in which the completion item should be shown.
   * @param {Context} context
   */
  context

  /**
   * Creates a new completion item.
   */
  constructor ({ label, kind, insertText, match, context }) {
    this.label = label
    this.kind = kind
    this.insertText = insertText
    this.match = match || []
    this.context = context
  }

  filter (context, line, lastCharacter, position) {
    if (this.context !== context) return false

    if (this.match.length === 0) {
      const value = this.insertText.value.replace(/\$\d/g, '')
      const current = line.slice(line.lastIndexOf(value.charAt(0)), position.character)
      if (value.startsWith(current)) return true
      return false
    }

    return this.match.every(match => {
      if (match.lastCharacter && match.lastCharacter !== lastCharacter) return false
      if (match.lineDoesNotInclude && line.includes(match.lineDoesNotInclude)) return false
      return true
    })
  }

  toCompletionItem (context, line, lastCharacter, position) {
    return {
      label: this.label,
      kind: this.kind,
      insertText: new vscode.SnippetString(utils.getCompletionValue(this.insertText.value, line, position)),
      range: new vscode.Range(position, position)
    }
  }
}

// Create completions
Completion.items.push(...[
  new Completion({
    label: 'Template literal (${...})', // eslint-disable-line no-template-curly-in-string
    kind: vscode.CompletionItemKind.Class,
    insertText: new vscode.SnippetString('${$0}'), // eslint-disable-line no-template-curly-in-string
    match: [{ lastCharacter: '$' }],
    context: 'html'
  }),

  ...html.map(({ tag, selfClosing }) => new Completion({
    label: tag,
    kind: vscode.CompletionItemKind.Class,
    insertText: new vscode.SnippetString(selfClosing ? `<${tag}$0/>` : `<${tag}>$0</${tag}>`),
    context: 'html'
  })),

  ...(html.map(({ tag, attributes }) => attributes.map((attribute) => new Completion({
    label: attribute.name,
    kind: vscode.CompletionItemKind.Field,
    insertText: attribute.type === 'boolean' ? new vscode.SnippetString(` ${attribute.name}`) : new vscode.SnippetString(` ${attribute.name}="$0"`),
    match: [{ lineDoesNotInclude: ` ${attribute.name}` }],
    context: `html-${tag}-attribute-value`
  }))).flat(Infinity)),

  ...(html.map(({ tag, attributes }) => attributes.map((attribute) => (attribute.values || []).map((value) => new Completion({
    label: value,
    kind: vscode.CompletionItemKind.Value,
    insertText: new vscode.SnippetString(`${value}`),
    match: [{ lastCharacter: '"' }],
    context: `html-${tag}-${attribute.name}-value`
  }))))).flat(Infinity)
])
