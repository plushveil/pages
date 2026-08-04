/**
 * @file The pages.config.ts file is used to configure the rendering and serving of the website.
 */

import sitemap from './modules/buildtools/sitemap.mjs'

/**
 * The base URI of the website.
 *
 * @type {URL}
 */
export { baseURI } from './src/config.mjs'

/**
 * Configuration of the build module.
 *
 * @typedef {object} BuildConfig
 * @property {string[]} [ignore=[]] - The files to ignore. Default is `[]`
 * @property {(output: string, config: import('./src/config.mjs').Config) => Promise<void>} [after] - A function to run after the build.
 */
/**
 * @type {BuildConfig}
 */
export const build = {
  ignore: [/\/(node_modules|.git|.github)\//, /\/(utils|modules|partials)\//, /tsconfig\.json$/, /Dockerfile$/, /\.mjs$/, /\.d\.ts$/, /\.md$/],
  after: async (output, config) => {
    await sitemap('sitemap.xml', output, config)
  },
}

/**
 * Configuration of the html module.
 *
 * @typedef {object} HtmlConfig
 * @property {boolean} [minify=true] - Whether to minify the HTML. Default is `true`
 * @property {boolean} [resolve=true] - Replace filepaths in HTML attributes with the correct paths. Default is `true`
 */
/**
 * @type {HtmlConfig}
 */
export const html = {
  minify: true,
  resolve: true,
}

/**
 * Configuration of the js module.
 *
 * @typedef {object} JsConfig
 * @property {boolean} [minify=true] - Whether to minify the JavaScript. Default is `true`
 * @property {boolean} [integrity=true] - Whether to add integrity attributes to script tags. Default is `true`
 * @property {string} [target='.browserslistrc'] - The target browserslist file. Default is `'.browserslistrc'`
 */
/**
 * @type {JsConfig}
 */
export const js = {
  minify: true,
  integrity: true,
  target: '.browserslistrc',
}

/**
 * Configuration of the css module.
 *
 * @typedef {object} CssConfig
 * @property {boolean} [minify=true] - Whether to minify the CSS. Default is `true`
 * @property {boolean} [integrity=true] - Whether to add integrity attributes to link tags. Default is `true`
 * @property {string} [tailwind='tailwind.config.mjs'] - The tailwind configuration file. Default is `'tailwind.config.mjs'`
 */
/**
 * @type {CssConfig}
 */
export const css = {
  minify: true,
  integrity: true,
}
