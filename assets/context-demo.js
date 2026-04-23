(function() {


//#region website/assets/context-demo.ts
	const output = document.getElementById("output");
	if (output) output.textContent = [
		"// Context loaded successfully!",
		"",
		`import ctx from 'page:ctx'`,
		"",
		"// Context object:",
		JSON.stringify(void 0, null, 2),
		"",
		"// Accessing properties:",
		`ctx.publicApiUrl = ${JSON.stringify((void 0)?.publicApiUrl)}`,
		`ctx.publicApiKey = ${JSON.stringify((void 0)?.publicApiKey)}`,
		`ctx.features = ${JSON.stringify((void 0)?.features)}`,
		"",
		"// Also available as window.ctx:",
		`window.ctx === ctx // ${window.ctx === void 0}`,
		"",
		"// This demonstrates dynamic configuration injection!"
	].join("\n");
	console.log("Context Demo - Context object:", void 0);
	console.log("Context Demo - API URL:", (void 0)?.publicApiUrl);
	console.log("Context Demo - Features:", (void 0)?.features);

//#endregion
})();
//# sourceMappingURL=https://plushveil.github.io/assets/context-demo.map.js
