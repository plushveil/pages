import ctx from 'page:ctx'

// Display the context in the output area
const output = document.getElementById('output')

if (output) {
  const lines = [
    '// Context loaded successfully!',
    '',
    `import ctx from 'page:ctx'`,
    '',
    '// Context object:',
    JSON.stringify(ctx, null, 2),
    '',
    '// Accessing properties:',
    `ctx.publicApiUrl = ${JSON.stringify(ctx?.publicApiUrl)}`,
    `ctx.publicApiKey = ${JSON.stringify(ctx?.publicApiKey)}`,
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
console.log('Context Demo - API URL:', ctx?.publicApiUrl)
console.log('Context Demo - Features:', ctx?.features)
