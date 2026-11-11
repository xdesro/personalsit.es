import fs from 'node:fs';
import path from 'node:path';
import {
  S3Client,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

const artifactDir = path.resolve(
  process.env.SCREENSHOT_ARTIFACT_DIR || 'screenshots'
);
const manifestPath = path.join(artifactDir, 'manifest.json');
const bucket = process.env.S3_BUCKET;
const region = process.env.S3_REGION || 'us-east-2';
const maxBytes = 20 * 1024 * 1024;
const pngSignature = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

if (!bucket) throw new Error('S3_BUCKET is required');
if (!process.env.S3_USER_ACCESS_KEY || !process.env.S3_USER_ACCESS_KEY_SECRET) {
  throw new Error('S3 credentials are required');
}
if (!fs.existsSync(manifestPath)) {
  throw new Error(`Screenshot manifest not found at ${manifestPath}`);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
if (!Array.isArray(manifest.screenshots)) {
  throw new Error('Screenshot manifest does not contain a screenshots array');
}
if (manifest.screenshots.length > 50) {
  throw new Error(
    `Refusing to upload ${manifest.screenshots.length} screenshots in one run`
  );
}

const s3 = new S3Client({
  region,
  credentials: {
    accessKeyId: process.env.S3_USER_ACCESS_KEY,
    secretAccessKey: process.env.S3_USER_ACCESS_KEY_SECRET,
  },
});

async function exists(filename) {
  try {
    await s3.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: filename,
      })
    );
    console.log(`${filename} already exists on S3`);
    return true;
  } catch (error) {
    if (
      error.name === 'NotFound' ||
      error.$metadata?.httpStatusCode === 404
    ) {
      return false;
    }
    throw error;
  }
}

async function main() {
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  const seen = new Set();

  for (const entry of manifest.screenshots) {
    const filename = String(entry?.filename ?? '');

    try {
      if (
        !/^[a-z0-9][a-z0-9._-]*\.png$/i.test(filename) ||
        filename.includes('..')
      ) {
        throw new Error(`Unsafe screenshot filename: ${filename}`);
      }
      if (seen.has(filename)) {
        skipped++;
        continue;
      }
      seen.add(filename);

      const filePath = path.resolve(artifactDir, filename);
      if (!filePath.startsWith(`${artifactDir}${path.sep}`)) {
        throw new Error(`Refusing to read a file outside ${artifactDir}`);
      }

      const stat = fs.lstatSync(filePath);
      if (!stat.isFile()) {
        throw new Error(`Refusing to read a non-regular file: ${filename}`);
      }
      if (stat.size > maxBytes) {
        throw new Error(`Screenshot is too large: ${filename}`);
      }

      const body = fs.readFileSync(filePath);
      if (!body.subarray(0, pngSignature.length).equals(pngSignature)) {
        throw new Error(`Screenshot is not a PNG: ${filename}`);
      }

      if (await exists(filename)) {
        skipped++;
        continue;
      }

      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: filename,
          Body: body,
          ContentType: 'image/png',
        })
      );
      uploaded++;
      console.log(`✨ Uploaded ${filename}`);
    } catch (error) {
      failed++;
      console.error(`Failed to upload ${filename}: ${error.message}`);
    }
  }

  if (manifest.failures?.length > 0) {
    console.warn(
      `Capture failed for ${manifest.failures.length} site(s): ${manifest.failures
        .map((failure) => failure.url)
        .join(', ')}`
    );
  }

  console.log(`
=====
Screenshot upload complete.
✨ Uploaded: ${uploaded}
⏭️ Skipped: ${skipped}
💥 Failed: ${failed}
=====`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `Uploaded ${uploaded} screenshot(s); skipped ${skipped}; failed ${failed}.\n`
    );
  }

  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
