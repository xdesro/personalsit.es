import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import filenamifyUrl from "filenamify-url";
import { findDuplicateSite, getPublicUrlError, loadAllSiteFiles } from "../../validateSites.js";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const COMMENT_MARKER = "<!-- personalsit.es-screenshot-update -->";

const LABELS = {
	"screenshot-update": {
		color: "c5def5",
		description: "A screenshot update requested through the issue form",
	},
	"screenshot-validated": {
		color: "1d76db",
		description: "The screenshot update request passed validation",
	},
	"screenshot-needs-fix": {
		color: "d93f0b",
		description: "The screenshot update request needs changes before it can be approved",
	},
	"screenshot-approved": {
		color: "5319e7",
		description: "The screenshot update has been approved",
	},
	"screenshot-updated": {
		color: "0e8a16",
		description: "The screenshot has been updated on the CDN",
	},
};

const FIELD_ALIASES = new Map([
	["site url to update", "url"],
	["notes for maintainers", "notes"],
	["confirmation", "confirmation"],
]);

function cleanValue(value) {
	const trimmed = (value ?? "").trim();
	return trimmed === "_No response_" ? "" : trimmed;
}

function parseIssueForm(body) {
	const sections = new Map();
	let heading = null;
	let lines = [];

	const flush = () => {
		if (heading) sections.set(heading, cleanValue(lines.join("\n")));
	};

	for (const line of (body ?? "").replace(/\r\n/g, "\n").split("\n")) {
		const match = line.match(/^###\s+(.+?)\s*$/);
		if (match) {
			flush();
			heading = match[1].trim().toLowerCase();
			lines = [];
		} else if (heading) {
			lines.push(line);
		}
	}
	flush();

	const fields = {};
	for (const [headingName, key] of FIELD_ALIASES) {
		if (sections.has(headingName)) fields[key] = sections.get(headingName);
	}
	return fields;
}

function parseConfirmation(value) {
	const checkboxes = (value ?? "")
		.split("\n")
		.map((line) => line.match(/^\s*-\s*\[([ xX])\]\s*(.+)$/))
		.filter(Boolean);

	return {
		total: checkboxes.length,
		checked: checkboxes.filter((match) => match[1].toLowerCase() === "x").length,
	};
}

function getScreenshotFilename(url) {
	const base = filenamifyUrl(url, { replacement: "" });
	if (!base || base !== path.basename(base) || base.includes("..")) {
		throw new Error(`Could not derive a screenshot filename for ${url}`);
	}
	return `${base}.png`;
}

export function validateScreenshotUpdate(fields) {
	const url = (fields.url ?? "").trim();
	const notes = (fields.notes ?? "").trim();
	const errors = [];
	const confirmation = parseConfirmation(fields.confirmation);

	if (!url) errors.push("the site URL is required");
	const urlError = url ? getPublicUrlError(url) : null;
	if (urlError) errors.push(urlError);

	if (confirmation.total === 0) {
		errors.push("the confirmation checkboxes are missing");
	} else if (confirmation.checked !== confirmation.total) {
		errors.push("all confirmation checkboxes must be checked");
	}

	if (notes.length > 4000) {
		errors.push("notes for maintainers must be 4000 characters or fewer");
	}

	let site = null;
	let screenshotFilename = null;

	if (errors.length === 0) {
		const entries = loadAllSiteFiles(path.join(repoRoot, "sites"));
		site = findDuplicateSite(url, entries);

		if (!site) {
			errors.push("this site is not listed in the directory; submit it first with the site submission form");
		} else {
			try {
				screenshotFilename = getScreenshotFilename(site.data.url);
			} catch (error) {
				errors.push(error.message);
			}
		}
	}

	return { url, notes, confirmation, site, screenshotFilename, errors: [...new Set(errors)] };
}

function buildValidComment(result, wasEdited) {
	const lines = [
		"### Screenshot update request checks passed",
		"",
		`I found **${result.site.data.title}** (<${result.site.data.url}>) in \`sites/${result.site.file}\`.`,
		"",
		"A maintainer will review this request and apply the `screenshot-approved` label to capture and upload the new screenshot.",
	];

	if (wasEdited) {
		lines.push("", "The issue was edited, so any previous approval has been reset. A maintainer will need to approve it again.");
	}

	lines.push("", "_This comment updates automatically when the issue is edited._");
	return lines.join("\n");
}

function buildErrorComment(errors) {
	return [
		"### Screenshot update request needs attention",
		"",
		"I couldn't validate this request:",
		"",
		...errors.map((error) => `- ${error}`),
		"",
		"Edit the issue above to fix these, and I'll check again. If you need help, leave a comment and a maintainer will assist.",
	].join("\n");
}

function buildUpdatedComment(result) {
	const screenshotUrl = `https://personalsites.b-cdn.net/${encodeURIComponent(result.screenshotFilename)}?width=600`;

	return [
		"### Screenshot updated",
		"",
		`I've captured and uploaded a fresh screenshot for **${result.site.data.title}** (<${result.site.data.url}>).`,
		"",
		`[Preview the new screenshot](${screenshotUrl})`,
		"",
		"The CDN may keep serving the previous image until its cache expires.",
		"",
		"Closing this issue.",
	].join("\n");
}

function buildFailureComment() {
	return ["### Screenshot update failed", "", "Something went wrong while capturing or uploading the new screenshot. A maintainer will check the workflow logs and try again."].join("\n");
}

function setOutput(name, value) {
	if (!process.env.GITHUB_OUTPUT) return;
	const safeValue = String(value ?? "").replace(/\r?\n/g, " ");
	fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${safeValue}\n`);
}

function writeStepSummary(markdown) {
	if (!process.env.GITHUB_STEP_SUMMARY) return;
	fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}

function createGithubClient() {
	const token = process.env.GITHUB_TOKEN;
	const repo = process.env.GITHUB_REPOSITORY;

	if (!token || !repo) {
		throw new Error("GITHUB_TOKEN and GITHUB_REPOSITORY are required");
	}

	async function request(method, endpoint, body) {
		const apiUrl = process.env.GITHUB_API_URL || "https://api.github.com";
		const response = await fetch(`${apiUrl}${endpoint}`, {
			method,
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: "application/vnd.github+json",
				"X-GitHub-Api-Version": "2022-11-28",
				"User-Agent": "personalsit.es-screenshot-update-bot",
			},
			body: body === undefined ? undefined : JSON.stringify(body),
		});

		if (!response.ok) {
			const details = await response.text();
			const error = new Error(`${method} ${endpoint} failed with ${response.status}: ${details}`);
			error.status = response.status;
			throw error;
		}

		if (response.status === 204) return null;
		return response.json();
	}

	return { request, repo };
}

async function ensureLabels(client) {
	for (const [name, details] of Object.entries(LABELS)) {
		try {
			await client.request("POST", `/repos/${client.repo}/labels`, {
				name,
				...details,
			});
		} catch (error) {
			if (error.status !== 422) throw error;
		}
	}
}

async function addLabel(client, issueNumber, name) {
	try {
		await client.request("POST", `/repos/${client.repo}/issues/${issueNumber}/labels`, { labels: [name] });
	} catch (error) {
		if (error.status !== 422) throw error;
	}
}

async function removeLabel(client, issueNumber, name) {
	try {
		await client.request("DELETE", `/repos/${client.repo}/issues/${issueNumber}/labels/${encodeURIComponent(name)}`);
	} catch (error) {
		if (error.status !== 404 && error.status !== 422) throw error;
	}
}

async function upsertComment(client, issueNumber, body) {
	const comments = await client.request("GET", `/repos/${client.repo}/issues/${issueNumber}/comments?per_page=100`);
	const existing = comments.find((comment) => comment.body?.includes(COMMENT_MARKER));
	const payload = `${COMMENT_MARKER}\n${body}`;

	if (existing) {
		await client.request("PATCH", `/repos/${client.repo}/issues/comments/${existing.id}`, { body: payload });
	} else {
		await client.request("POST", `/repos/${client.repo}/issues/${issueNumber}/comments`, { body: payload });
	}
}

async function closeIssue(client, issueNumber) {
	await client.request("PATCH", `/repos/${client.repo}/issues/${issueNumber}`, {
		state: "closed",
		state_reason: "completed",
	});
}

function runNodeScript(script, env) {
	const result = spawnSync(process.execPath, [path.join(repoRoot, script)], {
		cwd: repoRoot,
		env: { ...process.env, ...env },
		stdio: "inherit",
	});

	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(`${script} exited with code ${result.status}`);
	}
}

function updateScreenshot(site) {
	const outputDir = path.join(repoRoot, "screenshots");
	const env = {
		CHANGED_FILES: `sites/${site.file}`,
		SCREENSHOT_OUTPUT_DIR: outputDir,
		SCREENSHOT_ARTIFACT_DIR: outputDir,
		SCREENSHOT_OVERWRITE: "true",
	};

	runNodeScript("screenshot-new-site.js", env);
	runNodeScript("upload-screenshots.js", env);
}

async function main() {
	const issueBody = process.env.ISSUE_BODY;
	const issueNumber = process.env.ISSUE_NUMBER;
	const issueAction = process.env.ISSUE_ACTION ?? "opened";
	const mode = process.env.MODE ?? "validate";
	const dryRun = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");

	if (!issueBody) throw new Error("ISSUE_BODY is required");
	if (!issueNumber) throw new Error("ISSUE_NUMBER is required");
	if (!["validate", "update"].includes(mode)) {
		throw new Error(`Unknown MODE "${mode}"`);
	}

	const fields = parseIssueForm(issueBody);
	const result = validateScreenshotUpdate(fields);

	if (dryRun) {
		console.log(JSON.stringify({ fields, ...result }, null, 2));
		return;
	}

	const client = createGithubClient();
	await ensureLabels(client);
	await addLabel(client, issueNumber, "screenshot-update");

	if (result.errors.length > 0) {
		await upsertComment(client, issueNumber, buildErrorComment(result.errors));
		await addLabel(client, issueNumber, "screenshot-needs-fix");
		await removeLabel(client, issueNumber, "screenshot-validated");
		await removeLabel(client, issueNumber, "screenshot-approved");
		setOutput("valid", "false");
		setOutput("errors", result.errors.join("; "));
		writeStepSummary(`Validation failed with ${result.errors.length} error(s).`);
		console.log(`Validation failed:\n- ${result.errors.join("\n- ")}`);
		if (mode === "update") process.exitCode = 1;
		return;
	}

	if (mode === "update") {
		try {
			updateScreenshot(result.site);
		} catch (error) {
			console.error(error);
			await upsertComment(client, issueNumber, buildFailureComment());
			await addLabel(client, issueNumber, "screenshot-needs-fix");
			await removeLabel(client, issueNumber, "screenshot-approved");
			setOutput("updated", "false");
			writeStepSummary(`Screenshot update failed: ${error.message}`);
			process.exitCode = 1;
			return;
		}

		try {
			await addLabel(client, issueNumber, "screenshot-validated");
			await addLabel(client, issueNumber, "screenshot-updated");
			await removeLabel(client, issueNumber, "screenshot-needs-fix");
			await removeLabel(client, issueNumber, "screenshot-approved");
			await upsertComment(client, issueNumber, buildUpdatedComment(result));
			await closeIssue(client, issueNumber);
		} catch (error) {
			console.error("Screenshot updated, but the issue could not be updated:", error);
			writeStepSummary(`Screenshot updated for ${result.site.data.url}, but the issue could not be updated: ${error.message}`);
			process.exitCode = 1;
			return;
		}

		setOutput("updated", "true");
		writeStepSummary(`Screenshot updated for ${result.site.data.url}.`);
		console.log(`Screenshot updated for ${result.site.data.url}.`);
		return;
	}

	await addLabel(client, issueNumber, "screenshot-validated");
	await removeLabel(client, issueNumber, "screenshot-needs-fix");

	const wasEdited = issueAction === "edited" || issueAction === "reopened";
	if (wasEdited) {
		await removeLabel(client, issueNumber, "screenshot-approved");
	}

	await upsertComment(client, issueNumber, buildValidComment(result, wasEdited));
	setOutput("valid", "true");
	setOutput("filename", result.screenshotFilename);
	writeStepSummary("Validation passed. Waiting for maintainer approval.");
	console.log("Validation passed. Waiting for maintainer approval.");
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
	main().catch(async (error) => {
		console.error(error);

		if (process.env.GITHUB_TOKEN && process.env.ISSUE_NUMBER) {
			try {
				const client = createGithubClient();
				await ensureLabels(client);
				await upsertComment(client, process.env.ISSUE_NUMBER, buildFailureComment());
				await addLabel(client, process.env.ISSUE_NUMBER, "screenshot-needs-fix");
				await removeLabel(client, process.env.ISSUE_NUMBER, "screenshot-approved");
			} catch (commentError) {
				console.error("Could not post the failure comment:", commentError);
			}
		}

		process.exit(1);
	});
}
