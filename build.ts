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
await copyFile("src/content.css", join(distDir, "content.css"));
await copyFile("sample_tasks.csv", join(distDir, "sample_tasks.csv"));

// Copy icons
const iconsDir = join(distDir, "icons");
await mkdir(iconsDir, { recursive: true });
await copyFile("icons/icon16.png", join(iconsDir, "icon16.png"));
await copyFile("icons/icon48.png", join(iconsDir, "icon48.png"));
await copyFile("icons/icon96.png", join(iconsDir, "icon96.png"));
await copyFile("icons/icon128.png", join(iconsDir, "icon128.png"));

console.log("Extension ready in ./dist");
