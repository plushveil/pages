/* eslint no-template-curly-in-string: "off" */

import * as assert from 'node:assert'
import * as module from 'node:module'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as url from 'node:url'

import nowDefaultImport from './now-random.mjs'
import { it } from 'node:test'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Test nodes import cache
 */
describe('knowledgebase - import caching', function () {
  it('dynamic import uses cache', async function () {
    const nowDynamicImport = (await import('./now-random.mjs')).default
    assert.deepStrictEqual(nowDefaultImport, nowDynamicImport)
  })

  it('registerHooks resolve - uses cache', async function () {
    let active = true
    module.registerHooks({
      load (url, context, nextLoad) {
        if (active && (new URL(url)).pathname.endsWith('now-random.mjs')) {
          return {
            format: 'module',
            source: fs.readFileSync(path.join(__dirname, 'now-random.mjs'), 'utf8'),
            shortCircuit: true
          }
        }
        return nextLoad(url, context)
      },
    })
    const nowRegisterHooks = (await import('./now-random.mjs')).default
    const nowRegisterHooks2 = (await import('./now-random.mjs')).default
    const nowRegisterHooks3 = (await import('./now-random.mjs?cachebuster=true')).default
    assert.deepStrictEqual(nowRegisterHooks, nowRegisterHooks2)
    assert.notDeepStrictEqual(nowRegisterHooks, nowRegisterHooks3)
    active = false
  })

  it('registerHooks resolve - uses cache with importAttributes', async function () {
    let active = true
    module.registerHooks({
      resolve (specifier, context, nextResolve) {
        if (active && specifier.startsWith('./now-random.mjs')) {
          const specifierUrl = url.pathToFileURL(path.join(__dirname, 'now-random.mjs'))
          specifierUrl.searchParams.set('testsuite', '2')
          return {
            url: specifierUrl.href,
            format: 'module',
            shortCircuit: true,
            importAttributes: specifierUrl
          }
        }
        return nextResolve(specifier, context)
      },
      load (url, context, nextLoad) {
        if (active && (new URL(url)).pathname.endsWith('now-random.mjs')) {
          return {
            format: 'module',
            source: fs.readFileSync(path.join(__dirname, 'now-random.mjs'), 'utf8'),
            shortCircuit: true
          }
        }
        return nextLoad(url, context)
      },
    })

    // ultimately I'm looking for a way to perform the same action multiple times, for different specifiers
    // sadly this will be clogging the memory (with the same module)
    // I can use "importAttributes" to force the module to be re-imported
    const nowRegisterHooks = (await import('./now-random.mjs')).default
    const nowRegisterHooks2 = (await import('./now-random.mjs')).default
    const nowRegisterHooks3 = (await import(`./now-random.mjs?cachebuster=${Date.now()}-${Math.random()}`)).default
    assert.deepStrictEqual(nowRegisterHooks, nowRegisterHooks2)
    assert.deepStrictEqual(nowRegisterHooks, nowRegisterHooks3)
    active = false
  })

  it('registerHooks resolve - uses cache with importAttributes and shortCircuit', async function () {
    let active = true

    module.registerHooks({
      resolve (specifier, context, nextResolve) {
        if (active && specifier.startsWith('./now-random.mjs')) {
          const specifierUrl = url.pathToFileURL(path.join(__dirname, 'now-random.mjs'))
          specifierUrl.searchParams.set('testsuite', '3')
          return {
            url: specifierUrl.href, // <- import.meta.url
            format: 'module',
            shortCircuit: true,
            importAttributes: specifierUrl
          }
        }
        return nextResolve(specifier, context)
      },
      load (url, context, nextLoad) {
        if (active && (new URL(url)).pathname.endsWith('now-random.mjs')) {
          return {
            format: 'module',
            source: 'export default import.meta.url',
            shortCircuit: true
          }
        }
        return nextLoad(url, context)
      },
    })

    // but now I have the problem, that I can't really "return something else" depending on the specifier
    // but actually I can, I just need to utilize "import.meta.url"
    const nowRegisterHooks = (await import('./now-random.mjs')).default
    const nowRegisterHooks2 = (await import('./now-random.mjs')).default
    const nowRegisterHooks3 = (await import(`./now-random.mjs?cachebuster=${Date.now()}-${Math.random()}`)).default

    assert.deepStrictEqual(nowRegisterHooks, nowRegisterHooks2)
    assert.deepStrictEqual(nowRegisterHooks, nowRegisterHooks3)
    active = false
  })
})
