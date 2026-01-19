const fs = require('fs');
const {
  S3Client,
  HeadObjectCommand,
  PutObjectCommand,
} = require('@aws-sdk/client-s3');
const frontMatter = require('front-matter');
const filenamifyUrl = require('filenamify-url');

const s3Client = new S3Client({
  region: process.env.S3_REGION || 'us-east-2',
  credentials: {
    accessKeyId: process.env.S3_USER_ACCESS_KEY,
    secretAccessKey: process.env.S3_USER_ACCESS_KEY_SECRET,
  },
});

function getS3Url(filename) {
  return `https://${process.env.S3_BUCKET}.s3.${process.env.S3_REGION}.amazonaws.com/${filename}`;
}

function getChangedSites() {
  const changedFiles = process.env.CHANGED_FILES?.split(' ') || [];
  return changedFiles
    .filter((file) => file.endsWith('.md'))
    .map((file) => {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const parsed = frontMatter(content);
        const { url } = parsed.attributes;
        if (!url) {
          console.warn(`No URL found in ${file}`);
          return null;
        }
        return {
          title: filenamifyUrl(url, { replacement: '' }),
          url,
          file,
        };
      } catch (error) {
        console.error(`Error reading ${file}: ${error.message}`);
        return null;
      }
    })
    .filter((site) => site !== null && site.title && site.url);
}

async function checkIfExists(site) {
  try {
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: 'personalsit.es',
        Key: `${site.title}.png`,
      })
    );
    console.log(`${site.title} exists on S3`);
    return false;
  } catch (error) {
    if (error.name === 'NotFound') {
      console.log(`${site.title} does not exist on S3`);
      return true;
    } else {
      console.error(`Error checking S3: ${error.message}`);
      return true;
    }
  }
}

async function getScreenshot(site, results) {
  const doesntExist = await checkIfExists(site);
  if (!doesntExist) {
    results.successful.push(`${site.title} (already on CDN)`);
    return;
  }
  try {
    const { default: captureWebsite } = await import('capture-website');
    console.log(`Capturing screenshot for ${site.url}...`);
    const screenshot = await captureWebsite.buffer(site.url, {
      timeout: 30,
      launchOptions: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    });
    const filename = `${site.title}.png`;
    await s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: filename,
        Body: screenshot,
        ContentType: 'image/png',
      })
    );
    const s3Url = getS3Url(filename);
    console.log(
      `✨ — Screenshot taken for ${site.title}\n    Production URL is ${s3Url}`
    );
    results.successful.push(site.title);
  } catch (error) {
    console.log(
      `🤯 — Oh god, screenshot FAILED for ${site.title}.\n    They're saying ${error.message}`
    );
    results.failed.push(site.title);
  }
}

(async function main() {
  try {
    const sites = getChangedSites();
    if (sites.length === 0) {
      console.log('No new sites to screenshot boys.');
      return;
    }
    console.log(
      `🚧 Watch out fellas, papa's screenshotting ${sites.length} site(s)...`
    );
    const results = {
      successful: [],
      failed: [],
    };
    for (const site of sites) {
      await getScreenshot(site, results);
    }
    console.log(`
=====
Screenshotting for this PR is complete.
✨ Successful: ${results.successful.length}
💥 Failed: ${results.failed.length}
${
  results.failed.length > 0
    ? `\nFailed sites:\n${results.failed.join('\n')}`
    : ''
}
=====`);
    process.exit(results.failed.length > 0 ? 1 : 0);
  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
})();
