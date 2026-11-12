import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import yaml from "js-yaml";
import { findDuplicateSite, formatValidationError, getPublicUrlError, getSiteHostname, loadAllSiteFiles, validateSiteData } from "../../validateSites.js";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const COMMENT_MARKER = "<!-- personalsit.es-site-submission -->";

const LABELS = {
	"site-submission": {
		color: "0e8a16",
		description: "A site submitted through the submission issue form",
	},
	validated: {
		color: "1d76db",
		description: "The site submission passed validation",
	},
	"needs-fix": {
		color: "d93f0b",
		description: "The site submission needs changes before it can be approved",
	},
	approved: {
		color: "5319e7",
		description: "The site submission has been approved for a pull request",
	},
	"pr-opened": {
		color: "c5def5",
		description: "A pull request has been opened for this submission",
	},
};

const FIELD_ALIASES = new Map([
	["site title", "title"],
	["site url", "url"],
	["tags", "tags"],
	["feed url (optional)", "feed"],
	["description (optional)", "description"],
	["description (very optional)", "description"],
	["notes for maintainers", "notes"],
	["confirmation", "confirmation"],
]);

function cleanValue(value) {
	const trimmed = (value ?? "").trim();
	return trimmed === "_No response_" ? "" : trimmed;
}

export function parseIssueForm(body) {
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

export function parseTags(value) {
	if (!value) return [];
	return value
		.split(/[\n,]+/)
		.map((tag) => tag.replace(/^\s*[-*]\s*/, "").trim())
		.filter(Boolean);
}

export function parseConfirmation(value) {
	const checkboxes = (value ?? "")
		.split("\n")
		.map((line) => line.match(/^\s*-\s*\[([ xX])\]\s*(.+)$/))
		.filter(Boolean);

	return {
		total: checkboxes.length,
		checked: checkboxes.filter((match) => match[1].toLowerCase() === "x").length,
	};
}

export function buildSubmission(fields) {
	const site = {
		title: (fields.title ?? "").trim(),
		url: (fields.url ?? "").trim(),
		tags: parseTags(fields.tags),
	};
	const feed = (fields.feed ?? "").trim();
	const description = (fields.description ?? "").trim();
	const notes = (fields.notes ?? "").trim();
	if (feed) site.feed = feed;
	if (description) site.description = description;

	const errors = validateSiteData(site).map(formatValidationError);

	if (notes.length > 4000) {
		errors.push("notes for maintainers must be 4000 characters or fewer");
	}

	if (site.tags.length === 0) {
		errors.push("at least one tag is required");
	}

	const urlError = getPublicUrlError(site.url);
	if (urlError) errors.push(urlError);

	const confirmation = parseConfirmation(fields.confirmation);
	if (confirmation.total === 0) {
		errors.push("the confirmation checkboxes are missing");
	} else if (confirmation.checked !== confirmation.total) {
		errors.push("all confirmation checkboxes must be checked");
	}

	return { site, errors: [...new Set(errors)], confirmation, notes };
}

export function validateSubmission(fields) {
	const { site, errors, notes } = buildSubmission(fields);
	const allErrors = [...errors];
	let filename = null;

	if (allErrors.length === 0) {
		const hostname = getSiteHostname(site.url);
		filename = `${hostname}.yaml`;
		const existing = loadAllSiteFiles(path.join(repoRoot, "sites"));
		const duplicate = findDuplicateSite(site.url, existing);

		if (duplicate) {
			allErrors.push(`this site is already listed in sites/${duplicate.file}`);
		} else if (existing.some(({ file }) => file === filename)) {
			allErrors.push(`sites/${filename} already exists`);
		}
	}

	return { site, errors: allErrors, filename, notes };
}

function buildValidComment(wasEdited) {
	const lines = ["### Site submission checks passed", "", "Everything needed to list this site is present. A maintainer will review the submission and apply the `approved` label if it is ready."];

	if (wasEdited) {
		lines.push("", "The issue was edited, so any previous approval has been reset. A maintainer will need to approve it again.");
	}

	lines.push("", "_This comment updates automatically when the issue is edited._");
	return lines.join("\n");
}

function buildErrorComment(errors) {
	return [
		"### Site submission needs attention",
		"",
		"I couldn't validate this submission:",
		"",
		...errors.map((error) => `- ${error}`),
		"",
		"Edit the issue above to fix these, and I'll check again. If you need help, leave a comment and a maintainer will assist.",
	].join("\n");
}

function buildFailureComment() {
	return ["### Site submission error", "", "Something went wrong while processing this submission. A maintainer will take a look."].join("\n");
}

export function buildPrBody(site, issueNumber, notes) {
	const lines = [`Closes #${issueNumber}`, "", `- **Title:** ${site.title}`, `- **URL:** <${site.url}>`, `- **Tags:** ${site.tags.join(", ")}`];

	if (site.feed) lines.push(`- **Feed:** <${site.feed}>`);
	if (site.description) lines.push(`- **Description:** ${site.description}`);

	lines.push("", "Submitted through the site submission issue form.");
	return lines.join("\n");
}

function buildPublishComment(pr) {
	if (pr.existing) {
		return ["### Pull request already open", "", `A pull request for this submission is already open: ${pr.url}`].join("\n");
	}

	return [
		"### Pull request opened",
		"",
		`I've opened ${pr.url} for review. A maintainer will merge it once everything looks good. This issue will close automatically once the pull request is merged.`,
	].join("\n");
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

function refPath(ref) {
	return ref.split("/").map(encodeURIComponent).join("/");
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
				"User-Agent": "personalsit.es-site-submission-bot",
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

async function createPullRequest(client, site, filename, issueNumber, notes) {
	const owner = client.repo.split("/")[0];
	const hostname = getSiteHostname(site.url).replace(/[^a-z0-9.-]+/g, "-");
	const branch = `site-submission/${issueNumber}-${hostname}`;
	const existingPrs = await client.request("GET", `/repos/${client.repo}/pulls?head=${encodeURIComponent(`${owner}:${branch}`)}&state=open`);

	if (existingPrs.length > 0) {
		return {
			existing: true,
			url: existingPrs[0].html_url,
			number: existingPrs[0].number,
		};
	}

	const repo = await client.request("GET", `/repos/${client.repo}`);
	const base = repo.default_branch;
	const baseRef = await client.request("GET", `/repos/${client.repo}/git/ref/heads/${refPath(base)}`);
	const baseCommit = await client.request("GET", `/repos/${client.repo}/git/commits/${baseRef.object.sha}`);
	const content = yaml.dump(site, {
		lineWidth: -1,
		noRefs: true,
		quotingType: '"',
	});
	const blob = await client.request("POST", `/repos/${client.repo}/git/blobs`, { content, encoding: "utf-8" });
	const tree = await client.request("POST", `/repos/${client.repo}/git/trees`, {
		base_tree: baseCommit.tree.sha,
		tree: [
			{
				path: `sites/${filename}`,
				mode: "100644",
				type: "blob",
				sha: blob.sha,
			},
		],
	});
	const commit = await client.request("POST", `/repos/${client.repo}/git/commits`, {
		message: `Add ${site.title}`,
		tree: tree.sha,
		parents: [baseRef.object.sha],
	});

	try {
		await client.request("POST", `/repos/${client.repo}/git/refs`, {
			ref: `refs/heads/${branch}`,
			sha: commit.sha,
		});
	} catch (error) {
		if (error.status !== 422) throw error;
		await client.request("PATCH", `/repos/${client.repo}/git/refs/heads/${refPath(branch)}`, { sha: commit.sha, force: true });
	}

	const pr = await client.request("POST", `/repos/${client.repo}/pulls`, {
		title: `Add ${site.title}`,
		head: branch,
		base,
		body: buildPrBody(site, issueNumber, notes),
	});

	await client.request("POST", `/repos/${client.repo}/issues/${pr.number}/labels`, { labels: ["site-submission"] });

	return { existing: false, url: pr.html_url, number: pr.number };
}

async function main() {
	const issueBody = process.env.ISSUE_BODY;
	const issueNumber = process.env.ISSUE_NUMBER;
	const issueAction = process.env.ISSUE_ACTION ?? "opened";
	const mode = process.env.MODE ?? "validate";
	const dryRun = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");

	if (!issueBody) throw new Error("ISSUE_BODY is required");
	if (!issueNumber) throw new Error("ISSUE_NUMBER is required");
	if (!["validate", "publish"].includes(mode)) {
		throw new Error(`Unknown MODE "${mode}"`);
	}

	const fields = parseIssueForm(issueBody);
	const result = validateSubmission(fields);

	if (dryRun) {
		console.log(JSON.stringify({ fields, ...result }, null, 2));
		return;
	}

	const client = createGithubClient();
	await ensureLabels(client);
	await addLabel(client, issueNumber, "site-submission");

	if (result.errors.length > 0) {
		await upsertComment(client, issueNumber, buildErrorComment(result.errors));
		await addLabel(client, issueNumber, "needs-fix");
		await removeLabel(client, issueNumber, "validated");
		await removeLabel(client, issueNumber, "approved");
		setOutput("valid", "false");
		setOutput("errors", result.errors.join("; "));
		writeStepSummary(`Validation failed with ${result.errors.length} error(s).`);
		console.log(`Validation failed:\n- ${result.errors.join("\n- ")}`);
		return;
	}

	if (mode === "publish") {
		const pr = await createPullRequest(client, result.site, result.filename, issueNumber, result.notes);
		await addLabel(client, issueNumber, "validated");
		await addLabel(client, issueNumber, "pr-opened");
		await removeLabel(client, issueNumber, "needs-fix");
		await upsertComment(client, issueNumber, buildPublishComment(pr));
		setOutput("valid", "true");
		setOutput("pr_url", pr.url);
		writeStepSummary(`Pull request: ${pr.url}`);
		console.log(`Pull request: ${pr.url}`);
		return;
	}

	await addLabel(client, issueNumber, "validated");
	await removeLabel(client, issueNumber, "needs-fix");

	if (issueAction === "edited") {
		await removeLabel(client, issueNumber, "approved");
	}

	await upsertComment(client, issueNumber, buildValidComment(issueAction === "edited"));
	setOutput("valid", "true");
	setOutput("filename", result.filename);
	writeStepSummary("Validation passed. Waiting for maintainer approval.");
	console.log("Validation passed. Waiting for maintainer approval.");
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
	main().catch(async (error) => {
		console.error(error);

		if (process.env.DRY_RUN !== "1" && process.env.GITHUB_TOKEN) {
			try {
				const client = createGithubClient();
				await upsertComment(client, process.env.ISSUE_NUMBER, buildFailureComment());
			} catch (commentError) {
				console.error("Could not post the failure comment:", commentError);
			}
		}

		process.exit(1);
	});
}
