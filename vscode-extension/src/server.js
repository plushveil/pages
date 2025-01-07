const parser = require('node-html-parser')
const languageServer = require('vscode-languageserver/node')
const { runTransform: getCommonJsFromESM } = require('esm-to-cjs')

const connection = languageServer.createConnection(languageServer.ProposedFeatures.all)

/**
 * @type {Record<string, { lastHtmlChange: number, lastJsChange: number, lastUpdate: number, root: object, text: string }>}
 */
const documentMetaData = {}

// Start the language server
process.nextTick(async () => {
  try {
    await main()
  } catch (err) {
    console.error(err)
    connection.console.log('Error in "Pages Language Server":')
    connection.console.error(err.stack)
  }
})

/**
 *
 */
async function main () {
  connection.console.log('Starting "Pages Language Server"')

  connection.onInitialize((...args) => onConnectionInitialize(...args))
  connection.onDidChangeTextDocument(({ textDocument, contentChanges }) => { onDocumentContentChange(textDocument, contentChanges) })
  connection.onDidCloseTextDocument(({ textDocument }) => { delete documentMetaData[textDocument.uri] })
  connection.onRequest('getCompletions', ({ textDocument, position, context, content }) => onCompletionsRequest(textDocument, position, context, content))

  connection.listen()
}

/**
 *
 */
function onConnectionInitialize () {
  return {
    capabilities: {
      textDocumentSync: languageServer.TextDocumentSyncKind.Incremental,
    }
  }
}

/**
 * @param {languageserver.TextDocumentIdentifier} document
 * @param {languageserver.Position} position
 * @param {import('./CompletionItemProvider.js').Context} context
 * @param {string} content
 */
async function onCompletionsRequest (document, position, context, content) {
  const completions = []

  if (context === 'javascript' || context === 'javascript-export') {
    const rows = content.split('\n')
    const localCompletions = await connection.sendRequest('getVsCodeCompletions', {
      uri: document.uri + '.' + Date.now() + '.js',
      language: 'javascript',
      position: { line: rows.length - 1, character: rows[rows.length - 1].length },
      content
    })
    completions.push(...localCompletions)
  }

  if (context === 'javascript-template-literal') {
    await new Promise((resolve) => setTimeout(resolve, 10))
    let meta = documentMetaData[document.uri]
    while (!meta) {
      await new Promise((resolve) => setTimeout(resolve, 1))
      meta = documentMetaData[document.uri]
    }
    if (!meta.lastUpdate || meta.lastUpdate < meta.lastJsChange || meta.lastUpdate < meta.lastHtmlChange) updateDocument(document)

    const offset = getOffset(document, position)
    const [node, diff] = findNodeAndDiffByPosition(meta.root, offset)
    const text = node.outerHTML || node.textContent

    const scripts = getScripts(document, node)

    const marker = '// @pages-language-server-marker'
    const content = `
      export default async function () {
        ${scripts.map((script, i) => {
          return `const { ${script._exports.join(', ')} } = await (async () => {\n${script._commonjs}\n})()\n`
        }).join('\n')}
        ${marker}
        return \`${text}\`
      }
    `
    const start = content.lastIndexOf(marker) + marker.length + 17 + text.slice(0, diff).length
    const startArr = content.slice(0, start).split('\n')

    // console.log(`${content.slice(0, start)}<-- here -->${content.slice(start)}`)
    const localCompletions = await connection.sendRequest('getVsCodeCompletions', {
      uri: document.uri + '.' + Date.now() + '.js',
      position: {
        line: startArr.length - 1,
        character: startArr[startArr.length - 1].length
      },
      content,
      language: 'javascript'
    })

    completions.push(...localCompletions)
  }

  return completions
}

function updateDocument (document) {
  const meta = documentMetaData[document.uri]
  const root = parser.parse(meta.text)
  meta.root = root
  meta.lastUpdate = Date.now()

  const scripts = root.querySelectorAll('script[target]')
  for (const script of scripts) {
    try {
      const commonjs = getCommonJsFromESM(script.innerText)
      const exportIndex = commonjs.lastIndexOf('module.exports =')
      const exportString = commonjs.slice(exportIndex + 18).slice(0, -2)
      const exports = exportString.split(',').map((exp) => exp.trim().split(':')[0].trim())
      script._exports = exports.filter((value, index, array) => array.indexOf(value) === index)
      script._commonjs = `${commonjs.slice(0, exportIndex)}return ${commonjs.slice(exportIndex + 16)}`
    } catch (err) {
      console.log(`Extension "Pages" encountered an error while parsing a script in ${document.uri}`)
      console.error(err)
    }

    const target = script.getAttribute('target')
    for (const element of root.querySelectorAll(target)) {
      element._scripts = element._scripts || []
      if (!element._scripts.includes(target)) element._scripts.push(target)
    }
  }
}

function getOffset (document, position) {
  const text = documentMetaData[document.uri].text || ''
  const before = text.split('\n').slice(0, position.line)
  const offset = before.reduce((sum, line) => sum + line.length + 1, 0) + position.character
  return offset
}

function findNodeAndDiffByPosition (root, position) {
  let currentPosition = 0

  function traverse (node) {
    const skip = node.textContent?.toLowerCase().includes('doctype') && node.nodeType === 1
    if (!skip) {
      const text = node.outerHTML?.slice(0, node.outerHTML.indexOf('>') + 1) || node.textContent
      currentPosition = currentPosition + text.length
    }
    if (currentPosition >= position) return [node, position - currentPosition + 2]
    for (const child of node.childNodes) {
      const result = traverse(child)
      if (result) return result
    }
    if (!skip) {
      const lastIndex = node.outerHTML?.lastIndexOf('</')
      if (lastIndex) {
        const text = node.outerHTML?.slice(lastIndex)
        currentPosition = currentPosition + text.length
      }
    }
    return null
  }

  return traverse(root)
}

function getScripts (document, node) {
  const root = documentMetaData[document.uri].root
  const scripts = []
  let element = node
  while (element) {
    if (element._scripts) scripts.push(...element._scripts)
    element = element.parentNode
  }

  return scripts.map((target) => {
    return [...root.querySelectorAll(`script[target="${target}"]`)]
  }).flat().filter((script, index, array) => array.indexOf(script) === index)
}

/**
 * @param {languageServer.TextDocumentIdentifier} textDocument
 * @param {languageServer.TextDocumentContentChangeEvent[]} contentChanges
 */
async function onDocumentContentChange (textDocument, contentChanges) {
  const response = await connection.sendRequest('getContextAndContent', textDocument, contentChanges)
  const context = response[0]

  documentMetaData[textDocument.uri] = documentMetaData[textDocument.uri] || { lastJsChange: 0, lastHtmlChange: 0, lastUpdate: 0, root: null }
  documentMetaData[textDocument.uri].text = response[2]

  if (context === 'javascript-export' || context === 'javascript-template-literal') {
    documentMetaData[textDocument.uri].lastJsChange = Date.now()
  } else if (context === 'html') {
    documentMetaData[textDocument.uri].lastHtmlChange = Date.now()
  }

  // @TODO
  // const diagnostics = []
  // diagnostics.push({
  //   severity: languageserver.DiagnosticSeverity.Error,
  //   range: {
  //     start: {
  //       line: i,
  //       character: match.index + 1
  //     },
  //     end: {
  //       line: i,
  //       character: match.index + content.length + 1
  //     }
  //   },
  //   message: `HTML text node does not start with $: "${content}"`,
  //   source: 'pagesLanguageServer'
  // })
  // connection.sendDiagnostics({ uri: document.uri, diagnostics })

}
