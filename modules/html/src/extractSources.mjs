import { parse } from 'acorn'
import * as walk from 'acorn-walk'

export default async function extractSources (code) {
  const sources = []

  // Parse the code to generate the AST
  const ast = parse(code, {
    ecmaVersion: 'latest',
    sourceType: 'module',
  })

  // Walk the AST and look for ImportDeclaration, CallExpression nodes
  walk.simple(ast, {
    // Handle import statements
    ImportDeclaration (node) {
      sources.push(node.source.value)
    },

    // Handle dynamic import() statements
    ImportExpression (node) {
      const arg = node.source
      if (arg.type === 'Literal') {
        sources.push(arg.value)
      }
    },

    // Handle arbitrary function calls
    CallExpression (node) {
      if (node.arguments && node.arguments.length > 0) {
        node.arguments.forEach((arg) => {
          if (arg.type === 'Literal') {
            sources.push(arg.value)
          }
        })
      }
    },
  })

  return sources
}
