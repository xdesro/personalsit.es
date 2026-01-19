const fs = require('fs');
const AWS = require('aws-sdk');
const frontMatter = require('front-matter');
const filenamifyUrl = require('filenamify-url');

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const S3_BUCKET = process.env.S3_BUCKET;
const S3_REGION = process.env.AWS_REGION || 'us-east-1';

function getS3Url(filename) {
  return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${filename}`;
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

function checkIfExists(site) {
  return new Promise((resolve) => {
    s3.headObject(
      {
        Bucket: S3_BUCKET,
        Key: `${site.title}.png`,
      },
      (err) => {
        if (err?.code === 'NotFound') {
          console.log(`${site.title} does not exist on S3`);
          resolve(true);
        } else if (err) {
          console.error(`Error checking S3: ${err.message}`);
          resolve(true);
        } else {
          console.log(`${site.title} exists on S3`);
          resolve(false);
        }
      }
    );
  });
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

    await s3
      .upload({
        Bucket: S3_BUCKET,
        Key: filename,
        Body: screenshot,
        ContentType: 'image/png',
      })
      .promise();

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
