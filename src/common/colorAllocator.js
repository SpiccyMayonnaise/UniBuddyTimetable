angular.module('colorAllocator', [])
    .constant('topicColors', [
        '#ff2400',
        '#92e84c',
        '#3471d5',
        '#bd38ff',
    ])
    .factory('colorAllocator', function (topicColors) {
        var recentlyAssigned = [];

        var assignments = {};

        return function assignColor (topicHash) {
            if (assignments[topicHash] !== undefined) {
                return assignments[topicHash];
            }

            var colorId = topicHash % topicColors.length;

            if (recentlyAssigned.length == topicColors.length) {
                colorId = recentlyAssigned.shift();
            }
            else while (recentlyAssigned.indexOf(colorId) !== -1) {
                colorId = Math.floor(Math.random() * topicColors.length);
            }

            assignments[topicHash] = colorId;
            recentlyAssigned.push(colorId);
            return colorId;
        };
    })

    .factory('getAllocatedColor', function (colorAllocator, topicColors) {
        return function(topicHash) {
            return topicColors[colorAllocator(topicHash)];
        };
    })
;

