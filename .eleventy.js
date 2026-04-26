import filenamifyUrl from 'filenamify-url';
import rssPlugin from '@11ty/eleventy-plugin-rss';
import shuffle from './filters/shuffle.js';
import { minify } from 'html-minifier-next';

export default (eleventyConfig) => {
  // Pass through
  eleventyConfig.addPassthroughCopy('assets');

  // Collections
  eleventyConfig.addCollection('sites', (collection) => {
    return collection.getFilteredByGlob('sites/*.md');
  });
  eleventyConfig.addCollection('sitesWithFeeds', (collection) => {
    return collection
      .getFilteredByGlob('sites/*.md')
      .filter((item) => item.data.rss);
  });
  eleventyConfig.addCollection('sitesAlphabetized', (collection) => {
    return collection.getFilteredByGlob('sites/*.md');
  });
  // Plugins
  eleventyConfig.addPlugin(rssPlugin);

  // Filters
  eleventyConfig.addFilter('shuffle', shuffle);
  eleventyConfig.addFilter('cleanUrl', (str) => {
	return str.replace(/^https?:\/\/| \/$/gi, '');
  });

  // Minify
  eleventyConfig.addTransform('minify', function (content, outputPath) {
    if (outputPath.indexOf('.html') > -1) {
      let minified = minify(content, {
        useShortDoctype: true,
        removeComments: true,
        collapseWhitespace: true,
        minifyCSS: true,
      });
      return minified;
    }
    return content;
  });

  // Shortcodes
  eleventyConfig.addShortcode(
    'cdnUrl',
    (path) =>
      // Thanks to Andy Bell for this one
      `https://personalsites.b-cdn.net/${filenamifyUrl(path, {
        replacement: '',
      })}.png?width=600`
  );

  // Return config settings
  return {
    markdownTemplateEngine: 'njk',
    passthroughFileCopy: true,
  };
};
