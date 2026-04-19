import * as assert from 'node:assert'
import * as url from 'node:url'
import * as path from 'node:path'

import render from '../../../modules/js/src/render.mjs'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe('modules/js - render', function () {
  it('renders simple js content', async function () {
    const page = { content: 'const x = 1;' }
    const result = await render(page, {}, {})
    assert.ok(typeof result === 'string' && result.length > 0, 'should return non-empty string')
  })

  it('renders iife format', async function () {
    const page = { content: 'const x = 1; export default x;' }
    const result = await render(page, {}, {})
    assert.ok(result.startsWith('('), 'should be IIFE format (starts with paren)')
    assert.ok(result.includes(')'), 'should be IIFE format (contains closing paren)')
  })

  it('returns empty string for missing file', async function () {
    const page = { fileUrl: url.pathToFileURL('/nonexistent/file.js') }
    const result = await render(page, {}, {})
    assert.strictEqual(result, '')
  })

  it('returns empty string for no content and no file', async function () {
    const page = {}
    const result = await render(page, {}, {})
    assert.strictEqual(result, '')
  })

  it('minifies when config.js.minify is true', async function () {
    const page = { content: 'const longVariableName = 1; export default longVariableName;' }
    const config = { js: { minify: true } }
    const result = await render(page, config, {})
    assert.ok(!result.includes('longVariableName'), 'should minify variable names')
  })

  it('does not minify when config.js.minify is false', async function () {
    const page = { content: 'const longVariableName = 1; export default longVariableName;' }
    const config = { js: { minify: false } }
    const result = await render(page, config, {})
    assert.ok(result.includes('longVariableName'), 'should preserve variable names')
  })

  it('bundles imports with side effects', async function () {
    const fixturesDir = path.join(__dirname, 'fixtures')
    const page = {
      content: 'import { foo } from \'./dep.mjs\'; console.log(foo);',
      fileUrl: url.pathToFileURL(path.join(fixturesDir, 'entry.page')),
    }
    const result = await render(page, {}, {})
    assert.ok(result.includes('bar'), 'should bundle dependency content')
  })
})
