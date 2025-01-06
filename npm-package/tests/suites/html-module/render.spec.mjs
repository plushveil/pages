/* eslint no-template-curly-in-string: "off" */

import * as assert from 'node:assert'

import render from '../../../modules/html/src/render.mjs'

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
})
