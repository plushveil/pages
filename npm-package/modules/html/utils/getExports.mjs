
import ts from 'typescript'

/**
 * Retrieve the exports from a given code string using TypeScript parser.
 * @param {string} code - The code.
 * @returns {string[]} The exports.
 */
export default function getExports(code) {
  try {
    const sourceFile = ts.createSourceFile('temp.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const exports = []

    function visit(node) {
      // Named exports: export const foo, export function bar, export class Baz
      if (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) {
        if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isVariableStatement(node)) {
          if (node.name && node.name.escapedText) {
            exports.push(node.name.escapedText)
          } else if (ts.isVariableStatement(node)) {
            node.declarationList.declarations.forEach(decl => {
              if (decl.name && decl.name.escapedText) {
                exports.push(decl.name.escapedText)
              }
            })
          }
        }
      }

      if (ts.isExportAssignment(node)) {
        exports.push('default')
      }

      if (ts.isExportDeclaration(node) && node.exportClause) {
        if (ts.isNamedExports(node.exportClause)) {
          node.exportClause.elements.forEach(el => {
            exports.push(el.name.escapedText)
          })
        }
      }
      ts.forEachChild(node, visit)
    }

    visit(sourceFile)
    return exports
  } catch (err) {
    throw new Error(err.stack || err.message)
  }
}
