import getDataComponent from '../DataComponent.js'
import markdown from './toc-progress.htms'

window.customElements.define('toc-progress', class extends getDataComponent(markdown) {
  async connectedCallback () {
    super.connectedCallback()
    const main = this.closest('main')
    const article = await new Promise(resolve => {
      function resolveArticle () {
        const article = main.querySelector('article')
        if (article) {
          resolve(article)
          return true
        }
        return false
      }
      if (!resolveArticle()) {
        this.observer = new MutationObserver(() => { if (resolveArticle()) this.observer.disconnect() })
        this.observer.observe(main, { childList: true, subtree: true })
      }
    })
  }

  disconnectedCallback () {
    this.observer?.disconnect()
  }
})
