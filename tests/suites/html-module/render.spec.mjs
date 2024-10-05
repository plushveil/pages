/* eslint no-template-curly-in-string: "off" */

import * as assert from 'node:assert'
import * as path from 'node:path'
import * as url from 'node:url'

import render from '../../../modules/html/src/render.mjs'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const __root = path.resolve(__dirname, '..', '..', '..')
const __examples = path.resolve(__root, 'examples')

/**
 * Test the render function from the html module
 */
describe('modules/html - render', function () {
  it('with template literals', async function () {
    await assert.rejects(() => render({ content: '${' }, {}, {}))
    assert.deepStrictEqual(await render({ content: '' }, {}, {}), '')
    assert.deepStrictEqual(await render({ content: '<html>${1}</html>' }, {}, {}), '<html>1</html>')
    assert.deepStrictEqual(await render({ content: '${1}' }, {}, {}), '1')
    assert.deepStrictEqual(await render({ content: '1' }, {}, {}), '1')
    assert.deepStrictEqual(await render({ content: '<html lang="${`DE`}"></html>' }, {}, {}), '<html lang="DE"></html>')
    assert.deepStrictEqual(await render({ content: '<div alt="${(() => `${\'2\'}`)()}">' }, {}, {}), '<div alt="2"></div>')
  })

  it('script tags with template literals', async function () {
    assert.deepStrictEqual(await render({ content: '<script>${2}</script>' }, {}, {}), '<script>${2}</script>')
    assert.deepStrictEqual(await render({ content: '<script>const a = (a) => `${a}`</script>' }, {}, {}), '<script>const a = (a) => `${a}`</script>')
  })

  it('minify', async function () {
    assert.deepStrictEqual(await render({ content: '<html></html>' }, { html: { minify: {} } }, {}), '<html></html>')
  })

  it('partials', async function () {
    assert.deepStrictEqual(
      await render({ fileUrl: url.pathToFileURL(path.resolve(__examples, 'include', 'index.html')) }, { html: { minify: true }, css: { minify: true }, js: { minify: true } }, {}),
      '<html><head><title>Include Example</title></head><body><h1>Include Example</h1><p>This is the main page.</p>This content has been included by calling ${await import(\'./partial.html\')}.</body></html>'
    )
  })
})
