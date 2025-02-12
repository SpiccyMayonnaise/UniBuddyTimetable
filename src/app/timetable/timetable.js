angular.module('unibuddyTimetable.timetable', [
        // 'ui.state',
        'ui.router',
        'ui.sortable',
        'flap.topics',
        'arrayMath',
        'colorAllocator',
        'unibuddyTimetable.config',
        'unibuddyTimetable.exporter',
        'unibuddyTimetable.generator',
        'gapi',
        'stopwatch'
    ])

    .config(function config($stateProvider) {
        $stateProvider.state('home', {
            url: '/',
            views: {
                "main": {
                    controller: 'TimetableCtrl',
                    templateUrl: 'timetable/timetable.tpl.html'
                }
            },
            data: { pageTitle: 'UniBuddy University Timetable Planner' }
        });
    })

    .controller('TimetableCtrl', function TimetableController($scope, $location, chosenTopicService, urlService, topicFactory) {

        $scope.$on('chosenClassesUpdate', function () {
            urlService.setTopics(chosenTopicService.getTopics());
        });

        function loadFromUrl() {
            var newTopicSerials = urlService.getTopics();
            var oldTopics = chosenTopicService.getTopics();

            var topicsToRemove = [];

            angular.forEach(oldTopics, function (oldTopic) {
                var index = newTopicSerials.indexOf(oldTopic.getSerial());

                if (index === -1) {
                    // The old topic should be removed.
                    topicsToRemove.push(oldTopic);
                }
                else {
                    // It isn't actually a new topic! Don't add it later.
                    newTopicSerials.splice(index, 1);
                }
            });

            angular.forEach(topicsToRemove, function (topic) {
                chosenTopicService.removeTopic(topic, false);
            });


            // Don't try to broadcast while we're still asyncronously loading topics.
            var topicsToLoad = newTopicSerials.length;
            var broadcastUpdateWhenReady = function () {
                if (topicsToLoad === 0) {
                    chosenTopicService.broadcastTopicsUpdate();
                }
            };

            // Load all of the new topics
            angular.forEach(newTopicSerials, function (topicSerial) {
                topicFactory.loadTopicFromSerialAsync(topicSerial, function (topic) {
                    topicsToLoad--;

                    chosenTopicService.addTopic(topic, false);
                    broadcastUpdateWhenReady();
                });
            });

            broadcastUpdateWhenReady();
        }

        // $scope.$watch(function () {
        //     return $location.search();
        // }, function () {
        //     loadFromUrl();
        // });


        loadFromUrl();
    })


    .filter('paginate', function paginate() {
        return function (input, pageIndex, itemsPerPage) {
            if (typeof input === "undefined") {
                return input;
            }

            return input.slice(pageIndex * itemsPerPage, (pageIndex + 1) * itemsPerPage);
        };
    })

    .filter('secondsToTime', function secondsToTimeFilter(moment) {
        return function secondsToTime(number) {
            return moment.unix(number).utc().format('h:mm a');
        };
    })

    .filter('formatDateTime', function formatDateTimeFilter(moment) {
        return function formatDateTime(date) {
            return moment(date, "YYYY-MM-DD h a").format("h A on MMM Do YYYY");
        };
    })

    .filter('inAWeek', function inAWeekFilter(moment) {
        return function inAWeek(date) {
            return moment(date, "YYYY-MM-DD h a").add('days', 7).format("YYYY-MM-DD h a");
        };
    })

    .filter('timeDistance', function timeDistanceFilter(moment) {
        return function timeDistance(date) {
            return moment(date, "YYYY-MM-DD h a").fromNow();
        };
    })

    .filter('secondsToHours', function (moment) {
        return function (number) {
            var duration = moment.duration(number * 1000);

            var hours = "" + Math.floor(duration.asHours());
            var minutes = "" + Math.floor(duration.asMinutes() % 60);

            if (minutes === "0") {
                minutes = "00";
            }

            return hours + ":" + minutes + " hour" + (hours !== '1' ? 's' : '');
        };
    })

    .factory('moment', function () {
        // moment is defined in the global namespace
        return moment;
    })

    .factory('urlService', function ($location) {
        var defaultState = {
            topics: ""
        };

        var state = {};

        var urlService = {};

        var get = function get(key) {
            if ($location.search().hasOwnProperty(key)) {
                return $location.search()[key];
            }
            if (defaultState.hasOwnProperty(key)) {
                return defaultState[key];
            }

            return undefined;
        };

        var set = function set (key, value) {
            var state = $location.search();

            state[key] = value;

            // Don't bother storing the default state in the URL
            if (defaultState[key] === value) {
                delete(state[key]);
            }

            $location.search(state);
        };


        urlService.setTopics = function setTopics(topics) {
            var topicIdentifiers = [];
            angular.forEach(topics, function (topic) {
                topicIdentifiers.push(topic.getSerial());
            });

            set('topics', topicIdentifiers.join('_'));
        };

        urlService.getTopics = function getTopics() {
            var topicsString = get('topics');

            if (topicsString === "") {
                return [];
            }

            var serialFormat = /([0-9])+(\([0-9\._]+\))?_?/g;
            var topics = [];
            var match;

            do {
                match = serialFormat.exec(topicsString);
                if (match) {
                    topics.push(match[0]);
                }
            } while (match);

            return topics;
        };

        return urlService;
    })

    .factory('displayableTimetableFactory', function (dayService, clashService, sessionsService, clashGroupFactory, duplicateBookingsService) {
        var displayableTimetableFactory = {};

        displayableTimetableFactory.createEmptyTimetable = function () {
            var timetable = {};

            angular.forEach(dayService.days(), function (day) {
                timetable[day] = [];
            });

            return timetable;
        };


        displayableTimetableFactory.createTimetableForBookings = function (bookings) {
            var timetable = displayableTimetableFactory.createEmptyTimetable();

            //create timetable stuff
            bookings = sessionsService.sortSessions(bookings.slice(0));

            // Remove duplicate bookings where the only difference between the two bookings is the room they're in
            bookings = duplicateBookingsService.removeDuplicateLookingBookings(bookings);

            angular.forEach(bookings, function (booking) {
                var day = booking.dayOfWeek;

                var clashGroups = timetable[day];
                var clashGroup = clashGroups[clashGroups.length - 1];

                if (clashGroup === undefined || clashService.sessionsClash(clashGroup, booking) === 0) {
                    clashGroup = clashGroupFactory.newClashGroup(booking);
                    timetable[day].push(clashGroup);
                }
                else {
                    clashGroup.addBooking(booking);
                }
            });

            return timetable;
        };

        return displayableTimetableFactory;
    })

    .factory('bookingFactory', function () {
        var that = {};

        that.newBooking = function (topic, classType, classGroup, activity) {
            var booking = {};

            booking.topicHash = topic.getHash();
            booking.topicCode = topic.code;
            booking.className = classType.name;
            booking.dayOfWeek = activity.dayOfWeek;
            booking.secondsStartsAt = activity.secondsStartsAt;
            booking.secondsEndsAt = activity.secondsEndsAt;
            booking.secondsDuration = activity.secondsDuration;
            booking.room = activity.room;
            booking.locked = classType.classGroups.length == 1;

            // Fuck
            booking.intervals = activity.intervals;

            return booking;
        };

        var findTopicForClassType = function (topics, selectedClassType) {
            var foundTopic;

            angular.forEach(topics, function (topic) {
                angular.forEach(topic.classes, function (classType) {
                    if (classType.$$hashKey == selectedClassType.$$hashKey) {
                        foundTopic = topic;
                        return false;
                    }
                });

                if (foundTopic !== undefined) {
                    return false;
                }
            });

            return foundTopic;
        };

        that.createBookingsForTopics = function (topics, classSelections) {
            var bookings = [];

            angular.forEach(classSelections, function (selection) {
                angular.forEach(selection.classGroup.activities, function (activity) {
                    var topic = findTopicForClassType(topics, selection.classType);
                    bookings.push(that.newBooking(topic, selection.classType, selection.classGroup, activity));
                });
            });

            // TODO: Remove all of the following when the current timetable is stored in a classSelection object (instead just return bookings)
            if (bookings.length > 0) {
                return bookings;
            }

            angular.forEach(topics, function (topic) {
                angular.forEach(topic.classes, function (classType) {
                    if (!classType.activeClassGroup) {
                        return;
                    }
                    angular.forEach(classType.activeClassGroup.activities, function (activity) {
                        bookings.push(that.newBooking(topic, classType, classType.activeClassGroup, activity));
                    });
                });
            });

            return bookings;
        };

        return that;
    })

    .factory('clashGroupFactory', function () {
        var that = {};

        that.newClashGroup = function (firstBooking) {
            var clashGroup = {
                dayOfWeek: firstBooking.dayOfWeek,
                secondsStartsAt: firstBooking.secondsStartsAt,
                secondsEndsAt: firstBooking.secondsEndsAt,
                duration: firstBooking.duration,

                clashColumns: [],

                addBooking: function (booking) {
                    clashGroup.secondsStartsAt = Math.min(clashGroup.secondsStartsAt, booking.secondsStartsAt);
                    clashGroup.secondsEndsAt = Math.max(clashGroup.secondsEndsAt, booking.secondsEndsAt);
                    clashGroup.duration = clashGroup.secondsEndsAt - clashGroup.secondsStartsAt;

                    var clashColumn = null;
                    if (clashGroup.clashColumns.length > 0) {
                        var latestContestantEnds = 0;
                        angular.forEach(clashGroup.clashColumns, function (contestantColumn) {
                            var contestantColumnEnds = contestantColumn[contestantColumn.length - 1].secondsEndsAt;
                            if (contestantColumnEnds <= booking.secondsStartsAt && contestantColumnEnds > latestContestantEnds) {
                                clashColumn = contestantColumn;
                                latestContestantEnds = contestantColumnEnds;
                            }
                        });
                    }

                    if (clashColumn === null) {
                        clashColumn = [];
                        clashGroup.clashColumns.push(clashColumn);
                    }

                    clashColumn.push(booking);

                    return true;
                }
            };

            clashGroup.addBooking(firstBooking);

            return clashGroup;
        };

        return that;
    })

    .factory('chosenTopicService', function ($rootScope, topicService) {
        var chosenTopics = [];

        var getTopicIndex = function (topic) {
            var index = -1;

            angular.forEach(chosenTopics, function (chosenTopic, i) {
                if (chosenTopic.id === topic.id) {
                    index = i;
                    return false; // break
                }
            });

            return index;
        };


        var that = {};

        that.broadcastTopicsUpdate = function () {
            $rootScope.$broadcast('chosenTopicsUpdate');
            that.broadcastClassesUpdate();
        };

        that.broadcastClassesUpdate = function () {
            $rootScope.$broadcast('chosenClassesUpdate');
        };

        that.addTopic = function (topic, broadcast) {
            if (broadcast === undefined) {
                broadcast = true;
            }

            if (!that.topicIsChosen(topic)) {
                chosenTopics.push(topic);

                topicService.sortTopics(chosenTopics);

                if (broadcast) {
                    that.broadcastTopicsUpdate();
                }
            }
        };

        that.getTopicCodes = function () {
            var topicCodes = [];

            angular.forEach(chosenTopics, function (topic) {
                topicCodes.push(topic.getSerial());
            });

            return topicCodes;
        };

        that.topicIsChosen = function (topic) {
            return getTopicIndex(topic) !== -1;
        };

        that.removeTopic = function (topic, broadcast) {
            if (broadcast === undefined) {
                broadcast = true;
            }

            if (that.topicIsChosen(topic)) {
                chosenTopics.splice(getTopicIndex(topic), 1);

                that.broadcastTopicsUpdate();

                if (broadcast) {
                    that.broadcastTopicsUpdate();
                }
            }
        };

        that.getTopics = function () {
            return chosenTopics;
        };

        return that;
    })

    .factory('duplicateBookingsService', function () {
        var duplicateBookingsService = {};

        duplicateBookingsService.removeDuplicateLookingBookings = function removeDuplicateLookingBookings (bookings) {
            bookings = bookings.slice(0);

            for (let i = 0; i < bookings.length; i++) {
                let a = bookings[i];
                for (let j = i + 1; j < bookings.length; j++) {
                    let b = bookings[j];

                    const sessionComparisonFields = ['topicId', 'className', 'dayOfWeek', 'secondsStartsAt', 'secondsEndsAt'];

                    let found = true;
                    sessionComparisonFields.forEach(field => {
                        if (a[field] !== b[field]) {
                            found = false;
                        }
                    });

                    // Remove the duplicate
                    if (found) {
                        // Update teaching intervals.
                        b.intervals.forEach(interval => {
                            if (a.intervals.find(int => int.firstDay === interval.firstDay && int.lastDay === interval.lastDay) === undefined)
                                bookings[i].intervals.push(interval);
                        })


                        bookings.splice(j, 1);
                        j--; // move the cursor back a space
                    }
                }
            }

            return bookings;
        };

        return duplicateBookingsService;
    })


    .factory('clashService', function (sessionsService) {
        var clashService = {};

        var startsInInterval = function (a, b) {
            if (b.secondsStartsAt <= a.secondsStartsAt && a.secondsStartsAt < b.secondsEndsAt) {
                // a's start is within b's interval
                return (Math.min(a.secondsEndsAt, b.secondsEndsAt) - a.secondsStartsAt);
            }
            return 0;
        };

        var endsInInterval = function (a, b) {
            if (b.secondsStartsAt < a.secondsEndsAt && a.secondsEndsAt <= b.secondsEndsAt) {
                // a's end is within b's interval
                return (a.secondsEndsAt - Math.min(a.secondsStartsAt, b.secondsStartsAt));
            }
            return 0;
        };

        var wrapsInterval = function (a, b) {
            if (a.secondsStartsAt <= b.secondsStartsAt && b.secondsEndsAt <= a.secondsEndsAt) {
                // a wraps b
                return b.secondsDuration;
            }
            return 0;
        };


        clashService.sessionsClash = function (a, b) {
            if (a.dayOfWeek !== b.dayOfWeek) {
                return 0;
            }
            else if (moment(a.lastDay).isBefore(moment(b.firstDay)) ||
                     moment(b.lastDay).isBefore(moment(a.firstDay))) {
                return 0;
            }
            else if (a.secondsStartsAt === b.secondsStartsAt) {
                // a and b start at the same time
                // clash's duration is until first ends
                return Math.min(a.secondsDuration, b.secondsDuration);
            }
            //start in interval
            if ((secondsClash = startsInInterval(a, b)) > 0) {
                return secondsClash;
            }
            if ((secondsClash = startsInInterval(b, a)) > 0) {
                return secondsClash;
            }
            //end in interval
            if ((secondsClash = endsInInterval(a, b)) > 0) {
                return secondsClash;
            }
            if ((secondsClash = endsInInterval(b, a)) > 0) {
                return secondsClash;
            }
            //wraps
            if ((secondsClash = wrapsInterval(a, b)) > 0) {
                return secondsClash;
            }
            if ((secondsClash = wrapsInterval(b, a)) > 0) {
                return secondsClash;
            }

            return 0;
        };

        var classClashCache = {};

        var addToClassClashCache = function (a, b, outcome) {
            classClashCache[a + ", " + b] = outcome;
            classClashCache[b + ", " + a] = outcome;
        };

        clashService.sessionArraysClash = function (a, b) {
            var clashDuration = 0;

            angular.forEach(a, function (aSession) {
                angular.forEach(b, function (bSession) {
                    clashDuration += clashService.sessionsClash(aSession, bSession);
                });
            });

            return clashDuration;
        };

        clashService.classGroupsClash = function (a, b) {
            if (a.id === b.id) {
                return 0;
            }

            if (typeof classClashCache[a.id + ", " + b.id] === "undefined") {
                var groupSecondsClash = clashService.sessionArraysClash(a.activities, b.activities);
                addToClassClashCache(a.id, b.id, groupSecondsClash);
            }

            return classClashCache[a.id + ", " + b.id];
        };

        return clashService;
    })

    .factory('dayService', function () {
        var dayService = {};

        var dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

        var dayIndexes = {};

        // populate dayIndexes
        angular.forEach(dayNames, function (name, index) {
            dayIndexes[name] = index;
        });

        dayService.dayNameToDayOfWeek = function (dayName) {
            return dayIndexes[dayName];
        };

        dayService.dayOfWeekToDayName = function (dayOfWeek) {
            return dayNames[dayOfWeek];
        };

        dayService.days = function () {
            // Copy the array so malicious Russells can't manipulate our internal one
            return dayNames.slice(0);
        };

        dayService.compareDays = function (a, b) {
            return dayService.dayNameToDayOfWeek(a) - dayService.dayNameToDayOfWeek(b);
        };

        return dayService;
    })

    .controller('TopicController', function ($scope, chosenTopicService, institutionFactory, topicFactory, urlService) {
        $scope.topicSearch = "";
        var availableTopics = [];
        $scope.matchingTopics = [];
        $scope.chosenTopics = chosenTopicService.getTopics();
        $scope.activeInstitution = {};
        $scope.activeYear = {};

        var topicMatchesFilter = function topicMatchesFilter (topic) {
            if (topic === undefined) {
                return false;
            }

            if (topic.words === undefined) {
                var name = topic.name.toLowerCase();
                var code = topic.code.toLowerCase();

                topic.words = name.split(' ');
                topic.words = topic.words.concat(code.split(' '));
            }

            var predicates = $scope.topicSearch.toLowerCase().split(' ');
            var words = topic.words;


            for (var i = 0; i < predicates.length; i++) {
                var predicate = predicates[i];
                var found = false;


                for (var j = 0; j < words.length; j++) {
                    var word = words[j];
                    // Try searching the topic name
                    if (word.lastIndexOf(predicate, 0) === 0) {
                        found = true;
                        break;
                    }

                }

                if (!found) {
                    return false;
                }
            }

            return true;
        };

        var applyTopicSearchFilter = function () {
            $scope.matchingTopics = [];

            if (availableTopics === undefined) {
                return;
            }

            var i = 0;
            while ($scope.matchingTopics.length < 5 && i < availableTopics.length) {
                if (topicMatchesFilter(availableTopics[i])) {
                    $scope.matchingTopics.push(availableTopics[i]);
                }

                i++;
            }

            if ($scope.matchingTopics) {
                $scope.activeTopic = $scope.matchingTopics[0];
            }
        };

        $scope.$watch('topicSearch', function (newValue) {
            applyTopicSearchFilter(newValue);
        });



        $scope.updateAvailableYears = function updateAvailableYears() {
            var availableSemesters = $scope.activeInstitution.resources.timetableSemesters;

            var years = [];

            angular.forEach(availableSemesters, function semestersByYear(semesters, year) {
                years.push(parseInt(year, 10));
            });

            $scope.years = years;

            if (years.indexOf($scope.activeYear) === -1) {
                $scope.activeYear = years[years.length - 1];
            }


            $scope.updateAvailableSemesters();
        };

        $scope.updateAvailableSemesters = function updateAvailableSemesters() {
            $scope.semesters = $scope.activeInstitution.resources.timetableSemesters[$scope.activeYear];

            angular.forEach($scope.semesters, function (semester) {
                if (semester.selected === undefined) {
                    semester.selected = ["S1", "NS1", "SP1", "SP2", "SP3"].indexOf(semester.code) !== -1;
                }
            });

            $scope.updateAvailableTopics();
        };

        function getActiveSemesters () {
            var activeSemesters = [];

            angular.forEach($scope.semesters, function (semester) {
                if (semester.selected) {
                    activeSemesters.push(semester.code);
                }
            });

            return activeSemesters;
        }

        $scope.updateAvailableTopics = function updateAvailableTopics() {
            availableTopics = [];

            topicFactory.getTopicsAsync({
                instCode: $scope.activeInstitution.code,
                year: $scope.activeYear,
                semester: getActiveSemesters().join(',')
            }, function (data) {
                availableTopics = data;
                applyTopicSearchFilter($scope.topicSearch);
            });
        };



        $scope.validateTopic = function (topic) {
            if (typeof topic === "undefined") {
                return false;
            }
            else if (chosenTopicService.topicIsChosen(topic)) {
                return false;
            }

            return true;
        };

        $scope.addTopic = function (topic) {
            if (!$scope.validateTopic(topic)) {
                return;
            }

            $scope.topicSearch = "";

            chosenTopicService.addTopic(topic);
            topicFactory.loadTimetableForTopicAsync(topic, function (topic) {
                chosenTopicService.broadcastTopicsUpdate();
            });
        };

        $scope.removeTopic = function (topic) {
            chosenTopicService.removeTopic(topic);
        };



        institutionFactory.getInstitutionsAsync(function gotInstitutionsAsync(institutions) {
            $scope.institutions = institutions;
            $scope.activeInstitution = institutions[0];
            $scope.updateAvailableYears();
        });
    })

    .controller('ManualClassChooserController', function ($scope, chosenTopicService, duplicateBookingsService, sessionsService, termDatesFactory) {
        $scope.selectClassGroup = function(topic, classType, selectedGroup) {
            // If the selected group has a stream attached to it, we'll need to update every other class group with a stream

            classType.activeClassGroup = selectedGroup;

            if (selectedGroup.stream !== null) {
                streamId = selectedGroup.stream.id;

                angular.forEach(topic.classes, function (classType) {
                    if (classType.activeClassGroup.stream == null || classType.activeClassGroup.stream.id == streamId) {
                        return true;
                    }

                    var matched = false;
                    angular.forEach(classType.classGroups, function (classGroup) {
                        if (matched) {
                            return;
                        }

                        if (classGroup.stream !== null && classGroup.stream.id == streamId) {
                            classType.activeClassGroup = classGroup;
                            matched = true;
                        }
                    });
                });
            }

            chosenTopicService.broadcastClassesUpdate();
        };

        $scope.getSection = (classType, groupId) => {
            let prefix = "";
            switch (classType.name) {
                case "Lecture": prefix = "LE"; break;
                case "Practical": prefix = "PR"; break;
                case "Workshop": prefix = "WR"; break;
                case "Tutorial": prefix = "TU"; break;
                case "Class Exercise": prefix = "CE"; break;
            }

            let num = (groupId < 10 ? "0" : "") + groupId;

            return prefix + num;
        };


        $scope.getWeeks = (activity) => {
            if (!$scope.termDates.length) {
                return;
            }

            $scope.activeWeeks.forEach(week => week.active = false);

            activity.intervals.forEach(interval => {
                let firstDay = new Date(interval.firstDay);
                let lastDay = new Date(interval.lastDay);

                for (let i = 0; i < $scope.termDates.length; i++) {
                    const date = $scope.termDates[i];

                    const weekStart = new Date(date.startsAt);
                    const weekEnd = new Date(date.endsAt);

                    if (weekStart <= lastDay && firstDay <= weekEnd)
                        $scope.activeWeeks[i].active = true;
                }
            });




            return $scope.activeWeeks;
        }


        $scope.chosenTopics = chosenTopicService.getTopics();
        $scope.removeDuplicateLookingBookings = duplicateBookingsService.removeDuplicateLookingBookings;
        $scope.sortSessions = sessionsService.sortSessions;

        $scope.termDates = [];
        $scope.activeWeeks = [];

        $scope.$on('chosenTopicsUpdate', function () {
            chosenTopics = chosenTopicService.getTopics();

            termDatesFactory.getTermDatesAsync({instCode: chosenTopics[0].institution.code, year: chosenTopics[0].year, semester: chosenTopics[0].semester}, termDates => {
                $scope.termDates = termDates;

                for (let termDate of termDates) {
                    console.log(termDate);
                    $scope.activeWeeks.push({
                        week: termDate.week,
                        active: true, //weeks.includes(termDate.week)
                    });
                }
            });
        });
    })

    .directive('timetableMini', function (bookingFactory, displayableTimetableFactory, clashService, dayService, sessionsService, clashGroupFactory) {
        var timetableMini = {
            restrict: 'E',

            scope: {
                topics: '=',
                candidate: '='
            },
            templateUrl: 'timetable/views/timetable-mini.tpl.html',

            link: function ($scope, element, attrs) {
                $scope.days = dayService.days();
                $scope.classSelections = $scope.candidate.classPicks;

                $scope.startOffset = $scope.candidate.stats.earliestStartTime;

                var endTime = $scope.candidate.stats.latestEndTime;

                var duration = endTime - $scope.startOffset;
                duration = duration / 3600;

                $scope.timetableStyle = { height: (duration * 3) + 'em' };

                $scope.updateTimetable = function () {
                    var bookings = bookingFactory.createBookingsForTopics($scope.topics, $scope.classSelections);
                    $scope.timetable = displayableTimetableFactory.createTimetableForBookings(bookings);
                };
                $scope.updateTimetable();

                $scope.$watch('classSelections', $scope.updateTimetable);
                $scope.$watch('topics', $scope.updateTimetable);
            }
        };

        return timetableMini;
    })

    .directive('timetable', function (bookingFactory, displayableTimetableFactory, clashService, dayService, sessionsService, clashGroupFactory) {
        var timetable = {
            restrict: 'E',

            scope: {
                topics: '=',
                classSelections: '='
            },

            templateUrl: 'timetable/views/timetable.tpl.html',

            link: function ($scope, element, attrs) {
                $scope.days = dayService.days();
                $scope.hours = ["8 AM", "9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM", "4 PM", "5 PM", "6 PM", "7 PM", "8 PM"];

                $scope.updateTimetable = function () {
                    var bookings = bookingFactory.createBookingsForTopics($scope.topics, $scope.classSelections);
                    $scope.timetable = displayableTimetableFactory.createTimetableForBookings(bookings);
                };
                $scope.updateTimetable();

                $scope.$watch('classSelections', $scope.updateTimetable);
                $scope.$watch('topics', $scope.updateTimetable);
            }
        };

        return timetable;
    })

    .directive('clashgroup', function () {
        return {
            restrict: 'E',
            scope: {
                clashGroup: '=',
                startOffset: '='
            },
            templateUrl: 'timetable/views/clashGroup.tpl.html'
        };
    })

    .directive('topicHighlight', function bookingHighlightDirective(colorAllocator) {
        var bookingHighlight = {
            restrict: 'A',
            link: function link(scope, elem, attrs) {
                if (scope.booking !== undefined) {
                    topicHash = scope.booking.topicHash;
                }
                else if (scope.topic !== undefined) {
                    topicHash = scope.topic.getHash();
                }

                var colorId = colorAllocator(topicHash);

                elem.addClass('topic-' + colorId);
            }
        };

        return bookingHighlight;
    })

    .directive('bookingLockedIndicator', function bookingLockedIndicatorDirective() {
        var bookingLockedIndicator = {
            restrict: 'A',
            link: function link(scope, elem, attrs) {
                if (scope.booking.locked) {
                    elem.addClass('locked');
                }
            }
        };

        return bookingLockedIndicator;
    })

    .directive('bookingTopOffset', function bookingTopOffsetDirective() {
        var bookingTopOffset = {
            restrict: 'A',
            link: function link(scope, elem, attrs) {
                if (scope.startOffset === undefined) {
                    scope.startOffset = 28800;
                }

                elem.css('height', (scope.booking.secondsDuration * 2 / (20 * 60)) + 'em');
                elem.css('top', ((scope.booking.secondsStartsAt - scope.startOffset) * 2 / (20 * 60)) + 'em');
            }
        };

        return bookingTopOffset;
    })

    .directive('booking', function bookingDirective() {
        var booking = {
            restrict: 'E',
            scope: {
                booking: '=',
                startOffset: '='
            },
            templateUrl: 'timetable/views/booking.tpl.html'
        };

        return booking;
    })

    .controller('TimetableController', function ($scope, chosenTopicService, displayableTimetableFactory, sessionsService, dayService, bookingFactory, clashService, clashGroupFactory) {
        $scope.chosenTopics = chosenTopicService.getTopics();
        $scope.$on('chosenClassesUpdate', function () {
            // Note: The slice(0) is used to duplicate the array object to work around angularJS caching the rendered timetable for a given chosenTopics object
            // TODO: Remove this hack, make getTopics() return a new instance of the array every time.
            $scope.chosenTopics = chosenTopicService.getTopics().slice(0);
        });
    })

    .controller('TimetableGeneratorController', function (
            $scope,
            $location,
            $anchorScroll,
            countPossibleTimetables,
            chosenTopicService,
            timetableGenerator,
            maxTimetablePages,
            timetablePriorityFactory,
            timetablesPerPage,
            stopwatch) {
        $scope.chosenTopics = chosenTopicService.getTopics();
        $scope.numPossibleTimetables = 1;

        $scope.config = {
            avoidFull: true,
            maxTimetables: 100000,
            clashAllowance: 0
        };

        var ONE_HOUR = 3600;
        $scope.clashAllowanceChoices = [0, ONE_HOUR, 2 * ONE_HOUR, 3 * ONE_HOUR];

        $scope.maxTimetablesChoices = {"infinity": 0, "10": 10, "100": 100, "1000": 1000, "10000": 10000, "100000": 100000 };

        $scope.prioritiesSortableOptions = {
            axis: "y"
        };

        $scope.timetablePriorities = timetablePriorityFactory.createAllTimetablePriorities();

        var allGeneratedTimetables = [];

        $scope.movePreference = function (index, movement) {
            var destination = index + movement;

            if (destination >= 0 && destination <= $scope.timetablePriorities.length) {
                var buffer = $scope.timetablePriorities[index];
                $scope.timetablePriorities[index] = $scope.timetablePriorities[destination];
                $scope.timetablePriorities[destination] = buffer;
            }
        };

        $scope.applyClassGroupSelection = function (classGroupSelection) {
            angular.forEach(classGroupSelection, function (entry) {
                entry.classType.activeClassGroup = entry.classGroup;
            });

            chosenTopicService.broadcastClassesUpdate();

            $location.hash('show-timetable');
            $anchorScroll();
            $location.hash('');
        };

        $scope.generateTimetables = function () {
            /*if (fbq) {
                fbq('trackCustom', 'Generate', {});
            }*/

            var timer = stopwatch();

            $scope.timetableCandidates = timetableGenerator.generateTimetables(chosenTopics, $scope.config, $scope.timetablePriorities);

            $scope.pageIndex = 0;
            $scope.numPages = Math.min(maxTimetablePages, Math.ceil($scope.timetableCandidates.length / timetablesPerPage));
            $scope.suggestionsPerPage = timetablesPerPage;

            $scope.hasGeneratedTimetables = true;

            $scope.examineDuration = timer.elapsedSeconds();
        };

        $scope.$on('chosenTopicsUpdate', function () {
            chosenTopics = chosenTopicService.getTopics();
            $scope.hasChosenTopics = (chosenTopics.length > 0);
            $scope.numPossibleTimetables = countPossibleTimetables(chosenTopics);
            $scope.hasGeneratedTimetables = false;
        });
    })




    .controller('CalendarController', function ($scope, chosenTopicService, gcalExporter) {
        function updateCalendarList() {
            gcalExporter.listCalendars(function (calendars) {
                $scope.$apply(function() {
                    $scope.calendars = calendars || [];

                    $scope.calendarsEnabled = calendars.length > 0;
                });
            });
        }

        $scope.calendarsEnabled = false;
        $scope.activeCalendar = null;
        $scope.calendarName = "UniBuddy Calendar";
        $scope.chosenTopics = chosenTopicService.getTopics();
        $scope.authorized = false;
        $scope.exporting = false;
        $scope.exported = false;
        $scope.percentage = 0;

        $scope.isActive = function isActive(calendar) {
            if (!$scope.activeCalendar) {
                return false;
            }

            return $scope.activeCalendar.id == calendar.id;
        };

        $scope.authorizeUser = function authorizeUser() {
            gcalExporter.authorize(function authorizedCallback() {
                $scope.authorized = true;
                updateCalendarList();
            });
        };

        $scope.createCalendar = function createCalendar(calendarName) {
            $scope.calendarName = "";
            gcalExporter.createCalendar(calendarName, function(calendar) {
                $scope.$apply(function() {
                    $scope.calendars.push(calendar);
                    $scope.activeCalendar = calendar;
                });
            });
        };

        $scope.exportCalendar = function exportCalendar(calendar) {
            $scope.exporting = true;
            $scope.percentage = 0;

            gcalExporter.exportTopicsToCalendar(calendar, $scope.chosenTopics, function(percentage) {
                $scope.$apply(function() {
                    $scope.percentage = percentage;
                    if (percentage >= 100 && $scope.exporting) {
                        $scope.exported = true;
                    }
                });
            });
        };


        var resetExporting = function resetExporting() {
            $scope.exporting = false;
            $scope.exported = false;
        };

        $scope.$on('chosenClassesUpdate', resetExporting);
        $scope.$watch('activeCalendar', resetExporting);
    });

