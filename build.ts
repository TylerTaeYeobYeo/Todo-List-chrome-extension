import { build } from "bun";
import { copyFile, mkdir } from "fs/promises";
import { join } from "path";

// 1. Clean verify/create dist directory
const distDir = "dist";
await mkdir(distDir, { recursive: true });

// 2. Build TypeScript files
console.log("Building extension...");
const result = await build({
    entrypoints: [
        "./src/background.ts",
        "./src/content.ts",
        "./src/popup/popup.ts",
    ],
    outdir: "./dist",
    target: "browser",
    minify: false, // Set to true for production
});

if (!result.success) {
    console.error("Build failed");
    for (const message of result.logs) {
        console.error(message);
    }
} else {
    console.log("Build successful");
}

// 3. Copy static files
console.log("Copying static files...");
await copyFile("manifest.json", join(distDir, "manifest.json"));
await copyFile("src/popup/popup.html", join(distDir, "popup", "popup.html"));
await copyFile("src/popup/popup.css", join(distDir, "popup", "popup.css"));
// TODO: copy icons when they exist

console.log("Extension ready in ./dist");
