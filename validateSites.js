import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import * as yaml from "js-yaml";

const schemaPath = fileURLToPath(new URL("./sites.schema.json", import.meta.url));
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));

const ajv = new Ajv({ allErrors: true, verbose: true });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

export function formatValidationError(error) {
	if (error.keyword === "additionalProperties") {
		return `unknown field "${error.params.additionalProperty}"`;
	}
	if (error.keyword === "enum") {
		return `"${error.data}" is not an allowed tag`;
	}
	return `${error.instancePath || "/"} ${error.message}`;
}

export function validateSiteData(data) {
	return validateSchema(data) ? [] : (validateSchema.errors ?? []);
}

export function getSiteHostname(urlString) {
	return new URL(urlString).hostname.toLowerCase().replace(/\.$/, "");
}

export function getSiteKey(urlString) {
	return getSiteHostname(urlString).replace(/^www\./, "");
}

export function isDisallowedHostname(hostname) {
	const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");

	if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
		return true;
	}
	if (host === "::1") return true;
	if (host.includes(":") && (host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd"))) {
		return true;
	}

	const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (!ipv4) return false;

	const parts = ipv4.slice(1).map(Number);
	if (parts.some((part) => part > 255)) return true;
	const [a, b] = parts;
	return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

export function getPublicUrlError(urlString) {
	let url;
	try {
		url = new URL(urlString);
	} catch {
		return "the URL is not valid";
	}

	if (!["http:", "https:"].includes(url.protocol)) {
		return "the URL must use http or https";
	}
	if (url.username || url.password) {
		return "the URL must not contain a username or password";
	}
	if (isDisallowedHostname(url.hostname)) {
		return "the URL must point to a public website";
	}
	return null;
}

export function loadAllSiteFiles(dir = "sites") {
	return fs
		.readdirSync(dir)
		.filter((file) => file.endsWith(".yaml"))
		.sort()
		.map((file) => {
			const filePath = path.join(dir, file);
			return { file, data: loadSiteFile(filePath) };
		});
}

export function findDuplicateSite(url, entries) {
	const siteKey = getSiteKey(url);
	return (
		entries.find(({ data }) => {
			try {
				return getSiteKey(data.url) === siteKey;
			} catch {
				return false;
			}
		}) ?? null
	);
}

export function loadSiteFile(filePath) {
	let data;
	try {
		data = yaml.load(fs.readFileSync(filePath, "utf-8"));
	} catch (error) {
		throw new Error(`${filePath}: ${error.message}`);
	}
	const errors = validateSiteData(data);
	if (errors.length > 0) {
		const details = errors.map((error) => `  - ${formatValidationError(error)}`).join("\n");
		throw new Error(`${filePath}: invalid site entry\n${details}`);
	}
	return data;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
	const dir = "sites";
	const files = fs
		.readdirSync(dir)
		.filter((file) => file.endsWith(".yaml"))
		.sort();
	const entries = [];
	let failed = 0;

	for (const file of files) {
		try {
			const data = loadSiteFile(path.join(dir, file));
			entries.push({ file, data });
		} catch (error) {
			failed++;
			console.error(`\n${error.message}`);
		}
	}

	const seenHostnames = new Map();
	for (const { file, data } of entries) {
		const siteKey = getSiteKey(data.url);
		if (seenHostnames.has(siteKey)) {
			failed++;
			console.error(`\n${path.join(dir, file)}: duplicate site hostname "${siteKey}" (already listed in ${seenHostnames.get(siteKey)})`);
		} else {
			seenHostnames.set(siteKey, path.join(dir, file));
		}
	}

	if (failed > 0) {
		console.error(`\n${failed} problem(s) found across ${files.length} site entries.`);
		process.exit(1);
	}

	console.log(`All ${files.length} site entries are valid and unique.`);
}
