/**
 * Creates a custom component class that propagates data-* attributes to child elements.
 * @param {string} markdown - The markdown content of the component.
 */
export default (markdown) => {
  const template = document.createElement('div')
  template.innerHTML = markdown
  const observedDataset = [...template.children].map((child) => getDataSets(child)).flat()

  /**
   * The DataComponent class is a general class for components that utilize data-* attributes.
   * If the custom element has a data-* attribute, it will propagate to the child elements.
   *
   * @example <caption>Example usage of DataComponent</caption>
   *   ```html
   *     <data-component data-foo="bar">
   *       <div data-foo="innerText"></div>
   *     </data-component>
   *   ```
   * 
   *   Results in:
   *   ```html
   *     <data-component data-foo="bar">
   *       <div data-foo="innerText">bar</div>
   *     </data-component>
   *   ```
   */
  return class DataComponent extends window.HTMLElement {
    static get observedAttributes () {
      return observedDataset.map(data => data.name).filter((value, index, self) => self.indexOf(value) === index)
    }

    /**
     * Called each time the element is added to the document.
     * The specification recommends that, as far as possible, developers should implement custom element setup in this callback rather than the constructor.
     */
    connectedCallback () {
      for (const child of template.children) this.appendChild(child.cloneNode(true))
      for (const attribute of this.attributes) {
        if (!(attribute.name.startsWith('data-'))) continue
        this.setAttribute(attribute.name, attribute.value)
      }
    }

    /**
     * Called when attributes are changed, added, removed, or replaced.
     * @param {string} name - The name of the attribute that changed.
     * @param {any} oldValue - The old value of the attribute.
     * @param {any} newValue - The new value of the attribute.
     * @see https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements#responding_to_attribute_changes
     */
    attributeChangedCallback (name, oldValue, newValue) {
      if (!this.innerHTML.includes('data-')) return

      for (const dataset of observedDataset) {
        if (dataset.name !== name) continue
        for (const element of [...this.querySelectorAll(':scope >' + dataset.querySelector)]) {
          if (dataset.value.startsWith('attribute.')) {
            const attribute = dataset.value.split('.').pop()
            element.setAttribute(attribute, newValue)
          } else if (dataset.value.includes('.')) {
            let object = element
            const keys = dataset.value.split('.')
            for (let i = 0; i < keys.length - 1; i++) object = object[keys[i]]
            object[keys.pop()] = newValue
          } else {
            element[dataset.value] = newValue
          }
        }
      }
    }
  }
}

/**
 * @typedef {Object} DataSet
 * @property {string} querySelector - The query selector of the element.
 * @property {string} name - The name of the data-* attribute.
 * @property {string} value - The value of the data-* attribute.
 */

/**
 * Gets the dataset of an element and its children.
 * @param {HTMLElement} element - The element to get the dataset from.
 * @param {string} prefix - The prefix of the query selector.
 * @returns {DataSet[]} The dataset of the element
 */
function getDataSets (element, prefix = '') {
  const dataset = []
  let i = null
  if (element.parentElement) {
    const children = [...element.parentElement.children].filter(child => child.tagName === element.tagName)
    if (children.length > 1) i = children.indexOf(element) + 1
  }
  const self = `${prefix ? `${prefix} ` : ''}${element.tagName.toLowerCase()}${i !== null ? `:nth-of-type(${i})` : ''}`

  for (const attribute of element.attributes) {
    if (!(attribute.name.startsWith('data-'))) continue

    for (const value of attribute.value.split(' ')) {
      dataset.push({ querySelector: self, name: attribute.name, value })
    }
  }

  [...element.children].forEach((child) => {
    const childDataset = getDataSets(child, self + ' >')
    dataset.push(...childDataset)
  })

  return dataset
}
