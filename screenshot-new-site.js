import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import captureWebsite from "capture-website";
import filenamifyUrl from "filenamify-url";
import { getPublicUrlError } from "./validateSites.js";

const outputDir = path.resolve(process.env.SCREENSHOT_OUTPUT_DIR || "screenshots");
const sitesDir = path.resolve("sites");
const maxChangedFiles = Number(process.env.MAX_CHANGED_FILES || 25);
const overwriteExisting = process.env.SCREENSHOT_OVERWRITE === "true";
const changedFiles = (process.env.CHANGED_FILES || "").split(/\s+/).filter(Boolean);
const browserEnv = Object.fromEntries(["HOME", "PATH", "LANG", "LC_ALL", "TMPDIR", "TZ", "DISPLAY", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME"].filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]]));
// Headless Chrome's default UA is blocked by some sites (Cloudflare/bot checks).
const screenshotUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

function getSafeFilename(url) {
	const base = filenamifyUrl(url, { replacement: "" });
	if (!base || base !== path.basename(base) || base.includes("..")) {
		throw new Error(`Could not derive a safe screenshot filename for ${url}`);
	}
	return `${base}.png`;
}

function getChangedSites() {
	if (changedFiles.length > maxChangedFiles) {
		throw new Error(`Refusing to capture ${changedFiles.length} sites in one run (limit: ${maxChangedFiles})`);
	}

	const sites = [];
	const seenFilenames = new Set();

	for (const file of changedFiles) {
		if (!file.endsWith(".yaml")) continue;

		const filePath = path.resolve(file);
		if (!filePath.startsWith(`${sitesDir}${path.sep}`)) {
			throw new Error(`Refusing to read a file outside sites/: ${file}`);
		}

		const stat = fs.lstatSync(filePath);
		if (!stat.isFile()) {
			throw new Error(`Refusing to read a non-regular file: ${file}`);
		}

		const data = yaml.load(fs.readFileSync(filePath, "utf-8"));
		const url = data?.url;
		if (!url) {
			console.warn(`No URL found in ${file}`);
			continue;
		}

		const urlError = getPublicUrlError(url);
		if (urlError) {
			console.warn(`Skipping ${file}: ${urlError}`);
			continue;
		}

		let filename;
		try {
			filename = getSafeFilename(url);
		} catch (error) {
			console.warn(error.message);
			continue;
		}

		if (seenFilenames.has(filename)) continue;
		seenFilenames.add(filename);

		sites.push({
			title: data.title || filename,
			url,
			filename,
			source: file,
		});
	}

	return sites;
}

async function main() {
	fs.mkdirSync(outputDir, { recursive: true });

	const sites = getChangedSites();
	const manifest = {
		generatedAt: new Date().toISOString(),
		pullRequest: process.env.PR_NUMBER || null,
		overwrite: overwriteExisting,
		screenshots: [],
		failures: [],
	};

	for (const site of sites) {
		try {
			console.log(`Capturing screenshot for ${site.url}...`);
			const screenshot = await captureWebsite.buffer(site.url, {
				timeout: 30,
				width: 1280,
				height: 800,
				scaleFactor: 1,
				userAgent: screenshotUserAgent,
				waitForNetworkIdle: true,
				// This job deliberately has no repository or cloud secrets as the privileged upload happens in a separate workflow.
				launchOptions: {
					args: [
						"--no-sandbox",
						"--disable-setuid-sandbox",
						"--disable-blink-features=AutomationControlled",
					],
					env: browserEnv,
				},
			});

			if (!(screenshot instanceof Uint8Array) || screenshot.byteLength === 0) {
				throw new Error("capture returned an empty image");
			}

			const outputPath = path.join(outputDir, site.filename);
			fs.writeFileSync(outputPath, Buffer.from(screenshot));
			manifest.screenshots.push({
				filename: site.filename,
				url: site.url,
				title: site.title,
			});
			console.log(`✨ Captured ${site.filename}`);
		} catch (error) {
			console.error(`Screenshot failed for ${site.url}: ${error.message}`);
			manifest.failures.push({
				source: site.source,
				url: site.url,
				error: error.message,
			});
		}
	}

	fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

	if (sites.length > 0 && manifest.screenshots.length === 0) {
		throw new Error("No screenshots were captured");
	}

	console.log(`
=====
Screenshot capture complete.
✨ Successful: ${manifest.screenshots.length}
💥 Failed: ${manifest.failures.length}
${manifest.failures.length > 0 ? `\nFailed sites:\n${manifest.failures.map((failure) => failure.url).join("\n")}` : ""}
=====`);

	if (process.env.GITHUB_STEP_SUMMARY) {
		fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Captured ${manifest.screenshots.length} screenshot(s); ${manifest.failures.length} failed.\n`);
	}
}

main().catch((error) => {
	console.error("Fatal error:", error.message);
	process.exit(1);
});
