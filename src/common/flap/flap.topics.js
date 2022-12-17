angular.module( 'flap.topics', [
        'flap.objectUtils',
        'flap.stringUtils'
    ])
    .constant('apiPath', "http://localhost:3000/api/v2/")

    .factory('institutionFactory', function(apiPath, $http, camelCaseService) {
        var institutionFactory = {};

        institutionFactory.getInstitutionsAsync = function (callback) {
            var url = apiPath + 'uni.json';

            $http.get(url).then(function(response) {
                institutions = camelCaseService.camelCaseObject(response.data.data);
                callback(institutions);
            });
        };

        return institutionFactory;
    })

    .factory('termDatesFactory', function(apiPath, $http, camelCaseService) {
        let termDatesFactory = {};

        termDatesFactory.getTermDatesAsync = function(query, callback) {
            const url = apiPath + 'uni/' + query.instCode + '/dates/' + query.year + '.json';

            $http.get(url).then(response => {
                termDates = camelCaseService.camelCaseObject(response.data.data);
                callback(termDates);
            });
        };

        return termDatesFactory;
    })

    .factory('topicFactory', function (apiPath, $http, camelCaseService, topicService) {
        var baseTopic = {
            getSerial: function () {
                var serial = this.id;

                var firstClass = true;

                angular.forEach(this.classes, function (classType) {
                    if (typeof(classType.activeClassGroup) === "undefined") {
                    }
                    else if (classType.classGroups.length <= 1) {
                    }
                    else {
                        serial += firstClass ? "(" : "_";
                        serial += classType.id + '.' + classType.activeClassGroup.groupId;

                        firstClass = false;
                    }
                });

                if (!firstClass) {
                    serial += ")";
                }

                return serial;
            },

            timetableLoaded: false,

            getHash: function () {
                return this.id ^ 47;
            }
        };

        var topicFactory = {};

        topicFactory.getTopicsAsync = function (query, callback) {
            var url = apiPath + 'uni/' + query.instCode + '/topics.json' + "?";

            if (typeof query.instCode !== "undefined" && query.year !== "Any") {
                url += "&inst_code=" + query.instCode;
            }
            if (typeof query.year !== "undefined" && query.year !== "Any") {
                url += "&year=" + query.year;
            }
            if (typeof query.semester !== "undefined" && query.semester !== "Any") {
                url += "&semester=" + query.semester;
            }
            if (typeof query.subjectArea !== "undefined" && query.subjectArea !== "Any") {
                url += "&subject_area=" + query.subjectArea;
            }
            if (typeof query.topicNumber !== "undefined" && query.topicNumber !== "Any") {
                url += "&topic_number=" + query.topicNumber;
            }

            $http.get(url).then(function (response, status, headers, config) {
                topics = response.data.data;

                camelCaseService.camelCaseObject(topics);

                topicService.sortTopics(topics);

                angular.forEach(topics, function (topic) {
                    angular.extend(topic, baseTopic);
                });

                topics.forEach(topic => {
                    topic.classes.forEach(classType => {
                        classType.classGroups.forEach(classGroup => {
                            classGroup.activities.forEach(activity => {
                                activity.intervals = [{firstDay: activity.firstDay, lastDay: activity.lastDay}];
                            });
                        });
                    });
                });

                callback(topics, status, headers, config);
            });
        };

        topicFactory.getTopicAsync = function (topicId, callback) {
            var url = apiPath + 'topics/' + topicId + '.json';

            $http.get(url).then(function (response, status, headers, config) {
                topic = response.data.data;

                camelCaseService.camelCaseObject(topic);

                topic.classes.forEach(classType => {
                    classType.classGroups.forEach(classGroup => {
                        classGroup.activities.forEach(activity => {
                            activity.intervals = [{firstDay: activity.firstDay, lastDay: activity.lastDay}];
                        });
                    });
                });

                callback(topic, status, headers, config);
            });
        };

        topicFactory.createTopicFromId = function (serial) {
            var syntax = /^([0-9]+)/;

            var topicIdentifier = syntax.exec(serial);

            if (!topicIdentifier) {
                return false;
            }

            var topic = {
                id: topicIdentifier[1]
            };

            return topic;
        };

        topicFactory.loadTopicFromSerialAsync = function (topicSerial, callback) {
            var topic = topicFactory.createTopicFromId(topicSerial);

            if (!topic) {
                return false;
            }

            // TODO: Improve the following method (parse string with regex)
            var parens = /\((.*)\)/;

            var bracketSets = parens.exec(topicSerial);

            var hasActivities = (bracketSets !== null);

            var classSelections = {};

            if (hasActivities) {
                var getClassesRegex = /([(0-9]+)\.([0-9]+)-?/g;

                while (classSelection = getClassesRegex.exec(bracketSets[1])) {
                    classSelections[classSelection[1]] = classSelection[2];
                }
            }

            angular.extend(topic, baseTopic);

            topicFactory.loadTimetableForTopicAsync(topic, function (topic, status, headers, config) {
                if (hasActivities) {
                    angular.forEach(topic.classes, function (classType) {
                        var id = classType.id;

                        if (typeof classSelections[id] !== "undefined") {
                            angular.forEach(classType.classGroups, function(group) {
                                if (group.groupId == classSelections[id]) {
                                    classType.activeClassGroup = group;
                                }
                            });
                        }

                    });
                }

                topic.classes.forEach(classType => {
                    classType.classGroups.forEach(classGroup => {
                        classGroup.activities.forEach(activity => {
                            activity.intervals = [{firstDay: activity.firstDay, lastDay: activity.lastDay}];
                        });
                    });
                });

                callback(topic, status, headers, config);
            });

            return topic;
        };

        topicFactory.loadTimetableForTopicAsync = function (topic, callback) {
            topicFactory.getTopicAsync(topic.id, function (remoteTopicEntry, status, headers, config) {
                angular.extend(topic, remoteTopicEntry);
                topic.timetableLoaded = true;

                angular.forEach(topic.classes, function (classType) {
                    if (classType.classGroups.length > 0) {
                        classType.classGroups.sort(function (a, b) {
                            return a.groupId - b.groupId;
                        });

                        if (typeof classType.activeClassGroup === "undefined") {
                            classType.activeClassGroup = classType.classGroups[0];
                        }
                    }
                });

                callback(topic, status, headers, config);
            });
        };


        return topicFactory;
    })
    .factory('sessionsService', function (dayService) {
        var sessionsService = {};

        sessionsService.compareSessions = function (a, b) {
            // Sort by day
            var daysDifference = dayService.compareDays(a.dayOfWeek, b.dayOfWeek);
            if (daysDifference !== 0) {
                return daysDifference;
            }

            // Sort by starting time of day
            var secondsStartsDifference = a.secondsStartsAt - b.secondsStartsAt;
            if (secondsStartsDifference !== 0) {
                return secondsStartsDifference;
            }


            return a.secondsEndsAt - b.secondsEndsAt;
        };

        sessionsService.sortSessions = function (sessions) {
            return sessions.sort(sessionsService.compareSessions);
        };

        return sessionsService;
    })

    .factory('topicService', function () {
        var that = {};

        that.listClassTypesForTopics = function (topics) {
            var classTypes = [];

            angular.forEach(topics, function (topic) {
                var classes = topic.classes;
                if (classes) {
                    classTypes = classTypes.concat(classes);
                }
            });

            return classTypes;
        };

        that.listClassGroupsForTopics = function (topics) {
            var classTypes = that.listClassTypesForTopics(topics);

            var classGroups = [];

            angular.forEach(classTypes, function (classType) {
                if (classType.classGroups) {
                    classGroups = classGroups.concat(classType.classGroups);
                }
            });

            return classGroups;
        };

        function compareTopics(a, b) {
            var codeDifference = a.code.localeCompare(b.code);
            if (codeDifference !== 0) {
                return codeDifference;
            }

            return a.name.localeCompare(b.name);
        }

        that.sortTopics = function (topics) {
            return topics.sort(compareTopics);
        };

        return that;
    })

;