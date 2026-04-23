import ctx from 'pages:context'

// Display the context in the output area
const output = document.getElementById('output')

if (output) {
  const lines = [
    '// Context loaded successfully!',
    '',
    `import ctx from 'pages:context'`,
    '',
    '// Context object:',
    JSON.stringify(ctx, null, 2),
    '',
    '// Accessing properties:',
    `ctx.apiUrl = ${JSON.stringify(ctx?.apiUrl)}`,
    `ctx.apiKey = ${JSON.stringify(ctx?.apiKey)}`,
    `ctx.features = ${JSON.stringify(ctx?.features)}`,
    '',
    '// Also available as window.ctx:',
    `window.ctx === ctx // ${window.ctx === ctx}`,
    '',
    '// This demonstrates dynamic configuration injection!',
  ]

  output.textContent = lines.join('\n')
}

// Also log to console for inspection
console.log('Context Demo - Context object:', ctx)
console.log('Context Demo - API URL:', ctx?.apiUrl)
console.log('Context Demo - Features:', ctx?.features)
