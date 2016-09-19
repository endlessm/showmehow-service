#!/usr/bin/env gjs
/* coding-game-service.js
 *
 * Copyright (c) 2016 Endless Mobile Inc.
 * All Rights Reserved.
 *
 * The Coding Game Service is the central place where timelines about game state
 * progression are kept. This service essentially administers a large JSON file
 * with a history of all events and can reconstruct chatbox conversations from that.
 *
 * It reads another JSON file which is a predefined "script" for what should
 * happen on particular actions, for instance, showing another chatbox
 * message, or waiting for a particular event. It is designed to be stateful, unlike
 * showmehow-service, which is stateless.
 */


const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const CodingGameServiceDBUS = imports.gi.CodingGameService;
const ChatboxService = imports.gi.ChatboxService;
const Showmehow = imports.gi.Showmehow;

/* This is a hack to cause CodingGameService js resources to get loaded */
const CodingGameServiceResource = imports.gi.CodingGameService.get_resource();  // eslint-disable-line no-unused-vars

const Lang = imports.lang;

/* Put ourself in the search path. Note that we have the least priority.
 * This will allow us to run locally against non-packed files that
 * are already on disk if the user sets GJS_PATH appropriately. */
imports.searchPath.push('resource:///com/endlessm/coding-game-service');

const CODING_GAME_SERVICE_SCHEMA = 'com.endlessm.CodingGameService';

/**
 * loadTimelineDescriptorsFromFile
 *
 * Given a GFile, load and validate lesson descriptors from it. Returns
 * the descriptors and warnings as a tuple.
 */
function loadTimelineDescriptorsFromFile(file) {
    let warnings = [];
    let descriptors = null;
    let success = false;

    try {
        let contents = file.load_contents(null)[1];
        success = true;
    } catch (e) {
        warnings.push('Unable to load ' + file.get_parse_name() + ': ' + String(e));
    }

    return [success ? descriptors : null, warnings];
}

/**
 * loadTimelineDescriptors
 *
 * Attempts to load timeline descriptors from a file.
 *
 * The default case is to load the descriptors from the internal resource
 * file that makes up CodingGameService's binary. However, we first:
 *  1. Look at the command line to see if a file was provided there
 *  2. Look in $XDG_CONFIG_HOME for a file called 'lessons.json'
 *  3. Use the internal resource named 'data/lessons.json'
 *
 * The first two are assumed to be 'untrusted' - they will be validated
 * before being loaded in. If there are any errors, we try to use
 * what we can, but will add in an 'errors' entry to signify that
 * there were some errors that should be dealt with. Client applications
 * may query for errors and display them appropriately. This is
 * to help the lesson authors quickly catch problems.
 *
 * Returns a tuple of [descriptors, monitor]. The monitor may
 * hold a reference to a GFileMonitor or null, which needs to
 * be kept in scope to watch for changes to files.
 */
function loadTimelineDescriptors(cmdlineFilename) {
    let filenamesToTry = [
        cmdlineFilename,
        GLib.build_pathv('/', [GLib.get_user_config_dir(), 'coding-game-service', 'timeline.json'])
    ].filter(f => !!f);

    var warnings = [];
    var descriptors = null;
    let monitor = null;

    /* Here we use a 'dumb' for loop, since we need to update
     * warnings if a filename didn't exist */
    for (let i = 0; i < filenamesToTry.length; ++i) {
        let file = Gio.File.new_for_path(filenamesToTry[i]);
        let loadWarnings;

        [descriptors, loadWarnings] = loadTimelineDescriptorsFromFile(file);

        /* Concat the warnings anyway even if we weren't successful, since
         * the developer might still be interested in them. */
        warnings = warnings.concat(loadWarnings);

        /* If we were successful, then break here, otherwise try and load
         * the next file.
         *
         * Note that success is defined as 'we were able to partially load
         * a file.' */
        if (descriptors) {
            monitor = file.monitor(Gio.FileMonitorFlags.NONE, null);
            break;
        }
    }

    /* If we don't have a file to work with here, go with the resources
     * path, but assume that it is trusted.
     *
     * This isn't the preferable way of doing it, though it seems like resource
     * paths are not working, at least not locally */
    if (!descriptors) {
        descriptors = JSON.parse(Gio.resources_lookup_data('/com/endlessm/coding-game-service/data/timeline.json',
                                                           Gio.ResourceLookupFlags.NONE).get_data());
    }

    /* Add a 'warnings' key to descriptors. */
    descriptors.warnings = warnings;
    return [descriptors, monitor];
}

function findInArray(array, callback) {
    let result = array.filter(callback);
    if (!result.length) {
        return null;
    }
    return result[0];
}

let LOG_CONTENTS = [];

const CodingGameServiceChatController = new Lang.Class({
    Name: 'CodingGameServiceChatController',

    _init: function(proxyClass) {
        this._proxyClass = proxyClass;

        /* Methods shouldn't use this directly. Instead, call
         * withLoadedChatboxProxy and use the provided
         * "chatbox" in the return function to ensure that calls
         * are only made when the proxy has actually been initialized. */
        this._internalChatboxProxy = null;
    },

    /* The purpose of this function is to allow client callers to lazy-load
     * the chatbox service connection so that it doesn't get spawned right
     * away on startup whilst the game service is running. @callback
     * will be called when the connection has been made.
     *
     * Note that callback might called either synchronously or asynchronously
     * here - you should not make any assumptions about the order of execution
     * of callback around other code. If you depend on the proxy to be loaded
     * then you should put the code that depends on it inside this callback. */
    _withLoadedChatboxProxy: function(callback) {
        if (this._internalChatboxProxy) {
            callback(this._internalChatboxProxy);
        } else {
            let name = 'com.endlessm.Coding.Chatbox';
            let path = '/com/endlessm/Coding/Chatbox';

            this._proxyClass.new_for_bus(Gio.BusType.SESSION,
                                         0,
                                         name,
                                         path,
                                         null,
                                         Lang.bind(this, function(source, result) {
                try {
                    this._internalChatboxProxy = this._proxyClass.new_for_bus_finish(result);
                } catch (e) {
                    logError(e, "Error occurred in connecting to com.endlesssm.Coding.Chatbox");
                }

                /* Once we're done here, invoke the callback as above */
                callback(this._internalChatboxProxy);
            }));
        }
    },

    sendChatMessage: function(message) {
        let serialized = JSON.stringify(message);
        this._withLoadedChatboxProxy(function(chatbox) {
            chatbox.call_receive_message(serialized, null, function(source, result) {
                try {
                    [success, returnValue] = chatbox.call_receive_message_finish(result);
                } catch (e) {
                    logError(e,
                             "Failed to send message to chatbox (" +
                             JSON.stringify(message, null, 2));
                }
            });
        });
    }
});

const CodingGameServiceLog = new Lang.Class({
    Name: 'CodingGameServiceLog',

    _init: function(logFile) {
        this._logFile = logFile;
        this._eventLog = JSON.parse(this._logFile.load_contents(null)[1]);
    },

    handleEvent: function(eventType, eventData) {
        let timestamp = new Date().toLocaleString();
        let entry = {
            type: eventType,
            data: eventData,
            timestamp: timestamp
        };

        this._eventLog.push(entry);
        this._logFile.replace_contents(JSON.stringify(this._eventLog, null, 2),
                                       null,
                                       false,
                                       Gio.FileCreateFlags.NONE,
                                       null);
        return entry;
    },

    chatLogForActor: function(actor) {
        return this._eventLog.filter(function(e) {
            return (e.type === 'chat-actor' || e.type === 'chat-user') && e.data.actor === actor;
        }).map(function(e) {
            return {
                timestamp: e.timestamp,
                actor: e.data.actor,
                message: e.data.message,
                name: e.data.name,
                input: e.data.input,
                type: e.type
            };
        });
    },

    entriesForEventNames: function(eventNames) {
        let eventsToEntries = {};

        eventNames.forEach(function(e) {
            eventsToEntries[e] = null;
        });

        this._eventLog.filter(function(e) {
            return eventNames.indexOf(e.data.name) !== -1;
        }).forEach(function(e) {
            /* Unconditionally overwrite eventsToEntries so that each key
             * in the object corresponds to the latest occurrence of the
             * event */
            eventsToEntries[e.data.name] = e;
        });

        return eventsToEntries;
    },

    activeMission: function() {
        let missions = this._eventLog.filter(function(e) {
            return e.type === 'start-mission';
        });

        if (!missions.length) {
            return null;
        }

        return missions[missions.length - 1].data.name;
    },
});
        

const CodingGameServiceErrorDomain = GLib.quark_from_string('coding-game-service-error');
const CodingGameServiceErrors = {
    NO_SUCH_EVENT_ERROR: 0,
    NO_SUCH_RESPONSE_ERROR: 1,
    INTERNAL_ERROR: 2
};
const CodingGameService = new Lang.Class({
    Name: 'CodingGameService',
    Extends: CodingGameServiceDBUS.CodingGameServiceSkeleton,

    _init: function(props, descriptors, monitor) {
        this.parent(props);
        this._descriptors = descriptors;
        this._monitor = monitor;
        this._contentProvider = Showmehow.ServiceProxy.new_for_bus_sync(Gio.BusType.SESSION,
                                                                        0,
                                                                        'com.endlessm.Showmehow.Service',
                                                                        '/com/endlessm/Showmehow/Service',
                                                                        null);
        this._log = new CodingGameServiceLog(Gio.File.new_for_path("game-service.log"));
        this._chatController = new CodingGameServiceChatController(ChatboxService.CodingChatboxProxy);
        this._dispatchTable = {
            'chat-actor': Lang.bind(this, this._dispatchChatEvent),
            'chat-user': Lang.bind(this, this._dispatchChatEvent),
            'start-mission': Lang.bind(this, this._startMissionEvent)
        };

        /* Log the warnings, and also make them available to clients who are interested.
         *
         * XXX: For some odd reason, I'm not able to return 'as" here and need to
         * return an array of structures in order to get this to work. */
        this._descriptors.warnings.forEach(w => log(w));

        /* If we did have a monitor on the file, it means that we can notify clients
         * when a reload has happened. To do that, connect to the 'changed' signal
         * and emit the 'content-refreshed' signal when a change happens. Clients
         * should reset their internal state when this happens. */
        if (this._monitor) {
            this._monitor.connect('changed', Lang.bind(this, function(monitor, file, other, type) {
                if (type === Gio.FileMonitorEvent.CHANGED) {
                    let [descriptors, warnings] = loadTimelineDescriptorsFromFile(file);

                    if (descriptors) {
                        this._descriptors = descriptors;
                        this._descriptors.warnings = warnings;

                        this.emit_lessons_changed();
                    }
                }
            }));
        }

        /* If we started for the first time, dispatch the very first mission */
        let activeMission = this._log.activeMission();

        if (activeMission) {
            this._startMission(activeMission);
        } else {
            this.dispatch({
                type: 'start-mission',
                data: {
                    name: this._descriptors.start.initial_mission
                }
            });
        }
    },

    vfunc_handle_chat_history: function(method, actor) {
        try {
            let history = this._log.chatLogForActor(actor).map(function(h) {
                return [JSON.stringify(h)];
            });
            this.complete_chat_history(method, GLib.Variant.new('a(s)', history));
        } catch(e) {
            method.return_error_literal(CodingGameServiceErrorDomain,
                                        CodingGameServiceErrors.INTERNAL_ERROR,
                                        String(e));
        }

        return true;
    },

    vfunc_handle_chat_response: function(method, id, contents, response) {
        try {
            let respondingTo = findInArray(this._descriptors.events, function(e) {
                return (e.type === 'chat-actor' || e.type === 'chat-user') && e.name === id;
            });

            if (!respondingTo) {
                method.return_error_literal(CodingGameServiceErrorDomain,
                                            CodingGameServiceErrors.NO_SUCH_EVENT_ERROR,
                                            'No such event ' + JSON.stringify(id));
                return true;
            }

            let eventKeyToRun = findInArray(Object.keys(respondingTo.data.responses), function(r) {
                return r === response;
            });

            if (!eventKeyToRun) {
                method.return_error_literal(CodingGameServiceErrorDomain,
                                            CodingGameServiceErrors.NO_SUCH_RESPONSE_ERROR,
                                            'No such response ' + JSON.stringify(response));
                return true;
            }

            this.dispatch({
                name: id + '::response',
                type: 'chat-user',
                data: {
                    name: id,
                    actor: respondingTo.data.actor,
                    message: contents
                }
            });

            /* Now that we have the events, run each of them */
            let events = respondingTo.data.responses[eventKeyToRun].filter(function(e) {
                return e.type === 'event';
            });

            this._descriptors.events.filter(function(e) {
                return findInArray(events, function(responseEvent) {
                    return responseEvent.name === e.name;
                }) !== null;
            }).forEach(Lang.bind(this, function(e) {
                this.dispatch(e);
            }));

            this.complete_chat_response(method);
        } catch(e) {
            method.return_error_literal(CodingGameServiceErrorDomain,
                                        CodingGameServiceErrors.INTERNAL_ERROR,
                                        String(e));
            logError(e);
        }

        return true;
    },

    _dispatchChatEvent: function(event, callback) {
        let sendMessage = Lang.bind(this, function(event) {
            /* Creates a log entry then sends the message to the client */
            let entry = callback(event);
            this._chatController.sendChatMessage({
                timestamp: entry.timestamp,
                actor: entry.data.actor,
                message: entry.data.message,
                input: entry.data.input,
                name: entry.data.name
            });
        });

        if (event.type === 'chat-actor') {
            /* If we don't actually have message text yet, then
             * we'll need to fetch it from showmehow-service */
            if (!event.data.message) {
                let [name, position] = event.data.name.split("::").slice(0, 2)
                this._contentProvider.call_get_task_description(name, position, null,
                                                                Lang.bind(this, function(source, result) {
                    let success, returnValue;

                    try {
                        [success, returnValue] = this._contentProvider.call_get_task_description_finish(result);
                    } catch (e) {
                        logError(e, "Call to get_task_description failed, for " + event.data.name);
                    }

                    let [message, inputSpecString] = returnValue.deep_unpack();
                    let inputSpec = JSON.parse(inputSpecString);

                    event.data.message = message;
                    event.data.input = inputSpec;
                    sendMessage(event);
                }));
            } else {
                sendMessage(event);
            }
        } else {
            /* No sense sending the chat message, just create a log entry */
            callback(event);
        }
    },

    _startMission: function(name) {
        /* When a mission is started, we look at the very first event in this mission
         * and dispatch that if it has not already been dispatched in the log. We also
         * set the active mission name and the points counter */
        let missionSpec = findInArray(this._descriptors.missions, function(m) {
            return m.name === name;
        });

        if (!missionSpec) {
            throw new Error("No such mission named " + name);
        }

        let totalAvailablePoints = missionSpec.artifacts.map(function(a) {
            return a.points;
        }).reduce(function(total, p) {
            return total + p;
        }, 0);

        let completedEvents = this._log.entriesForEventNames(missionSpec.artifacts.map(function(a) {
            return a.name;
        }));

        let totalAccruedPoints = Object.keys(completedEvents).filter(function(k) {
            return completedEvents[k] !== null;
        }).map(function(k) {
            return findInArray(missionSpec.artifacts, function(a) {
                return a.name === k;
            });
        }).reduce(function(total, a) {
            return total + a.points;
        }, 0);

        this.current_mission = missionSpec.name;
        this.current_mission_name = missionSpec.short_desc;
        this.current_mission_desc = missionSpec.long_desc;
        this.current_mission_num_tasks_available = Object.keys(completedEvents).length;
        this.current_mission_num_tasks = Object.keys(completedEvents).filter(function(k) {
            return completedEvents[k] !== null;
        }).length;
        this.current_mission_points = totalAccruedPoints;
        this.current_mission_available_points = totalAvailablePoints;

        /* Now, if our starting event has not yet occured, trigger it */
        if (!completedEvents[missionSpec.artifacts[0].name]) {
            let event = findInArray(this._descriptors.events, function(e) {
                return e.name === missionSpec.artifacts[0].name;
            });

            this.dispatch(event);
        }
    },

    _startMissionEvent: function(event, callback) {
        this._startMission(event.data.name);
        callback(event);
    },

    dispatch: function(event) {
        this._dispatchTable[event.type](event, Lang.bind(this, function(logEvent) {
            return this._log.handleEvent(logEvent.type, logEvent.data);
        }));

        /* If we have a current mission, update the number of points
         * based on the fact that we ran a new event. Note that the points
         * accrue as soon as an event is run, which is meant to be
         * representative of the fact that it was triggered from other
         * events.
         *
         * This simplifies the design somewhat, since it allows us to
         * keep the notion of events and artifacts separate and does not
         * require us to encode the idea of "passing" or "failing" an
         * event (instead we merely move from one event to another) */
        if (this.current_mission) {
            let missionSpec = findInArray(this._descriptors.missions, Lang.bind(this, function(m) {
                return m.name == this.current_mission;
            }));
            let achievedArtifact = findInArray(missionSpec.artifacts, function(a) {
                return a.name === event.data.name;
            });

            if (achievedArtifact) {
                this.current_mission_points += achievedArtifact.points;
                this.current_mission_num_tasks++;
            }
        }
    }   
});

/**
 * parseArguments
 *
 * Sadly, GOptionEntry is not supported by Gjs, so this is a poor-man's
 * option parser.
 *
 * This option parser is a simple 'state machine' option parser. It just
 * has a state as to whether it is parsing a double-dash option, or
 * if it is parsing something else. There is no type checking or
 * validation.
 *
 * Sadly, this means that there is no way to add arguments to --help
 * to show the user.
 *
 * Everything is stored as an array.
 */
function parseArguments(argv) {
    var parsing = null;
    var options = {};

    argv.forEach(function(arg, i) {
        let isDoubleDash = arg.startsWith('--');
        if (isDoubleDash) {
            parsing = arg.slice(2);
        }

        let key = parsing || arg;
        options[key] = options[key] || [];

        /* Whether we push arg to the options
         * list depends on what is ahead of us.
         *
         * If this was a double-dash argument
         * then check if the next argument
         * starts with something that is
         * not a double dash. If so, we should
         * treat this argument as a key and
         * not a value, otherwise treat it
         * truthy value.
         */
        if (!isDoubleDash ||
            i === argv.length - 1 ||
            argv[i + 1].startsWith('--')) {
            options[key].push(isDoubleDash ? !!arg : arg);
        }
    });

    return options;
}

const CodingGameServiceApplication = new Lang.Class({
    Name: 'CodingGameServiceApplication',
    Extends: Gio.Application,

    _init: function(params) {
        this.parent(params);
        this._skeleton = null;
        this._commandLineFilename = null;
    },

    vfunc_startup: function() {
        this.parent();
        this.hold();
    },

    vfunc_handle_local_options: function(options) {
        this.parent(options);

        /* For some rather daft reasons, we have to parse ARGV
         * directly to find out some interesting things. */
        let parsed = parseArguments(ARGV);
        try {
            this._commandLineFilename = parsed['lessons-file'][0];
        } catch (e) {
            this._commandLineFilename = null;
        }

        /* Must return -1 here to continue processing, otherwise
         * we will exit with a code */
        return -1;
    },

    vfunc_dbus_register: function(conn, object_path) {
        this.parent(conn, object_path);
        let [descriptors, monitor] = loadTimelineDescriptors(this._commandLineFilename);
        this._skeleton = new CodingGameService({}, descriptors, monitor);
        this._skeleton.export(conn, object_path);
        return true;
    },

    vfunc_dbus_unregister: function(conn, object_path) {
        if (this._skeleton) {
            this._skeleton.unexport();
        }

        this.parent(conn, object_path);
    }
});

let application = new CodingGameServiceApplication({
    'application-id': 'com.endlessm.CodingGameService.Service',
    'flags': Gio.ApplicationFlags.IS_SERVICE |
             Gio.ApplicationFlags.HANDLES_COMMAND_LINE
});
application.run(ARGV);
