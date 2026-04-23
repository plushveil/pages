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

  describe('context injection', function () {
    it('injects context when __resolvedCtx is provided', async function () {
      const page = {
        content: "import ctx from 'pages:context'; console.log(ctx.key);",
        params: {
          __resolvedCtx: { key: 'value123' }
        }
      }
      const config = { js: { minify: false } }
      const result = await render(page, config, {})
      assert.ok(result.includes('value123'), 'should include context value')
    })

    it('exports undefined when no context provided', async function () {
      const page = {
        content: "import ctx from 'pages:context'; console.log(ctx);",
        params: {}
      }
      const config = { js: { minify: false } }
      const result = await render(page, config, {})
      assert.ok(result.includes('undefined'), 'should export undefined when no context')
    })

    it('assigns context to window.ctx', async function () {
      const page = {
        content: "import ctx from 'pages:context'; console.log(window.ctx);",
        params: {
          __resolvedCtx: { testKey: 'testValue' }
        }
      }
      const config = { js: { minify: false } }
      const result = await render(page, config, {})
      assert.ok(result.includes('window.ctx'), 'should assign to window.ctx')
      assert.ok(result.includes('testValue'), 'should include context value')
    })

    it('handles complex context objects', async function () {
      const page = {
        content: "import ctx from 'pages:context'; console.log(ctx.nested.array[0]);",
        params: {
          __resolvedCtx: {
            nested: { array: [1, 2, 3] },
            string: 'hello'
          }
        }
      }
      const config = { js: { minify: false } }
      const result = await render(page, config, {})
      assert.ok(result.includes('[1,2,3]') || result.includes('[1, 2, 3]'), 'should serialize nested objects')
    })

    it('context is bundled as a module', async function () {
      const page = {
        content: "import ctx from 'pages:context'; export default ctx;",
        params: {
          __resolvedCtx: { moduleKey: 'moduleValue' }
        }
      }
      const config = { js: { minify: false } }
      const result = await render(page, config, {})
      assert.ok(result.length > 0, 'should bundle successfully')
      assert.ok(result.includes('moduleValue'), 'should include context in bundle')
    })
  })
})
