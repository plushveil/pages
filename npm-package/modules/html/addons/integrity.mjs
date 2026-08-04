import { webcrypto } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { TextEncoder } from 'node:util'

import getNodesInRange from '../utils/getNodesInRange.mjs'

const csp = {}

global.eventEmitter = global.eventEmitter || new EventEmitter()
global.eventEmitter.on('csp', (cspUpdate) => {
  mergeContentSecurityPolicies(csp, cspUpdate)
})

/**
 * The after hook is executed after all nodes have been interpreted.
 *
 * @param {import('../parser/iterator.mjs').Node[]} nodes - All nodes.
 * @param {import('../parser/parse.mjs').HTMLDocument} htmlDocument - The HTML document.
 * @param {import('../../../src/pages.mjs').Page} page - The page.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../../src/api.mjs').API} api - The API.
 */
export async function afterAsync(nodes, htmlDocument, page, config, api) {
  const csp = {}

  await Promise.all(
    nodes
      .filter((node) => node.type === 'raw')
      .map(async (node) => {
        const htmlNode = htmlDocument.findNodeAt(node.offset.start)

        if (htmlNode.tag.toLowerCase() === 'script' && !htmlNode.attributes?.src) {
          const parent = getNodesInRange(htmlNode.start, htmlNode.startTagEnd, nodes)[0]
          const text = typeof node.textUpdate === 'string' ? node.textUpdate : node.text
          const integrity = await generateIntegrityFromStringAsync(text, 'SHA-384')
          const parentText = typeof parent.textUpdate === 'string' ? parent.textUpdate : parent.text
          if (parentText.includes(`<${htmlNode.tag}`)) {
            parent.textUpdate = parentText.replace(`<${htmlNode.tag}`, `<${htmlNode.tag} integrity="${integrity}"`)
            csp['script-src'] = csp['script-src'] || []
            csp['script-src'].push(`'${integrity}'`)
          }
        }
      }),
  )

  if (Object.keys(csp).length > 0) global.eventEmitter.emit('csp', csp)
}

/**
 * The after hook is executed after all nodes have been interpreted.
 *
 * @param {import('../parser/iterator.mjs').Node[]} nodes - All nodes.
 * @param {import('../parser/parse.mjs').HTMLDocument} htmlDocument - The HTML document.
 * @param {import('../../../src/pages.mjs').Page} page - The page.
 * @param {import('../../../src/config.mjs').Config} config - The configuration.
 * @param {import('../../../src/api.mjs').API} api - The API.
 */
export async function after(nodes, htmlDocument, page, config, api) {
  const meta = htmlDocument.select('meta[http-equiv="Content-Security-Policy"]')
  if (meta.length === 0) return

  let next = false
  const node = getNodesInRange(meta[0].start, meta[0].end, nodes).find((node) => {
    if (next) return true
    const text = typeof node.textUpdate === 'string' ? node.textUpdate : node.text
    if (text.match(/content\s*=\s*"$/i)) next = true
    else if (text.match(/content\s*=/i)) return true
    return false
  })
  if (!node) return

  const text = typeof node.textUpdate === 'string' ? node.textUpdate : node.text
  const cspString = text.match(/=\s*"/) ? text.match(/content\s*=\s*"([^"]*)"/i)[1] : text
  const policy = parseContentSecurityPolicyString(cspString)
  const updatedPolicy = mergeContentSecurityPolicies(policy, csp)
  node.textUpdate = text.replace(cspString, contentSecurityPolicyToString(updatedPolicy))
}

/**
 * Parses a content security policy string.
 *
 * @param {string} content - The content.
 * @returns {object} The content security policy.
 */
function parseContentSecurityPolicyString(content) {
  const policy = {}
  if (!content) return policy
  const directives = content.split(';')
  for (const directive of directives) {
    if (!directive) continue
    const [name, ...values] = directive.trim().split(' ')
    policy[name] = values
  }
  return policy
}

/**
 * Converts a content security policy object to a string.
 *
 * @param {object} policy - The content security policy.
 * @returns {string} The content security policy string.
 */
function contentSecurityPolicyToString(policy) {
  return Object.entries(policy)
    .map(
      ([name, values]) =>
        `${name} ${values
          .map((v) => {
            v = v.trim()
            if (v.endsWith(';')) return v.slice(0, -1)
            return v
          })
          .join(' ')}`,
    )
    .join('; ')
}

/**
 * Merges multiple content security policies, modifying the first policy.
 *
 * @param {object} merged - The merged content security policy.
 * @param {...object} policies - The content security policies.
 * @returns {object} The merged content security policy.
 */
function mergeContentSecurityPolicies(merged = {}, ...policies) {
  for (const policy of policies) {
    for (const [name, values] of Object.entries(policy)) {
      merged[name] = merged[name] || []
      for (const value of values) {
        if (!merged[name].includes(value)) merged[name].push(value)
      }
    }
  }
  return merged
}

/**
 * Generates a subresource integrity hash from a string.
 *
 * @param {string} content - The content.
 * @param {string} algorithm - The algorithm.
 * @returns {Promise<string>} The integrity hash.
 */
async function generateIntegrityFromStringAsync(content, algorithm = 'SHA-384') {
  const encoder = new TextEncoder()
  const data = encoder.encode(content)
  const hashBuffer = await webcrypto.subtle.digest(algorithm, data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashBase64 = Buffer.from(hashArray).toString('base64')
  return `${algorithm.toLowerCase().replace('-', '')}-${hashBase64}`
}
