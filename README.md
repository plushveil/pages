# Build Pages using plushveil/pages

A GitHub Action for building static HTML pages using **JavaScript template literals**.
Designed for simple, flexible page generation without introducing a full static-site framework.

This action installs its dependencies, runs a Node-based build step, and outputs a folder containing the generated pages.

---

## ✨ Features

* Uses plain JavaScript template literals to render HTML
* No framework lock-in
* Works as a composite GitHub Action
* Configurable input and output folders
* Plays nicely with GitHub Pages or other static hosts

---

## 📦 Inputs

| Name     | Description                                | Required |
| -------- | ------------------------------------------ | -------- |
| `folder` | Folder containing the pages to build       | No       |
| `config` | Path to a configuration file for the build | No       |

Inputs are passed to the build script as environment variables:

* `INPUT_FOLDER`
* `INPUT_CONFIG`

---

## 📤 Outputs

| Name     | Description                       |
| -------- | --------------------------------- |
| `folder` | Folder containing the built pages |

You can use this output in later workflow steps (for example, when deploying).

---

## 🚀 Usage

Basic example:

```yaml
name: Build Pages

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build pages
        uses: plushveil/pages@latest
        with:
          folder: pages
          config: pages.config.mjs

      - name: Deploy
        run: |
          echo "Built pages are in ${{ steps.build.outputs.folder }}"
```

---

## 🌍 Environment Variables

The action also supports the following environment variables, which are forwarded to the build script if present:

* `HOST`
* `PORT`
* `PATHNAME`
* `NODE_ENV` (set to `production` automatically)

These are useful when generating absolute URLs or environment-specific output.

---

## 🛠 How It Works

Internally, the action:

1. Sets up the latest Node.js version
2. Installs dependencies for the internal npm package
3. Installs dependencies for the GitHub Action itself
4. Runs a Node.js build script (`action.mjs`)
5. Exposes the output folder via `GITHUB_OUTPUT`

All logic is handled in Node, making it easy to extend or debug.

---

## 📄 License

MIT © Plushveil
