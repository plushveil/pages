import * as fs from 'node:fs'
import * as path from 'node:path'
import * as url from 'node:url'

import * as ts from '@typescript/typescript6'
import type { TextDocument } from 'vscode-languageserver-textdocument'
import * as languageServer from 'vscode-languageserver/node'

const extensions = ['', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '/index.ts', '/index.js']

/** Find the source of a clicked module path or template expression. */
export async function definitionAt(document: TextDocument, offset: number): Promise<languageServer.Location | null> {
  const text = document.getText()
  const { default: parse } = await import('@plushveil/pages/dist/modules/html/parser/parse.js')
  const { default: getExports } = await import('@plushveil/pages/dist/modules/html/utils/getExports.js')
  const html = parse(text)
  const scripts = html.select('script[target]')

  for (const script of scripts) {
    if (offset < script.startTagEnd || offset > script.endTagStart) continue
    const code = text.slice(script.startTagEnd, script.endTagStart)
    const source = ts.createSourceFile('inline.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const filepath = modulePathAt(source, offset - script.startTagEnd)
    if (!filepath) return null
    const resolved = resolveFile(url.fileURLToPath(document.uri), filepath)
    return resolved ? location(url.pathToFileURL(resolved).href, languageServer.Position.create(0, 0)) : null
  }

  const expression = expressionAt(text, offset)
  if (!expression) return null
  const symbol = expression.match(/[A-Za-z_$][\w$]*/)?.[0]
  if (!symbol) return null

  for (const script of scripts) {
    const target = script.attributes.target?.replace(/^["']|["']$/g, '')
    if (!target) continue
    let elements
    try {
      elements = html.select(target)
    } catch {
      continue
    }
    if (!elements.some((element) => element.start <= offset && offset < element.end)) continue
    const code = text.slice(script.startTagEnd, script.endTagStart)
    if (!getExports(code).includes(symbol)) continue
    const source = ts.createSourceFile('inline.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const statement = source.statements.find((entry) => getExports(entry.getText(source)).includes(symbol))
    const position = document.positionAt(script.startTagEnd + (statement?.getStart(source) ?? 0))
    return location(document.uri, position)
  }
  return null
}

/** Return the expression surrounding a cursor in an HTML template. */
function expressionAt(text: string, offset: number): string | null {
  const start = text.lastIndexOf('${', offset)
  if (start < 0) return null
  const end = text.indexOf('}', start + 2)
  return end >= offset ? text.slice(start + 2, end) : null
}

/** Create a zero-width location for VS Code's definition command. */
function location(uri: string, position: languageServer.Position): languageServer.Location {
  return languageServer.Location.create(uri, languageServer.Range.create(position, position))
}

/** Find a relative string literal in an inline TypeScript module. */
function modulePathAt(source: ts.SourceFile, offset: number): string | null {
  let found: string | null = null
  function visit(node: ts.Node): void {
    if (found !== null) return
    if (ts.isStringLiteralLike(node) && node.getStart(source) < offset && offset < node.end && /^\.\.?\//.test(node.text)) {
      found = node.text
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

/** Resolve a sibling source file, including common extensionless imports. */
function resolveFile(source: string, specifier: string): string | null {
  const base = path.resolve(path.dirname(source), specifier)
  for (const extension of extensions) {
    const candidate = base + extension
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
  }
  return null
}
