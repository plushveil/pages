const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test } = require('node:test')
const { pathToFileURL } = require('node:url')

const { TextDocument } = require('vscode-languageserver-textdocument')
const { definitionAt } = require('../dist/navigation.js')

test('relative paths in script[target] open sibling files', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pages-navigation-'))
  try {
    const source = path.join(directory, 'component.html')
    const sibling = path.join(directory, 'component.build.ts')
    fs.writeFileSync(sibling, 'export const text = "Hello"\n')
    const content = '<script target="main">export { text } from "./component.build.ts"</script><main>${text}</main>'
    const document = TextDocument.create(pathToFileURL(source).href, 'html', 1, content)
    const offset = content.indexOf('./component.build.ts') + 4
    const result = await definitionAt(document, offset)
    assert.equal(result?.uri, pathToFileURL(sibling).href)
    assert.equal(result?.range.start.line, 0)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('template identifiers jump to the matching target script', async () => {
  const content = '<html><main>${text}</main><aside>${text}</aside><script target="main">export const text = "Hello"</script></html>'
  const document = TextDocument.create('file:///example.page', 'pages', 1, content)
  const first = await definitionAt(document, content.indexOf('${text}') + 3)
  const second = await definitionAt(document, content.lastIndexOf('${text}') + 3)
  assert.equal(first?.uri, document.uri)
  assert.equal(first?.range.start.line, document.positionAt(content.indexOf('export const text')).line)
  assert.equal(first?.range.start.character, document.positionAt(content.indexOf('export const text')).character)
  assert.equal(second, null)
})

test('missing relative paths have no definition', async () => {
  const content = '<script target="main">import "./missing.ts"</script><main></main>'
  const document = TextDocument.create('file:///example.page', 'pages', 1, content)
  assert.equal(await definitionAt(document, content.indexOf('missing.ts')), null)
})
