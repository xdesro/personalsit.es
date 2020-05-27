const fs = require('fs');
const http = require('http');
const cloudinary = require('cloudinary').v2;
const frontMatter = require('front-matter');
const captureWebsite = require('capture-website');
const filenamifyUrl = require('filenamify-url');

const rssPlugin = require('@11ty/eleventy-plugin-rss');
const lazyImagesPlugin = require('eleventy-plugin-lazyimages');

const shuffle = require('./filters/shuffle.js');
const htmlmin = require('html-minifier');

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

cloudinary.config({
  cloud_name: 'personalsites',
  api_key: '267283442759537',
  api_secret: 'jmyJewlQeGwVPzFGTUXs64uILeE',
});

const getScreenshot = async (site) => {
  //  TODO — Check if screenshot exists in Cloudinary space before running Puppeteer
  //  TODO — Statically render URLs in template files
  const doesntExist = await new Promise((resolve, reject) => {
    http.get(cloudinary.url(site.title), (response) => {
      resolve(response.statusCode === 404);
    });
  });
  if (doesntExist) {
    try {
      const screenshot = await captureWebsite.buffer(site.url, { timeout: 15 });
      cloudinary.uploader
        .upload_stream({ resource_type: 'image', public_id: site.title })
        .end(screenshot);
    } catch (error) {
      console.log(site.title, error);
    }
  }
};

module.exports = (eleventyConfig) => {
  const sites = getSites();
  (async () => {
    for (const site of sites) {
      await getScreenshot(site);
    }
  })();

  // Pass through
  eleventyConfig.addPassthroughCopy('assets');

  // Collections
  eleventyConfig.addCollection('sites', (collection) => {
    return collection.getFilteredByGlob('sites/*.md');
  });

  // Plugins
  eleventyConfig.addPlugin(rssPlugin);

  // Filters
  eleventyConfig.addFilter('shuffle', shuffle);

  // Minify
  eleventyConfig.addTransform('htmlmin', function (content, outputPath) {
    if (outputPath.indexOf('.html') > -1) {
      let minified = htmlmin.minify(content, {
        useShortDoctype: true,
        removeComments: true,
        collapseWhitespace: true,
        minifyCSS: true,
      });
      return minified;
    }
    return content;
  });

  // Return config settings
  return {
    markdownTemplateEngine: 'njk',
    passthroughFileCopy: true,
  };
};
