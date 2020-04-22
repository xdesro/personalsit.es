const fs = require('fs');
const frontMatter = require('front-matter');
const xmlParser = require('xml2js');
const captureWebsite = require('capture-website');

exports.handler = (event, context, callback) => {
  fs.readFile('_site/feed/all.xml', 'utf8', (err, files) => {
    if (err) return console.error(err);

    let parsedEntries = {};
    xmlParser.parseString(files, (error, result) => {
      const entries = result.feed.entry;
      entries.forEach((entry) => {
        const { title } = entry;
        const link = entry.link[0]['$']['href'];
        parsedEntries[title] = link;
      });
      console.log(parsedEntries);
      callback(null, { statusCode: 200, body: 'Hello, World' });
    });
    // files.forEach((file) => {
    //   console.log(file);
    //   //   console.log(frontMatter(file));
    // });
  });
};
