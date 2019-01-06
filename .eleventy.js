const shuffle = require('./filters/shuffle.js');
const htmlmin = require('html-minifier');
const rssPlugin = require('@11ty/eleventy-plugin-rss');

module.exports = function(eleventyConfig) {
    // Pass through
    eleventyConfig.addPassthroughCopy('assets');

    // Collections
    eleventyConfig.addCollection('sites', collection => {
      return collection.getFilteredByGlob('sites/*.md');
    });

    // Plugins
    eleventyConfig.addPlugin(rssPlugin);

    // Filters
    eleventyConfig.addFilter('shuffle', shuffle);

    // Minify
    eleventyConfig.addTransform('htmlmin', function(content, outputPath) {
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
