(function() {


//#region website/assets/context-demo.ts
	const output = document.getElementById("output");
	if (output) output.textContent = [
		"// Context loaded successfully!",
		"",
		"// ctx is automatically available - no import needed",
		"",
		"// Context object:",
		JSON.stringify(ctx, null, 2),
		"",
		"// Accessing properties:",
		`ctx.publicApiUrl = ${JSON.stringify(ctx?.publicApiUrl)}`,
		`ctx.publicApiKey = ${JSON.stringify(ctx?.publicApiKey)}`,
		`ctx.features = ${JSON.stringify(ctx?.features)}`,
		"",
		"// Also available as window.ctx:",
		`window.ctx === ctx // ${window.ctx === ctx}`,
		"",
		"// Tree-shaking example:",
		`// if (ctx.name !== 'production') import('./analytics.js')`,
		`// ↑ Analytics only loaded when needed!`,
		"",
		"// This demonstrates dynamic configuration injection!"
	].join("\n");
	console.log("Context Demo - Context object:", ctx);
	console.log("Context Demo - API URL:", ctx?.publicApiUrl);
	console.log("Context Demo - Features:", ctx?.features);

//#endregion
//#region \0pages-virtual-entry
	const ctx$1 = Object.freeze({
		"publicApiUrl": "https://demo.api.example.com",
		"publicApiKey": "demo_key_12345",
		"features": {
			"darkMode": true,
			"analytics": false,
			"debugMode": true
		}
	});
	if (typeof window !== "undefined") window.ctx = ctx$1;

//#endregion
})();
//# sourceMappingURL=https://plushveil.github.io/assets/context-demo.map.js
