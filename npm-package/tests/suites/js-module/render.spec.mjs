import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import render from '../../../modules/js/src/render.mjs'

describe('JS Module Render - Context Injection', function () {
  it('injects context when __resolvedCtx is provided', async function () {
    const page = {
      content: "console.log(ctx.key);",
      params: {
        __resolvedCtx: { key: 'value123' }
      }
    }
    const config = { js: { minify: false } }
    const result = await render(page, config, {})

    assert.ok(result.includes('value123'), 'should include context value')
    assert.ok(result.includes('window.ctx'), 'should assign to window.ctx')
  })

  it('handles undefined context gracefully', async function () {
    const page = {
      content: "console.log('no ctx');",
      params: {}
    }
    const config = { js: { minify: false } }
    const result = await render(page, config, {})

    assert.ok(result.includes('no ctx'), 'should render without context')
  })

  it('makes context available as window.ctx', async function () {
    const page = {
      content: "if (window.ctx) console.log('has window.ctx');",
      params: {
        __resolvedCtx: { test: 'data' }
      }
    }
    const config = { js: { minify: false } }
    const result = await render(page, config, {})

    assert.ok(result.includes('window.ctx'), 'should set window.ctx')
    assert.ok(result.includes('"test"') && result.includes('"data"'), 'should include context data')
  })

  it('handles nested context objects', async function () {
    const page = {
      content: "console.log(ctx.nested.value);",
      params: {
        __resolvedCtx: {
          nested: { value: 42 },
          array: [1, 2, 3]
        }
      }
    }
    const config = { js: { minify: false } }
    const result = await render(page, config, {})

    assert.ok(result.includes('"nested"') || result.includes('nested:'), 'should include nested key')
    assert.ok(result.includes('42'), 'should include nested value')
  })

  it('bundles context with other code', async function () {
    const page = {
      content: `
        const data = { ctx, extra: 'value' };
        console.log(data);
      `,
      params: {
        __resolvedCtx: { bundled: true }
      }
    }
    const config = { js: { minify: false } }
    const result = await render(page, config, {})

    assert.ok(result.includes('bundled'), 'should include context in bundle')
    assert.ok(result.includes('extra'), 'should include other code')
  })
})
