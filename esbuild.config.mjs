import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";
import { copyFileSync } from "fs";

const DESTINATIONS = [
	"/Users/amin/Documents/Obsidian Vaults/Lesson/OSL/.obsidian/plugins/word-viewer",
	"/Users/amin/Documents/Obsidian Vaults/Lesson/Other/.obsidian/plugins/word-viewer",
	"/Users/amin/Documents/Obsidian Vaults/Lesson/FQH1/.obsidian/plugins/word-viewer",
	"/Users/amin/Documents/Obsidian Vaults/Lesson/FQH2/.obsidian/plugins/word-viewer",
];

const prod = process.argv[2] === "production";

await esbuild.build({
	banner: { js: "/* Word Viewer */" },
	entryPoints: ["src/main.ts"],
	bundle: true,
	external: [
		"obsidian", "electron",
		"@codemirror/autocomplete", "@codemirror/collab", "@codemirror/commands",
		"@codemirror/language", "@codemirror/lint", "@codemirror/search",
		"@codemirror/state", "@codemirror/view",
		"@lezer/common", "@lezer/highlight", "@lezer/lr",
		...builtins,
	],
	format: "cjs",
	target: "es2018",
	logLevel: "info",
	sourcemap: false,
	minify: prod,
	treeShaking: true,
	outfile: "main.js",
});

if (prod) {
	for (const dest of DESTINATIONS) {
		try {
			copyFileSync("main.js", `${dest}/main.js`);
			copyFileSync("styles.css", `${dest}/styles.css`);
			copyFileSync("manifest.json", `${dest}/manifest.json`);
			console.log(`✅ ${dest}`);
		} catch (e) {
			console.log(`⚠️  ${dest} (skip)`);
		}
	}
	console.log("🎉 تمام شد!");
}
