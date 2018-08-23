// From: https://github.com/Daplie/knuth-shuffle/blob/master/index.js
module.exports = function shuffle(items) {
    var currentIndex = items.length,
        temporaryValue,
        randomIndex;

    // While there remain elements to shuffle...
    while (0 !== currentIndex) {
        // Pick a remaining element...
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;

        // And swap it with the current element.
        temporaryValue = items[currentIndex];
        items[currentIndex] = items[randomIndex];
        items[randomIndex] = temporaryValue;
    }

    return items;
};
