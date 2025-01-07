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

    const start = content.lastIndexOf(marker) + (marker.length + 17) + diff
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
    const target = script.getAttribute('target')
    try {
      for (const element of root.querySelectorAll(target)) {
        element._scripts = element._scripts || []
        if (!element._scripts.includes(target)) element._scripts.push(target)
      }
    } catch (err) {}
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

      if (currentPosition >= position) {
        const diff = text.length - (currentPosition - position)
        return [node, diff]
      }
    }

    for (const child of node.childNodes) {
      const result = traverse(child)
      if (result) return result
    }
    if (!skip) {
      const closingTag = node.outerHTML?.lastIndexOf('</')
      if (closingTag && closingTag !== -1) {
        const text = node.outerHTML?.slice(closingTag)
        currentPosition = currentPosition + text.length
      }
    }
    return null
  }

  return traverse(root)
}

function getScripts (document, node) {
  const root = documentMetaData[document.uri].root
  const scriptsTargets = []
  let element = node
  while (element) {
    if (element._scripts) scriptsTargets.push(...element._scripts)
    element = element.parentNode
  }

  const scripts = scriptsTargets.map((target) => {
    return [...root.querySelectorAll(`script[target="${target}"]`)]
  }).flat().filter((script, index, array) => array.indexOf(script) === index)

  scripts.forEach((script) => {
    if (script._parsed) return
    script._parsed = true
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
  })

  return scripts.filter((script) => script._exports?.length)
}

/**
 * @param {languageServer.TextDocumentIdentifier} textDocument
 * @param {languageServer.TextDocumentContentChangeEvent[]} contentChanges
 */
async function onDocumentContentChange (textDocument, contentChanges) {
  const diagnostics = []
  const response = await connection.sendRequest('getContextAndContent', textDocument, contentChanges)
  const context = response[0]

  documentMetaData[textDocument.uri] = documentMetaData[textDocument.uri] || { lastJsChange: 0, lastHtmlChange: 0, lastUpdate: 0, root: null }
  documentMetaData[textDocument.uri].text = response[2]

  if (context === 'javascript-export' || context === 'javascript-template-literal') {
    documentMetaData[textDocument.uri].lastJsChange = Date.now()
  } else if (context === 'html') {
    documentMetaData[textDocument.uri].lastHtmlChange = Date.now()
  }

  if (context === 'html-script-target-value') {
    updateDocument(textDocument)
    const position = contentChanges[0].range.start
    const offset = getOffset(textDocument, position)
    const root = documentMetaData[textDocument.uri].root
    const script = findNodeAndDiffByPosition(root, offset)[0]
    const target = script.getAttribute('target')
    let elements
    try {
      elements = root.querySelectorAll(target)
    } catch (err) {
      elements = []
      elements._error = err
    }

    if (elements.length === 0) {
      const text = documentMetaData[textDocument.uri].text

      const offsetText = text.slice(0, offset)
      const startIndex = Math.max(offsetText.lastIndexOf('"'), offsetText.lastIndexOf("'")) + 1
      const startText = text.slice(0, startIndex)
      const startArr = startText.split('\n')
      const startLine = startArr.length - 1
      const startCharacter = Math.max(
        startArr[startLine].lastIndexOf('"') + 1,
        startArr[startLine].lastIndexOf("'") + 1
      )

      const endText = text.slice(startIndex)
      const end = endText.slice(0, Math.min(endText.indexOf('"'), endText.indexOf("'"), endText.length))
      const endArr = end.split('\n')
      const endLine = startLine + endArr.length - 1
      const endCharacter = endLine === startLine
        ? (startCharacter + end.length)
        : Math.max(
          endArr[endArr.length - 1].lastIndexOf('"') + 1,
          endArr[endArr.length - 1].lastIndexOf("'") + 1,
          endArr[endArr.length - 1].length
        )

      diagnostics.push({
        severity: languageServer.DiagnosticSeverity.Error,
        range: {
          start: {
            line: startLine,
            character: startCharacter
          },
          end: {
            line: endLine,
            character: endCharacter
          }
        },
        message: elements._error
          ? `Invalid query selector: "${elements._error.message}"`
          : 'No elements matching the query selector were found',
        source: 'pages'
      })
    }
  }

  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics })
}
