(function() {


//#region \0page:ctx
	const ctx = {
		"publicApiUrl": "https://api.example.com",
		"publicApiKey": "prod_key_67890",
		"features": {
			"darkMode": true,
			"analytics": true,
			"debugMode": false
		}
	};
	if (typeof window !== "undefined") window.ctx = ctx;

//#endregion
//#region website/assets/context-demo.ts
	const output = document.getElementById("output");
	if (output) output.textContent = [
		"// Context loaded successfully!",
		"",
		`import ctx from 'page:ctx'`,
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
		"// This demonstrates dynamic configuration injection!"
	].join("\n");
	console.log("Context Demo - Context object:", ctx);
	console.log("Context Demo - API URL:", ctx?.publicApiUrl);
	console.log("Context Demo - Features:", ctx?.features);

//#endregion
})();
//# sourceMappingURL=https://plushveil.github.io/assets/context-demo.map.js
