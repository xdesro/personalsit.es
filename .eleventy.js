const shuffle = require('./filters/shuffle.js');
const htmlmin = require('html-minifier');
const rssPlugin = require('@11ty/eleventy-plugin-rss');

module.exports = function(eleventyConfig) {
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
