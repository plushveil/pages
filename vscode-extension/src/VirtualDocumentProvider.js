/**
 * Represents a virtual document provider that provides virtual documents to the editor.
 */
class VirtualDocumentProvider {
  static scheme = 'pages-memory'

  documents = new Map()

  provideTextDocumentContent (uri) {
    return this.documents.get(uri.toString()) || ''
  }

  createVirtualDocument (uri, content) {
    this.documents.set(uri.toString(), content)
  }

  deleteVirtualDocument (uri) {
    this.documents.delete(uri.toString())
  }
}

module.exports = VirtualDocumentProvider
