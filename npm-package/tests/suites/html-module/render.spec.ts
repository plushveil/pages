/* eslint no-template-curly-in-string: "off" */

import * as assert from 'node:assert'
import * as fs from 'node:fs'
import * as module from 'node:module'
import * as os from 'node:os'
import * as path from 'node:path'
import { describe, it } from 'node:test'
import * as fileUrl from 'node:url'

import render from '../../../dist/modules/html/src/render.js'

module.registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('@tailwindcss/postcss/dist/index.mjs')) {
      return {
        format: 'module',
        shortCircuit: true,
        source: 'export default {}',
      }
    }
    return nextLoad(url, context)
  },
})

/**
 * Test the render function from the html module
 */
describe('modules/html - render', () => {
  it('with template literals', async () => {
    await assert.rejects(() => render({ content: `\${` }, {}, {}))
    assert.deepStrictEqual(await render({ content: '' }, {}, {}), '')
    assert.deepStrictEqual(await render({ content: `<html>\${1}</html>` }, {}, {}), '<html>1</html>')
    assert.deepStrictEqual(await render({ content: `<html>\${\`1\`}</html>` }, {}, {}), '<html>1</html>')
    assert.deepStrictEqual(await render({ content: `<html>\${'1'}</html>` }, {}, {}), '<html>1</html>')
    assert.deepStrictEqual(await render({ content: `<html>\${"1"}</html>` }, {}, {}), '<html>1</html>')
    assert.deepStrictEqual(await render({ content: `\${1}` }, {}, {}), '1')
    assert.deepStrictEqual(await render({ content: '1' }, {}, {}), '1')
    assert.deepStrictEqual(await render({ content: `<html lang="\${\`DE\`}"></html>` }, {}, {}), '<html lang="DE"></html>')
    assert.deepStrictEqual(await render({ content: `<div alt="\${(() => \`\${'2'}\`)()}"></div>` }, {}, {}), '<div alt="2"></div>')
  })

  it('minify', async () => {
    assert.deepStrictEqual(await render({ content: '<html></html>' }, { html: { minify: {} } }, {}), '<html></html>')
  })

  it('resolves inline script imports relative to the source HTML file', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pages-relative-import-'))
    const filename = path.join(directory, 'component.html')
    fs.writeFileSync(path.join(directory, 'helper.mjs'), "export const value = 'from sibling'\n")
    try {
      const page = { fileUrl: fileUrl.pathToFileURL(filename), params: { __filename: filename } }
      const config = { fileUrl: fileUrl.pathToFileURL(filename) }
      assert.match(await render({ ...page, content: `<script target="main">import { value } from "./helper.mjs"; export { value }</script><main>\${value}</main>` }, config, {}), /<main>from sibling<\/main>/)
      assert.match(await render({ ...page, content: `<script target="main">export { value } from "./helper.mjs"</script><main>\${value}</main>` }, config, {}), /<main>from sibling<\/main>/)
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })
})
