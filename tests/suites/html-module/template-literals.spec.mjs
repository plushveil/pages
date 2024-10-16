/* eslint no-template-curly-in-string: "off" */

import * as assert from 'node:assert'

import splitTemplateLiterals from '../../../modules/html/src/splitTemplateLiterals.mjs'

/**
 * Test the splitTemplateLiterals function from the html module
 */
describe('modules/html - splitTemplateLiterals', function () {
  it('template literals', function () {
    assert.deepStrictEqual(splitTemplateLiterals(''), [])
    assert.deepStrictEqual(splitTemplateLiterals('<p></p>'), ['<p></p>'])
    assert.deepStrictEqual(splitTemplateLiterals('<p>${1}</p>'), ['<p>', '${1}', '</p>'])
    assert.throws(() => splitTemplateLiterals(1), /text must be a string/)
    assert.throws(() => splitTemplateLiterals('${'), /SyntaxError: Unterminated template literal/)
    assert.throws(() => splitTemplateLiterals('<p>${'), /SyntaxError: Unterminated template literal/)
    assert.throws(() => splitTemplateLiterals('<p>${</p>'), /SyntaxError: Unterminated template literal/)
  })

  it('template literals with backticks', function () {
    assert.deepStrictEqual(splitTemplateLiterals('${}'), ['${}'])
    assert.deepStrictEqual(splitTemplateLiterals('<p>${}</p>'), ['<p>', '${}', '</p>'])
    assert.deepStrictEqual(splitTemplateLiterals('text`text'), ['text`text'])
    assert.deepStrictEqual(splitTemplateLiterals('text`text`'), ['text`text`'])
    assert.deepStrictEqual(splitTemplateLiterals('text `text` '), ['text `text` '])
    assert.deepStrictEqual(splitTemplateLiterals('<p>${`test`}</p>'), ['<p>', '${`test`}', '</p>'])
    assert.deepStrictEqual(splitTemplateLiterals('<p>${0 ? `false` : "true"}</p>'), ['<p>', '${0 ? `false` : "true"}', '</p>'])
    assert.deepStrictEqual(splitTemplateLiterals('<p>${1 ? `true` : "\'false\'"}</p>'), ['<p>', '${1 ? `true` : "\'false\'"}', '</p>'])
    assert.deepStrictEqual(splitTemplateLiterals('<script>const a = (a) => `${a}`</script>'), ['<script>const a = (a) => `${a}`</script>'])
    // because scripts may utilize backticks, we consider backticks as escape characters for template literals
    // use the html character (&#x60;) for backticks in your html
    assert.deepStrictEqual(splitTemplateLiterals('text ` ${1 ? `${1}` : `${2}`} `'), ['text ` ${1 ? `${1}` : `${2}`} `'])
  })
})
