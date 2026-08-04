/**
 * @param {import('../parser/parse.mjs').HTMLDocument} htmlDocument - The HTML document.
 * @param {import('../parser/parse.mjs').Node} node - The node.
 * @returns {Record<number, string>} The contexts.
 */
export default function getContexts(htmlDocument, node) {
  const contexts = {}
  const scripts = htmlDocument.select('script[target]')
  for (let i = 0; i < scripts.length; i++) {
    const script = scripts[i]
    const target = script.attributes.target?.replace(/^['"]+|['"]+$/g, '')
    if (!target) continue

    const elements = htmlDocument.select(target)
    let element = node
    while (element) {
      if (elements.includes(element)) {
        const textDocument = htmlDocument.getTextDocument()
        const text = textDocument.getText({
          start: textDocument.positionAt(script.startTagEnd),
          end: textDocument.positionAt(script.endTagStart),
        })
        contexts[i] = text
        break
      }
      element = element.parent
    }
  }
  return contexts
}
