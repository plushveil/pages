import * as acorn from 'acorn'

/**
 * Retrieve the exports from a given code string.
 * @param {string} code - The code.
 * @returns {string[]} The exports.
 */
export default function getExports (code) {
  try {
    const ast = acorn.parse(code, { ecmaVersion: 'latest', loc: false, sourceType: 'module', allowAwaitOutsideFunction: true })
    const exports = ast.body
      .filter(node => node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration')
      .map(node => {
        if (node.type === 'ExportDefaultDeclaration') {
          return node.declaration.id?.name || 'default'
        } else if (node.type === 'ExportNamedDeclaration') {
          if (node.declaration) {
            return node.declaration.id?.name || node.declaration.declarations?.[0]?.id?.name
          } else if (node.specifiers.length > 0) {
            return node.specifiers.map(spec => spec.exported.name)
          }
        }
        return null
      })
      .flat()
      .filter(Boolean)

    return exports
  } catch (err) {
    throw new Error(err.stack || err.message)
  }
}
