import filenamifyUrl from 'filenamify-url';
import rssPlugin from '@11ty/eleventy-plugin-rss';
import shuffle from './filters/shuffle.js';
import { minify } from 'html-minifier-next';
import { loadSiteFile } from './validateSites.js';

export default (eleventyConfig) => {
  // Pass through
  eleventyConfig.addPassthroughCopy('assets');

  // Site entries are plain YAML files, validated against sites.schema.json
  eleventyConfig.addTemplateFormats('yaml');
  eleventyConfig.addExtension('yaml', {
    outputFileExtension: 'html',
    getData: (inputPath) => loadSiteFile(inputPath),
    compile: () => () => '',
  });

  // Collections
  eleventyConfig.addCollection('sites', (collection) => {
    return collection.getFilteredByGlob('sites/*.yaml');
  });
  eleventyConfig.addCollection('sitesWithFeeds', (collection) => {
    return collection
      .getFilteredByGlob('sites/*.yaml')
      .filter((item) => item.data.feed);
  });
  eleventyConfig.addCollection('sitesAlphabetized', (collection) => {
    return collection.getFilteredByGlob('sites/*.yaml');
  });
  eleventyConfig.addCollection('allTags', (collection) => {
    const counts = new Map();
    collection.getFilteredByGlob('sites/*.yaml').forEach((item) => {
      (item.data.tags || []).forEach((tag) => {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      });
    });
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
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
