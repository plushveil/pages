(function() {

//#region \0rolldown/runtime.js
	var __create = Object.create;
	var __defProp = Object.defineProperty;
	var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
	var __getOwnPropNames = Object.getOwnPropertyNames;
	var __getProtoOf = Object.getPrototypeOf;
	var __hasOwnProp = Object.prototype.hasOwnProperty;
	var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
	var __copyProps = (to, from, except, desc) => {
		if (from && typeof from === "object" || typeof from === "function") {
			for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) {
					__defProp(to, key, {
						get: ((k) => from[k]).bind(null, key),
						enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
					});
				}
			}
		}
		return to;
	};
	var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
		value: mod,
		enumerable: true
	}) : target, mod));

//#endregion

//#region website/assets/context-demo.ts
	var require_context_demo = /* @__PURE__ */ __commonJSMin((() => {
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
	}));

//#endregion
//#region \0pages-virtual-entry
	Promise.resolve().then(() => /* @__PURE__ */ __toESM(require_context_demo()));

//#endregion
})();
//# sourceMappingURL=https://plushveil.github.io/assets/context-demo.map.js
