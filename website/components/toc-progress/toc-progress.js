import getDataComponent from '../DataComponent.js'
import markdown from './toc-progress.htms'

window.customElements.define('toc-progress', class extends getDataComponent(markdown) {
  constructor () {
    super()
    const article = this.closest('main').querySelector('article')
  }
})
