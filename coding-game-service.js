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

    _init: function() {
    },

    sendChatMessage: function(message) {
        log('Would send message: ' + JSON.stringify(message));
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
                type: e.type
            };
        });
    }
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
        this._settings = new Gio.Settings({ schema_id: CODING_GAME_SERVICE_SCHEMA });
        this._descriptors = descriptors;
        this._monitor = monitor;
        this._log = new CodingGameServiceLog(Gio.File.new_for_path("game-service.log"));
        this._chatController = new CodingGameServiceChatController();
        this._dispatchTable = {
            'chat-actor': Lang.bind(this, this._dispatchChatEvent),
            'chat-user': Lang.bind(this, this._dispatchChatEvent)
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

    _dispatchChatEvent: function(event) {
        let entry = this._log.handleEvent(event.type, event.data);

        if (entry.type === 'chat-actor') {
            this._chatController.sendChatMessage({
                timestamp: entry.timestamp,
                actor: entry.actor,
                message: entry.data.message,
                name: entry.data.name
            });
        }
    },          

    dispatch: function(event) {
        return this._dispatchTable[event.type](event);
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
