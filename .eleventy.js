const fs = require('fs');
const frontMatter = require('front-matter');
const captureWebsite = require('capture-website');

const shuffle = require('./filters/shuffle.js');
const htmlmin = require('html-minifier');
const rssPlugin = require('@11ty/eleventy-plugin-rss');

const getSites = () => {
  const files = fs.readdirSync('sites').map((file) => {
    return fs.readFileSync(`sites/${file}`, 'utf-8');
  });
  const urls = files
    .map((file) => {
      const parsedFile = frontMatter(file);
      const { title, url } = parsedFile.attributes;
      return { title, url };
    })
    .filter((site) => {
      const { title, url } = site;
      if (title == undefined || url == undefined) return false;
      return true;
    });
  return urls;
};

module.exports = (eleventyConfig) => {
  // const urls = getScreenshots().then((val) => {
  //   console.log(val);
  // });
  const dir = `_site/assets/screenshots`;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  const sites = getSites();
  (async () => {
    await Promise.all(
      sites
        .filter((site) => {
          if (fs.existsSync(`${dir}/${title}.png`)) return false;
          return true;
        })
        .map(({ title, url }) => {
          return captureWebsite.file(url, `${dir}/${title}.png`, {
            width: 1440,
            height: 900,
          });
        })
    );
  })();
  // sites.forEach((site) => {
  //   captureWebsite.file(
  //     site.url,
  //     `_site/assets/screenshots/${site.title}.png`,
  //     {
  //       width: 600,
  //       height: 375,
  //     }
  //   );
  // });
  // sites.forEach(async (site) => {
  //   await captureWebsite.file(site.url, `screenshots/${site.title}.png`, {
  //     width: 600,
  //     height: 375,
  //   });
  // });
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
