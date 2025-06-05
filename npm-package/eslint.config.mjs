import standard from 'neostandard'
import mocha from 'eslint-plugin-mocha'
import jsdoc from 'eslint-plugin-jsdoc'

export default [
  ...standard({}),
  mocha.configs.recommended,
  jsdoc.configs['flat/recommended'],
  {
    ignores: ['dist/*'],
    rules: {
      'mocha/no-setup-in-describe': 'off'
    }
  }
]
