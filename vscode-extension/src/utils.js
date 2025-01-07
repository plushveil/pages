module.exports = {
  getCompletionValue,
  getContextAndContent,
  substringCount
}

/**
 * @param {vscode.TextDocument} document
 * @param {vscode.Position} position
 */
function getContextAndContent (document, position) {
  const line = document.lineAt(position).text
  const lastCharacter = line.charAt(position.character - 1)
  const text = document.getText()
  const previous = text.substring(0, document.offsetAt(position))

  let commentFreePrevious = previous.replace(/\/\/[^\n]*\n/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  const templateLiteralOpen = commentFreePrevious.lastIndexOf('${')
  if (templateLiteralOpen > -1) {
    commentFreePrevious = commentFreePrevious.substring(templateLiteralOpen + 2)
    const open = substringCount(commentFreePrevious, '{') + 1
    const close = substringCount(commentFreePrevious, '}')
    if (open > close) {
      const content = commentFreePrevious.slice(commentFreePrevious.lastIndexOf('{') + 1)
      return ['javascript-template-literal', content]
    }
  }

  if (lastCharacter !== '<' && previous.lastIndexOf('<') > previous.lastIndexOf('>')) {
    const tag = previous.slice(previous.lastIndexOf('<') + 1)
    if (tag.includes(' ')) {
      const tagName = tag.split(' ')[0]

      if (tag.includes('=') && (substringCount(tag, '"') % 2 === 1 || substringCount(tag, "'") % 2 === 1)) {
        const attributeName = previous.slice(previous.lastIndexOf(' ') + 1, previous.lastIndexOf('='))
        return [`html-${tagName}-${attributeName}-value`, '']
      }

      return [`html-${tagName}-attribute-value`, '']
    }
  }

  // check if inside a script tag
  commentFreePrevious = previous.replace(/<!--[\s\S]*?-->/g, '')
  const scriptOpen = commentFreePrevious.lastIndexOf('<script')
  const scriptClose = commentFreePrevious.lastIndexOf('</script')
  if (scriptOpen > scriptClose) {
    const tag = previous.slice(scriptOpen, previous.indexOf('>', scriptOpen))
    let content = previous.slice(scriptOpen)
    content = content.slice(content.indexOf('>') + 1)

    if (tag.includes('target=')) return ['javascript-export', content]
    return ['javascript', content]
  }

  return ['html', '']
}

/**
 *
 */
function substringCount (text, substring) {
  return text.split(substring).filter((_, index, array) => {
    const previous = array[index - 1]
    if (!previous) return true
    if (previous.slice(-1) === '\\') return false
    return true
  }).length - 1
}

/**
 * @param {string} text
 * @param {any} line
 * @param {vscode.Position} position
 */
function getCompletionValue (text, line, position) {
  const value = text.replace(/\$\d/g, '')
  let current = line.slice(line.lastIndexOf(value.charAt(0)), position.character)
  let newValue = text
  let match = true
  while (current.length) {
    const char = current.slice(0, 1)
    const index = newValue.indexOf(char)
    if (index === -1) { match = false; break }
    newValue = newValue.slice(0, index) + newValue.slice(index + 1)
    current = current.slice(1)
  }
  if (match === false) newValue = text
  return newValue
}
