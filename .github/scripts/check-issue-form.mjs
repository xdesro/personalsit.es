import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as yaml from "js-yaml";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const schemaPath = path.join(repoRoot, "sites.schema.json");
const issueFormPath = path.join(repoRoot, ".github", "ISSUE_TEMPLATE", "submit-site.yml");

const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
const issueForm = yaml.load(fs.readFileSync(issueFormPath, "utf-8"));

const expectedLabels = ["Site title", "Site URL", "Tags", "Feed URL (optional)", "Description (very optional)", "Notes for maintainers", "Confirmation"];
const actualLabels = (issueForm?.body ?? []).map((field) => field.attributes?.label).filter(Boolean);
const missingLabels = expectedLabels.filter((label) => !actualLabels.includes(label));

if (typeof issueForm?.title !== "string" || issueForm.title.trim() === "") {
	console.error("The issue form must set a default title.");
	process.exit(1);
}

if (!issueForm?.labels?.includes("site-submission")) {
	console.error('The issue form must apply the "site-submission" label.');
	process.exit(1);
}

if (missingLabels.length > 0) {
	console.error(`The issue form is missing expected field(s): ${missingLabels.join(", ")}`);
	process.exit(1);
}

const schemaTags = schema.properties?.tags?.items?.enum;
const tagField = issueForm?.body?.find((field) => field.id === "tags");
const formTags = tagField?.attributes?.options;

if (!Array.isArray(schemaTags) || !Array.isArray(formTags)) {
	console.error("Could not find the tag list in sites.schema.json or the site submission issue form.");
	process.exit(1);
}

if (tagField.type !== "dropdown" || tagField.attributes?.multiple !== true) {
	console.error("The tags field must be a multi-select dropdown.");
	process.exit(1);
}

const schemaSet = new Set(schemaTags);
const formSet = new Set(formTags);
const missingFromForm = schemaTags.filter((tag) => !formSet.has(tag));
const missingFromSchema = formTags.filter((tag) => !schemaSet.has(tag));

if (missingFromForm.length > 0 || missingFromSchema.length > 0) {
	if (missingFromForm.length > 0) {
		console.error(`Tags missing from the issue form: ${missingFromForm.join(", ")}`);
	}
	if (missingFromSchema.length > 0) {
		console.error(`Tags missing from sites.schema.json: ${missingFromSchema.join(", ")}`);
	}
	process.exit(1);
}

if (formTags.length !== schemaTags.length) {
	console.error(`The issue form has ${formTags.length} tags but the schema has ${schemaTags.length}.`);
	process.exit(1);
}

console.log(`The issue form tag list matches all ${schemaTags.length} schema tags.`);

const updateFormPath = path.join(repoRoot, ".github", "ISSUE_TEMPLATE", "update-screenshot.yml");
const updateForm = yaml.load(fs.readFileSync(updateFormPath, "utf-8"));
const expectedUpdateLabels = ["Site URL to update", "Notes for maintainers", "Confirmation"];
const actualUpdateLabels = (updateForm?.body ?? []).map((field) => field.attributes?.label).filter(Boolean);
const missingUpdateLabels = expectedUpdateLabels.filter((label) => !actualUpdateLabels.includes(label));

if (typeof updateForm?.title !== "string" || updateForm.title.trim() === "") {
	console.error("The screenshot update form must set a default title.");
	process.exit(1);
}

if (!updateForm?.labels?.includes("screenshot-update")) {
	console.error('The screenshot update form must apply the "screenshot-update" label.');
	process.exit(1);
}

if (missingUpdateLabels.length > 0) {
	console.error(`The screenshot update form is missing expected field(s): ${missingUpdateLabels.join(", ")}`);
	process.exit(1);
}

console.log("The screenshot update issue form is valid.");

const removalFormPath = path.join(repoRoot, ".github", "ISSUE_TEMPLATE", "remove-site.yml");
const removalForm = yaml.load(fs.readFileSync(removalFormPath, "utf-8"));
const expectedRemovalLabels = ["Site URL to remove", "Reason for removal", "Notes for maintainers", "Confirmation"];
const actualRemovalLabels = (removalForm?.body ?? []).map((field) => field.attributes?.label).filter(Boolean);
const missingRemovalLabels = expectedRemovalLabels.filter((label) => !actualRemovalLabels.includes(label));

if (typeof removalForm?.title !== "string" || removalForm.title.trim() === "") {
	console.error("The site removal form must set a default title.");
	process.exit(1);
}

if (!removalForm?.labels?.includes("site-removal")) {
	console.error('The site removal form must apply the "site-removal" label.');
	process.exit(1);
}

if (missingRemovalLabels.length > 0) {
	console.error(`The site removal form is missing expected field(s): ${missingRemovalLabels.join(", ")}`);
	process.exit(1);
}

const removalReasonField = (removalForm?.body ?? []).find((field) => field.id === "reason-type");
if (
	removalReasonField?.type !== "dropdown" ||
	!Array.isArray(removalReasonField.attributes?.options) ||
	removalReasonField.attributes.options.length < 2
) {
	console.error("The site removal form must include a reason dropdown.");
	process.exit(1);
}

console.log("The site removal issue form is valid.");
