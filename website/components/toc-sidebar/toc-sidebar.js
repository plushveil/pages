import getDataComponent from '../DataComponent.js'
import markdown from './toc-sidebar.htms'

window.customElements.define('toc-sidebar', class extends getDataComponent(markdown) {
})
