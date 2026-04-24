# @plushveil/pages Website

This is the official website for @plushveil/pages, built using @plushveil/pages itself to showcase the product's capabilities.

## Structure

```
website/
├── index.page          # Landing page
├── docs.page           # Documentation
├── examples.page       # Examples and use cases
├── pages.config.mjs    # Build configuration
├── assets/
│   ├── tailwind.css    # Tailwind CSS v4 styles with config
│   ├── favicon.ico     # Site icon
│   └── vscode-screenshot.png
└── snippets/
    └── head.html       # Reusable head section
```

## Development

To run the development server:

```bash
# From the website directory
npx @plushveil/pages serve . --config pages.config.mjs

# Or from the root directory
npx @plushveil/pages serve website/ --config website/pages.config.mjs
```

The site will be available at `http://localhost:3000`

## Building

To build the static site:

```bash
# From the website directory
npx @plushveil/pages build . --config pages.config.mjs

# Or from the root directory
npx @plushveil/pages build website/ --config website/pages.config.mjs
```

The built files will be in the `./build` directory.

## Features Demonstrated

This website showcases:

- ✅ Using `.page` files with JavaScript template literals
- ✅ Tailwind CSS integration
- ✅ Multiple pages with navigation
- ✅ Reusable HTML components (snippets)
- ✅ Responsive design
- ✅ Dynamic content rendering
- ✅ SEO-friendly structure with canonical URLs

## Links

- **GitHub**: https://github.com/plushveil/pages
- **npm Package**: https://www.npmjs.com/package/@plushveil/pages
- **VS Code Extension**: https://marketplace.visualstudio.com/items?itemName=plushveil.pages
- **GitHub Action**: https://github.com/marketplace/actions/build-pages

## License

MIT © Plushveil
