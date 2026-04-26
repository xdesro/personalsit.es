import fs from 'node:fs';
import https from 'node:https';
import { v2 as cloudinary } from 'cloudinary';
import frontMatter from 'front-matter';
import captureWebsite from 'capture-website';
import filenamifyUrl from 'filenamify-url';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
const failedSites = [];

const getSites = () => {
  const files = fs.readdirSync('sites').map((file) => {
    return fs.readFileSync(`sites/${file}`, 'utf-8');
  });
  const urls = files
    .map((file) => {
      const parsedFile = frontMatter(file);
      const { url } = parsedFile.attributes;
      return { title: filenamifyUrl(url, { replacement: '' }), url };
    })
    .filter((site) => {
      const { title, url } = site;
      if (title == undefined || url == undefined) return false;
      return true;
    });
  return urls;
};

const getScreenshot = async (site) => {
  //  TODO — Check if screenshot exists in Cloudinary space before running Puppeteer
  //  TODO — Statically render URLs in template files
  const doesntExist = await new Promise((resolve) => {
    https.get(cloudinary.url(site.title), (response) => {
      if (response.statusCode !== 404) {
        console.log(`${site.title} exists on cloudinary.`);
      } else {
        console.log(`${site.title} DOES NOT exist on cloudinary.`);
      }

      resolve(response.statusCode === 404);
    });
  });
  if (doesntExist) {
    try {
      const screenshot = await captureWebsite.buffer(site.url, { timeout: 5 });
      cloudinary.uploader
        .upload_stream({ resource_type: 'image', public_id: site.title })
        .end(screenshot);
    } catch (error) {
      console.warn(site.title, error);
      failedSites.push(site.title);
    }
  }
};
const sites = getSites();
for (const site of sites) {
  await getScreenshot(site);
}

console.log(`
=====
Screenshot collection complete.

${failedSites.length > 0 ? `Failed sites:\n${failedSites.join('\n')}. May need to capture manually.` : 'All sites captured successfully!'}
=====`);
