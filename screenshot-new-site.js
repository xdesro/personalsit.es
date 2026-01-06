const fs = require('fs');
const https = require('https');
const cloudinary = require('cloudinary').v2;
const frontMatter = require('front-matter');
const captureWebsite = require('capture-website');
const filenamifyUrl = require('filenamify-url');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const failedSites = [];
const successfulSites = [];

// Get only the changed files from the PR
const getChangedSites = () => {
  const changedFiles = process.env.CHANGED_FILES?.split(' ') || [];

  console.log('Changed files:', changedFiles);

  const urls = changedFiles
    .filter((file) => file.endsWith('.md'))
    .map((file) => {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const parsedFile = frontMatter(content);
        const { url } = parsedFile.attributes;

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
        console.error(`Error reading ${file}:`, error.message);
        return null;
      }
    })
    .filter((site) => site !== null && site.title && site.url);

  return urls;
};

const checkIfExists = (site) => {
  return new Promise((resolve) => {
    https
      .get(cloudinary.url(site.title), (response) => {
        if (response.statusCode !== 404) {
          console.log(`${site.title} exists on cloudinary.`);
        } else {
          console.log(`${site.title} DOES NOT exist on cloudinary.`);
        }
        resolve(response.statusCode === 404);
      })
      .on('error', (err) => {
        console.error(`Error checking Cloudinary: ${err.message}`);
        resolve(true); // Assume doesn't exist if check fails
      });
  });
};

const getScreenshot = async (site) => {
  const doesntExist = await checkIfExists(site);

  if (doesntExist) {
    try {
      console.log(`Capturing screenshot for ${site.url}...`);
      const screenshot = await captureWebsite.buffer(site.url, {
        timeout: 30,
        launchOptions: {
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
      });

      await new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            { resource_type: 'image', public_id: site.title },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          )
          .end(screenshot);
      });

      console.log(`✅ Successfully captured: ${site.title}`);
      successfulSites.push(site.title);
    } catch (error) {
      console.warn(`❌ Failed to capture ${site.title}:`, error.message);
      failedSites.push(site.title);
    }
  } else {
    successfulSites.push(`${site.title} (already exists)`);
  }
};

(async () => {
  try {
    const sites = getChangedSites();

    if (sites.length === 0) {
      console.log('No sites to process from changed files.');
      fs.writeFileSync(
        'screenshot-results.json',
        JSON.stringify({
          success: [],
          failed: [],
          message: 'No sites found in changed markdown files',
        })
      );
      return;
    }

    console.log(`Processing ${sites.length} site(s)...`);

    for (const site of sites) {
      await getScreenshot(site);
    }

    const results = {
      success: successfulSites,
      failed: failedSites,
    };

    fs.writeFileSync(
      'screenshot-results.json',
      JSON.stringify(results, null, 2)
    );

    console.log(`
=====
Screenshots collection complete.
Successful: ${successfulSites.length}
Failed: ${failedSites.length}
${failedSites.length > 0 ? `\nFailed sites:\n${failedSites.join('\n')}` : ''}
=====`);

    // Exit with error code if any failed
    process.exit(failedSites.length > 0 ? 1 : 0);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
})();
