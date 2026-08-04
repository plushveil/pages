import * as assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import render from '../../../dist/modules/js/src/render.js'

describe('JS Module Render - Context Injection', () => {
  it('injects context when __resolvedCtx is provided', async () => {
    const page = {
      content: "import ctx from 'page:ctx'; console.log(ctx.key);",
      params: {
        __resolvedCtx: { key: 'value123' },
      },
    }
    const config = { js: { minify: false } }
    const result = await render(page, config, {})

    assert.ok(result.includes('value123'), 'should include context value')
    assert.ok(!result.includes('window.ctx'), 'should not pollute window namespace')
  })

  it('handles undefined context gracefully', async () => {
    const page = {
      content: "console.log('no ctx');",
      params: {},
    }
    const config = { js: { minify: false } }
    const result = await render(page, config, {})

    assert.ok(result.includes('no ctx'), 'should render without context')
  })

  it('transforms ctx references without polluting window namespace', async () => {
    const page = {
      content: "import ctx from 'page:ctx'; if (ctx.test) console.log('has ctx');",
      params: {
        __resolvedCtx: { test: 'data' },
      },
    }
    const config = { js: { minify: false } }
    const result = await render(page, config, {})

    assert.ok(!result.includes('window.ctx'), 'should not pollute window namespace')
    assert.ok(result.includes('"data"'), 'should include transformed context data')
  })

  it('handles nested context objects', async () => {
    const page = {
      content: "import ctx from 'page:ctx'; console.log(ctx.nested.value);",
      params: {
        __resolvedCtx: {
          nested: { value: 42 },
          array: [1, 2, 3],
        },
      },
    }
    const config = { js: { minify: false } }
    const result = await render(page, config, {})

    assert.ok(result.includes('"nested"') || result.includes('nested:'), 'should include nested key')
    assert.ok(result.includes('42'), 'should include nested value')
  })

  it('bundles context with other code', async () => {
    const page = {
      content: `
        import ctx from 'page:ctx';
        const data = { ctx, extra: 'value' };
        console.log(data);
      `,
      params: {
        __resolvedCtx: { bundled: true },
      },
    }
    const config = { js: { minify: false } }
    const result = await render(page, config, {})

    assert.ok(result.includes('bundled'), 'should include context in bundle')
    assert.ok(result.includes('extra'), 'should include other code')
  })

  it('preserves local ctx variables without transforming', async () => {
    const page = {
      content: "const ctx = {local: 'data'}; console.log(ctx.local);",
      params: {
        __resolvedCtx: { test: 'value' },
      },
    }
    const config = { js: { minify: false } }
    const result = await render(page, config, {})

    assert.ok(result.includes('local'), 'should preserve local ctx variable')
    assert.ok(!result.includes('"test"'), 'should not inject context without import')
  })
})
