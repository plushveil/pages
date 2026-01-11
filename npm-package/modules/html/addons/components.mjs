import * as path from 'node:path'
import * as fs from 'node:fs'

import { pages as getJsPages } from '../../js/js.mjs'
import { pages as getCssPages } from '../../css/css.mjs'
import render from '../src/render.mjs'

const tags = ['enable-components']
const componentCache = {}
const components = {}

/**
 * before is executed before the page is interpreted.
 * @param {import('../parser/iterator.mjs').Node[]} nodes - All nodes.
 * @param {import('../parser/parse.mjs').HTMLDocument} htmlDocument - The HTML document.
 * @param {import('../../../src/pages.mjs').Page} page - The page.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../../src/api.mjs').API} api - The API.
 */
export async function beforeAsync (nodes, htmlDocument, page, config, api) {
  if (!config.root) return

  const id = page?.url?.toString() || htmlDocument.getId()
  const componentsPath = path.resolve(config.root, 'components')
  components[id] = components[id] || {
    path: fs.existsSync(componentsPath) ? componentsPath : null,
    nodes: [],
    containers: [],
    parallel: 0
  }
  components[id].parallel += 1
}

/**
 * forEach is executed for each node when the page is interpreted.
 * @param {import('../parser/iterator.mjs').Node} node - The node
 * @param {import('../parser/iterator.mjs').Node[]} nodes - All nodes.
 * @param {import('../parser/parse.mjs').HTMLDocument} htmlDocument - The HTML document.
 * @param {import('../../../src/pages.mjs').Page} page - The page.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../../src/api.mjs').API} api - The API.
 */
export async function forEach (node, nodes, htmlDocument, page, config, api) {
  const id = page?.url?.toString() || htmlDocument.getId()
  if (!components[id] || components[id].path === null) return

  if (node.type === 'template') {
    const names = (node.textUpdate || node.text).matchAll(/<([a-zA-Z0-9]+-[^> ]+)([^>]*)>.*?<\/\1>/g)
    for (const name of names) {
      const attributeString = name[2]
      const attributes = getAttributesFromString(attributeString)
      const component = { name: name[1], attributeString, attributes }
      await addComponent(component, node, id, page, config, api)
    }
  }

  if (node.type === 'tag-open') {
    const name = (node.textUpdate || node.text).match(/^<([^> ]+)/)
    if (name) {
      if (tags.includes(name[1])) {
        components[id].containers.push(node)
      } else if (name[1].includes('-')) {
        const attributeString = (node.textUpdate || node.text).match(/^<[^> ]+((\s+[^=> ]+(=("([^"]*)")|('([^']*)')|([^"'\s>]+))?)*)\s*>/)?.[1] || ''
        const attributes = getAttributesFromString(attributeString)
        const component = { name: name[1], attributeString, attributes }
        await addComponent(component, node, id, page, config, api)
      }
    }
  }

  if (node.type === 'tag-close' && tags.find(tag => node.text.toLowerCase() === `</${tag}>`)) {
    node.textUpdate = ''
  }
}

/**
 * After the page is interpreted.
 * @param {import('../parser/iterator.mjs').Iterator} iterator - The iterator
 * @param {import('../parser/parse.mjs').HTMLDocument} htmlDocument - The HTML document.
 * @param {import('../../../src/pages.mjs').Page} page - The page.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../../src/api.mjs').API} api - The API.
 */
export function after (iterator, htmlDocument, page, config, api) {
  const id = page?.url?.toString() || htmlDocument.getId()
  if (!components[id]) return
  if (page.params.headers?.['X-Partial'] === 'true') return

  const run = components[id]
  run.parallel -= 1
  if (run.parallel === 0) setTimeout(() => { delete components[id] }, 0)

  if (run.path === null || run.nodes.length === 0 || (run.containers.length === 0 && run.containers.length === 0)) {
    for (const node of run.containers) node.textUpdate = ''
    return
  }

  run.nodes = run.nodes.filter((c, index, self) => self.findIndex(t => t.name === c.name) === index)
  for (const component of run.nodes) {
    const js = component.js && `<script src="${component.js}" async></script>`
    const css = component.css && `<link rel="stylesheet" href="${component.css}">`
    for (const node of run.containers.filter((v, i, a) => a.indexOf(v) === i)) {
      if (js && (!node.textUpdate || !node.textUpdate.includes(js))) node.textUpdate = (node.textUpdate || '') + js
      if (css && (!node.textUpdate || !node.textUpdate.includes(css))) node.textUpdate = (node.textUpdate || '') + css
    }
  }
}

/**
 * Adds a component to the page.
 * @param {object} component - The component.
 * @param {string} component.name - The component name.
 * @param {string} [component.html] - The component HTML.
 * @param {string} [component.js] - The component JavaScript URL.
 * @param {string} [component.css] - The component CSS URL.
 * @param {import('../parser/iterator.mjs').Node} node - The node to update.
 * @param {string} id - The page ID.
 * @param {import('../../../src/pages.mjs').Page} page - The page.
 * @param config
 * @param api
 */
async function addComponent (component, node, id, page, config, api) {
  const exists = components[id].nodes.find(c => c.name === component.name && c.attributeString === component.attributeString)
  if (exists) {
    node.textUpdate = (node.textUpdate || node.text) + (exists.html || '')
    return
  }

  const cached = componentCache[component.name + '#' + component.attributeString]
  if (cached) {
    node.textUpdate = (node.textUpdate || node.text) + (cached.html || '')
    node.attributeString = cached.attributeString
    components[id].nodes.push(cached)
    return
  }

  const htmlFile = path.resolve(components[id].path, component.name, `${component.name}.html`)
  if (fs.existsSync(htmlFile)) {
    const rendered = await renderComponent(htmlFile, page, config, api, component.attributes)
    component.html = rendered.content
    if (node.type === 'template') {
      const tag = `<${component.name}${component.attributeString}>`
      node.textUpdate = (node.textUpdate || node.text).replaceAll(tag, `${tag}${component.html}`)
    } else {
      node.textUpdate = (node.textUpdate || node.text) + component.html
    }

    if (rendered.classString) {
      const classMatch = (node.textUpdate || node.text).match(/class=["'](.*?)["']/)
      if (classMatch) {
        const existingClasses = classMatch[1] || ''
        const newClasses = `${existingClasses} ${rendered.classString}`.trim()
        node.textUpdate = (node.textUpdate || node.text).replace(classMatch[0], `class="${newClasses}"`)
      } else {
        node.textUpdate = (node.textUpdate || node.text).replace(/<[^> ]+/, match => `${match} class="${rendered.classString}"`)
      }
    }
  }

  const jsExt = ['.ts', '.js']
  for (const ext of jsExt) {
    const jsFile = path.resolve(components[id].path, component.name, `${component.name}${ext}`)
    if (fs.existsSync(jsFile)) {
      const pages = await getJsPages(jsFile, config, api)
      if (pages.length > 0) {
        const page = pages.find(p => p.params.headers?.['Content-Type']?.includes('application/javascript')) || pages[0]
        component.js = page.url.toString()
        break
      }
    }
  }

  const cssFile = path.resolve(components[id].path, component.name, `${component.name}.css`)
  if (fs.existsSync(cssFile)) {
    const pages = await getCssPages(cssFile, config, api)
    if (pages.length > 0) {
      const page = pages.find(p => p.params.headers?.['Content-Type']?.includes('text/css')) || pages[0]
      component.css = page.url.toString()
    }
  }

  componentCache[component.name + '#' + component.attributeString] = component
  components[id].nodes.push(component)
}

/**
 * Parses an attribute string into an object.
 * @param {string} attributeString - The attribute string.
 * @returns {object} - The parsed attributes.
 */
function getAttributesFromString (attributeString) {
  const attributes = {}
  const regex = /([^\s=]+)(=("([^"]*)")|('([^']*)')|([^"'\s>]+))?/g
  let match
  while ((match = regex.exec(attributeString)) !== null) {
    const attrName = match[1]
    const attrValue = match[4] || match[6] || match[7] || true
    attributes[attrName] = attrValue
  }
  return attributes
}

/**
 * Renders a component file.
 * @param {string} component - The component file.
 * @param {import('../../../src/pages.mjs').Page} page - The page.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../../src/api.mjs').API} api - The API.
 * @param {object} attributes - The component attributes.
 * @returns {Promise<string>} - The rendered component.
 */
async function renderComponent (component, page, config, api, attributes) {
  const name = path.basename(component, path.extname(component))

  let content = await fs.promises.readFile(component, 'utf-8')
  const match = content.match(new RegExp(`<${name} ([^>]*)>`))
  let classString = ''
  if (match) {
    classString = match[1].match(/class=["']([^'"]*)['"]/)?.[1] || ''
    content = content.replace(new RegExp(`<${name}[^>]*>`), '')
    content = content.replace(new RegExp(`</${name}>`), '')
  } else {
    content = undefined
  }

  const subpage = {
    ...page,
    content,
    params: {
      ...page.params,
      __filename: component,
      __dirname: path.dirname(component),
      __attributes: attributes
    }
  }

  return {
    content: await render(subpage, config, api),
    classString
  }
}
