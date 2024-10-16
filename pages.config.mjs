/**
 * @file The pages.config.mjs file is used to configure the rendering and serving of the website.
 */

import sitemap from './modules/buildtools/sitemap.mjs'

/**
 * The base URI of the website.
 * @type {URL}
 */
export { baseURI } from './src/config.mjs'

/**
 * Configuration of the build module.
 * @typedef {object} BuildConfig
 * @property {string[]} [ignore=[]] - The files to ignore.
 * @property {(output: string, config: import('./src/config.mjs').Config) => Promise<void>} [after] - A function to run after the build.
 */
/**
 * @type {BuildConfig}
 */
export const build = {
  ignore: [
    /\/(node_modules|.git|.github)\//,
    /\/(utils|components)\//,
    /\.mjs$/,
    /\.ts$/,
    /\.json$/,
    /\.md$/,
  ],
  after: async (output, config) => {
    await sitemap('sitemap.xml', output, config)
  }
}

/**
 * Configuration of the html module.
 * @typedef {object} HtmlConfig
 * @property {boolean} [minify=true] - Whether to minify the HTML.
 * @property {boolean} [resolve=true] - Replace filepaths in HTML attributes with the correct paths.
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
 * @typedef {object} JsConfig
 * @property {boolean} [minify=true] - Whether to minify the JavaScript.
 * @property {boolean} [integrity=true] - Whether to add integrity attributes to script tags.
 * @property {string} [target='.browserslistrc'] - The target browserslist file.
 */
/**
 * @type {JsConfig}
 */
export const js = {
  minify: true,
  integrity: true,
  target: '.browserslistrc'
}

/**
 * Configuration of the css module.
 * @typedef {object} CssConfig
 * @property {boolean} [minify=true] - Whether to minify the CSS.
 * @property {boolean} [integrity=true] - Whether to add integrity attributes to link tags.
 * @property {string} [tailwind='tailwind.config.mjs'] - The tailwind configuration file.
 */
/**
 * @type {CssConfig}
 */
export const css = {
  minify: true,
  integrity: true,
  tailwind: 'tailwind.config.mjs',
}
