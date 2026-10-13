import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import yaml from 'js-yaml';

const schemaPath = fileURLToPath(new URL('./sites.schema.json', import.meta.url));
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));

const ajv = new Ajv({ allErrors: true, verbose: true });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

export function formatValidationError(error) {
  if (error.keyword === 'additionalProperties') {
    return `unknown field "${error.params.additionalProperty}"`;
  }
  if (error.keyword === 'enum') {
    return `"${error.data}" is not an allowed tag`;
  }
  return `${error.instancePath || '/'} ${error.message}`;
}

export function validateSiteData(data) {
  return validateSchema(data) ? [] : (validateSchema.errors ?? []);
}

export function loadSiteFile(filePath) {
  let data;
  try {
    data = yaml.load(fs.readFileSync(filePath, 'utf-8'));
  } catch (error) {
    throw new Error(`${filePath}: ${error.message}`);
  }
  const errors = validateSiteData(data);
  if (errors.length > 0) {
    const details = errors.map((error) => `  - ${formatValidationError(error)}`).join('\n');
    throw new Error(`${filePath}: invalid site entry\n${details}`);
  }
  return data;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const dir = 'sites';
  const files = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.yaml'))
    .sort();
  let failed = 0;

  for (const file of files) {
    try {
      loadSiteFile(path.join(dir, file));
    } catch (error) {
      failed++;
      console.error(`\n${error.message}`);
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} of ${files.length} site entries are invalid.`);
    process.exit(1);
  }

  console.log(`All ${files.length} site entries are valid.`);
}
