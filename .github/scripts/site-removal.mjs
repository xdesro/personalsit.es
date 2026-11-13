import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { findDuplicateSite, getPublicUrlError, getSiteHostname, loadAllSiteFiles } from "../../validateSites.js";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const COMMENT_MARKER = "<!-- personalsit.es-site-removal -->";

const LABELS = {
	"site-removal": {
		color: "b60205",
		description: "A site removal requested through the issue form",
	},
	validated: {
		color: "1d76db",
		description: "The request passed validation",
	},
	"needs-fixed": {
		color: "d93f0b",
		description: "The request needs changes before it can be approved",
	},
	approved: {
		color: "5319e7",
		description: "Approved by a maintainer",
	},
	"pr-opened": {
		color: "c5def5",
		description: "A pull request has been opened",
	},
};

const FIELD_ALIASES = new Map([
	["site url to remove", "url"],
	["reason for removal", "reasonType"],
	["details (optional)", "reason"],
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

export function validateRemoval(fields) {
	const url = (fields.url ?? "").trim();
	const reasonType = (fields.reasonType ?? "").trim();
	const reason = (fields.reason ?? "").trim();
	const notes = (fields.notes ?? "").trim();
	const errors = [];
	const confirmation = parseConfirmation(fields.confirmation);

	if (!url) errors.push("the site URL is required");
	const urlError = url ? getPublicUrlError(url) : null;
	if (urlError) errors.push(urlError);

	if (!reasonType) {
		errors.push("a removal reason is required");
	}

	if (confirmation.total === 0) {
		errors.push("the confirmation checkbox is missing");
	} else if (confirmation.checked !== confirmation.total) {
		errors.push("all confirmation checkboxes must be checked");
	}

	if (reason.length > 4000) {
		errors.push("removal details must be 4000 characters or fewer");
	}
	if (notes.length > 4000) {
		errors.push("notes for maintainers must be 4000 characters or fewer");
	}

	let site = null;

	if (errors.length === 0) {
		const entries = loadAllSiteFiles(path.join(repoRoot, "sites"));
		site = findDuplicateSite(url, entries);

		if (!site) {
			errors.push("this site is not listed in the directory");
		}
	}

	return { url, reasonType, reason, notes, confirmation, site, errors: [...new Set(errors)] };
}

function buildValidComment(result, wasEdited) {
	const lines = [
		"### Site removal request checks passed",
		"",
		`I found **${result.site.data.title}** (<${result.site.data.url}>) in \`sites/${result.site.file}\`.`,
		"",
		`Reason: ${result.reasonType}`,
		"",
		"A maintainer will review this request and apply the `approved` label to open a removal pull request.",
	];

	if (wasEdited) {
		lines.push("", "The issue was edited or reopened, so any previous approval has been reset. A maintainer will need to approve it again.");
	}

	lines.push("", "_This comment updates automatically when the issue is edited._");
	return lines.join("\n");
}

function buildErrorComment(errors) {
	return [
		"### Site removal request needs attention",
		"",
		"I couldn't validate this request:",
		"",
		...errors.map((error) => `- ${error}`),
		"",
		"Edit the issue above to fix these, and I'll check again. If you need help, leave a comment and a maintainer will assist.",
	].join("\n");
}

function buildPrBody(site, issueNumber, reasonType, reason) {
	const lines = [
		`Closes #${issueNumber}`,
		"",
		`- **Title:** ${site.data.title}`,
		`- **URL:** <${site.data.url}>`,
		`- **Removal reason:** ${reasonType}`,
	];

	if (reason) lines.push(`- **Details:** ${reason}`);

	lines.push("", "Submitted through the site removal issue form.");
	return lines.join("\n");
}

function buildPublishComment(pr) {
	if (pr.existing) {
		return ["### Pull request already open", "", `A pull request for this removal is already open: ${pr.url}`].join("\n");
	}

	return [
		"### Pull request opened",
		"",
		`I've opened ${pr.url} to remove this site. A maintainer will merge it once everything looks good. This issue will close automatically once the pull request is merged.`,
	].join("\n");
}

function buildFailureComment() {
	return ["### Site removal error", "", "Something went wrong while processing this removal request. A maintainer will take a look."].join("\n");
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
				"User-Agent": "personalsit.es-site-removal-bot",
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

async function createRemovalPullRequest(client, site, issueNumber, reasonType, reason) {
	const owner = client.repo.split("/")[0];
	const hostname = getSiteHostname(site.data.url).replace(/[^a-z0-9.-]+/g, "-");
	const branch = `site-removal/${issueNumber}-${hostname}`;
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
	const tree = await client.request("POST", `/repos/${client.repo}/git/trees`, {
		base_tree: baseCommit.tree.sha,
		tree: [
			{
				path: `sites/${site.file}`,
				mode: "100644",
				type: "blob",
				sha: null,
			},
		],
	});
	const commit = await client.request("POST", `/repos/${client.repo}/git/commits`, {
		message: `Remove ${site.data.title}`,
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
		title: `Remove ${site.data.title}`,
		head: branch,
		base,
		body: buildPrBody(site, issueNumber, reasonType, reason),
	});

	await client.request("POST", `/repos/${client.repo}/issues/${pr.number}/labels`, { labels: ["site-removal"] });

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
	const result = validateRemoval(fields);

	if (dryRun) {
		console.log(JSON.stringify({ fields, ...result }, null, 2));
		return;
	}

	const client = createGithubClient();
	await ensureLabels(client);
	await addLabel(client, issueNumber, "site-removal");

	if (result.errors.length > 0) {
		await upsertComment(client, issueNumber, buildErrorComment(result.errors));
		await addLabel(client, issueNumber, "needs-fixed");
		await removeLabel(client, issueNumber, "validated");
		await removeLabel(client, issueNumber, "approved");
		setOutput("valid", "false");
		setOutput("errors", result.errors.join("; "));
		writeStepSummary(`Validation failed with ${result.errors.length} error(s).`);
		console.log(`Validation failed:\n- ${result.errors.join("\n- ")}`);
		if (mode === "publish") process.exitCode = 1;
		return;
	}

	if (mode === "publish") {
		const pr = await createRemovalPullRequest(client, result.site, issueNumber, result.reasonType, result.reason);
		await addLabel(client, issueNumber, "validated");
		await addLabel(client, issueNumber, "pr-opened");
		await removeLabel(client, issueNumber, "needs-fixed");
		await upsertComment(client, issueNumber, buildPublishComment(pr));
		setOutput("valid", "true");
		setOutput("pr_url", pr.url);
		writeStepSummary(`Pull request: ${pr.url}`);
		console.log(`Pull request: ${pr.url}`);
		return;
	}

	await addLabel(client, issueNumber, "validated");
	await removeLabel(client, issueNumber, "needs-fixed");

	const wasEdited = issueAction === "edited" || issueAction === "reopened";
	if (wasEdited) {
		await removeLabel(client, issueNumber, "approved");
	}

	await upsertComment(client, issueNumber, buildValidComment(result, wasEdited));
	setOutput("valid", "true");
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
				await addLabel(client, process.env.ISSUE_NUMBER, "needs-fixed");
				await removeLabel(client, process.env.ISSUE_NUMBER, "approved");
			} catch (commentError) {
				console.error("Could not post the failure comment:", commentError);
			}
		}

		process.exit(1);
	});
}
