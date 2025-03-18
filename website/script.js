import translations from './translations.mjs'

export * from './components/toc-progress/toc-progress.js'
export * from './components/toc-sidebar/toc-sidebar.js'

window.text = translations[document.documentElement.lang] || translations.en
