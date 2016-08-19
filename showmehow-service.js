#!/usr/bin/env gjs
/* showmehow-service.js
 *
 * Copyright (c) 2016 Endless Mobile Inc.
 * All Rights Reserved.
 *
 * The Showmehow service is the central place where all "lessons" about
 * the operating system are stored and progress is kept.
 */


const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Showmehow = imports.gi.Showmehow;

/* This is a hack to cause Showmehow js resources to get loaded */
const ShowmehowResource = imports.gi.Showmehow.get_resource();

const Lang = imports.lang;

/* Put ourself in the search path. Note that we have the least priority.
 * This will allow us to run locally against non-packed files that
 * are already on disk if the user sets GJS_PATH appropriately. */
imports.searchPath.push('resource:///com/endlessm/showmehow')

const Validation = imports.lib.validation;

const SHOWMEHOW_SCHEMA = 'com.endlessm.showmehow';

function read_file_contents(path) {
    const cmdlineFile = Gio.File.new_for_path(path);
    const [ok, contents, etag] = cmdlineFile.load_contents(null);
    return contents;
}

function environment_object_to_envp(environment) {
    if (environment) {
        return Object.keys(environment)
                     .map(key => key + "=" + environment[key]);
    } else {
        return null;
    }
}

function environment_as_object() {
    let environment = {};
    GLib.listenv().forEach(key => environment[key] = GLib.getenv(key));
    return environment;
}

function execute_command_for_output(argv, user_environment={}) {
    let environment = environment_as_object();
    Object.keys(user_environment).forEach(key => {
        environment[key] = user_environment[key]
    });

    const [ok, stdout, stderr, status] = GLib.spawn_sync(null,
                                                         argv,
                                                         environment_object_to_envp(environment),
                                                         0,
                                                         null);
    return {
        status: status,
        stdout: String(stdout),
        stderr: String(stderr)
    }
}

function launch_and_watch_pid(argv, on_exit_callback) {
    const [ok, child_pid] = GLib.spawn_async(null,
                                             argv,
                                             null,
                                             GLib.SpawnFlags.DO_NOT_REAP_CHILD,
                                             null);

    GLib.child_watch_add(GLib.PRIORITY_DEFAULT_IDLE, child_pid, function(pid, status) {

        if (on_exit_callback)
            on_exit_callback(pid, status);
    });

    return child_pid;
}

function execute_command_for_output_success(argv) {
    const result = execute_command_for_output(argv);
    if (result.status !== 0) {
        throw new Error("Execution of " + argv.join(" ") +
                        "failed with " + result.status +
                        "\nOutput: " + result.stdout +
                        "\nError Messages: " + result.stderr);
    }

    return {
        stdout: result.stdout,
        stderr: result.stderr
    }
}

function generate_array_from_function(func) {
    let arr = [];
    let result;

    while ((result = func.apply(this, arguments)) !== null) {
        arr.push(result);
    }

    return arr;
}

function list_directory(directory) {
    let file = Gio.File.new_for_path(directory);
    let enumerator = file.enumerate_children("standard::name", 0, null);
    const directory_info_list = generate_array_from_function(() => enumerator.next_file(null));
    return directory_info_list.map(function(info) {
        return {
            name: info.get_name(),
            type: info.get_file_type()
        };
    });
}

function directory_names_matching_in(regex, path) {
    return list_directory(path).filter(function(info) {
        return info.type === Gio.FileType.DIRECTORY &&
               info.name.match(regex) !== null;
    });
}

function select_random_from(array) {
    return array[Math.floor(Math.random() * array.length)];
}

const WAIT_MESSAGES = [
    "Wait for it",
    "Combubulating transistors",
    "Adjusting for combinatorial flux",
    "Hacking the matrix",
    "Exchanging electrical bits",
    "Refuelling source code",
    "Fetching arbitrary refs",
    "Resolving mathematical contradictions",
    "Fluxing liquid input"
]

function regex_validator(input, regex) {
    /* Case insensitive and multi-line */
    const extras = [
        {
            type: "response",
            content: {
                "type": "wrapped",
                "value": input
            }
        }
    ];

    if (input.match(new RegExp(regex, "mi")) !== null) {
        return ["success", extras];
    }

    return ["failure", extras];
}

/* Executing raw shellcode. What could possibly go wrong? */
function shell_executor(shellcode, environment) {
    return execute_command_for_output(["/bin/bash", "-c", shellcode + "; exit 0"],
                                      environment);
}

function shell_executor_output(shellcode, environment) {
    const result = shell_executor(shellcode, environment);
    return [result.stdout + "\n" + result.stderr, []];
}

function input_executor_output(input, environment) {
    return {
        validatable_output: input,
        printable_output: ""
    };
}

const KNOWN_EXECUTORS = {
    "shell": shell_executor_output,
    "input": input_executor_output
};


/**
 * addArrayUnique:
 *
 * Given some array, add another array and ensure
 * that all elements are unique.
 *
 * Provide the third "arraySearch" argument if you
 * need to provide a custom function to search
 * the existing array for the value that
 * is being added.
 */
function addArrayUnique(lhs, rhs, arraySearchArg) {
    const arraySearch = arraySearchArg || ((c, p) => p.indexOf(c) === -1);
    return lhs.concat(rhs).reduce((p, c) => {
        if (arraySearch(c, p)) {
            p.push(c);
        }
        return p;
    }, []);
}

/**
 * lessonDescriptorMatching:
 *
 * Given a lesson name and lesson descriptors, return
 * the lesson descriptor.
 */
function lessonDescriptorMatching(lesson, descriptors) {
    /* An immediately invoked function expression to extract the relevant
     * useful information from a lesson descriptor without extracting
     * everything all at once. */
    const matches = descriptors.filter(d => d.name === lesson);

    if (matches.length !== 1) {
        log("Expected only a single match from " + lesson +
            " but there were " + matches.length + " matches");
        return null;
    }

    return matches[0];
}

/**
 * loadLessonDescriptorsFromFile
 *
 * Given a GFile, load and validate lesson descriptors from it. Returns
 * the descriptors and warnings as a tuple.
 */
function loadLessonDescriptorsFromFile(file) {
    let warnings = [];
    let descriptors = [];
    let success = false;

    try {
        const [ok, contents, etag] = file.load_contents(null);
        [descriptors, warnings] = Validation.validateDescriptors(JSON.parse(contents));
        success = true;
    } catch (e) {
        warnings.push("Unable to load " + file.get_parse_name() + ": " + String(e));
    }

    return [descriptors, warnings, success]
}

/**
 * loadLessonDescriptors
 *
 * Attempts to load lesson descriptors from a file.
 *
 * The default case is to load the descriptors from the internal resource
 * file that makes up Showmehow's binary. However, we first:
 *  1. Look at the command line to see if a file was provided there
 *  2. Look in $XDG_CONFIG_HOME for a file called "lessons.json"
 *  3. Use the internal resource named "data/lessons.json"
 *
 * The first two are assumed to be "untrusted" - they will be validated
 * before being loaded in. If there are any errors, we try to use
 * what we can, but will add in an "errors" entry to signify that
 * there were some errors that should be dealt with. Client applications
 * may query for errors and display them appropriately. This is
 * to help the lesson authors quickly catch problems.
 *
 * Returns a tuple of [descriptors, monitor]. The monitor may
 * hold a reference to a GFileMonitor or null, which needs to
 * be kept in scope to watch for changes to files.
 */
function loadLessonDescriptors(cmdlineFilename) {
    const filenamesToTry = [
        cmdlineFilename,
        GLib.build_pathv("/", [GLib.get_user_config_dir(), "showmehow", "lessons.json"])
    ].filter(f => !!f);

    var warnings = [];
    var descriptors = null;
    let monitor = null;

    /* Here we use a "dumb" for loop, since we need to update
     * warnings if a filename didn't exist */
    for (let i = 0; i < filenamesToTry.length; ++i) {
        let file = Gio.File.new_for_path(filenamesToTry[i]);
        let loadWarnings, success;

        [descriptors, loadWarnings, success] = loadLessonDescriptorsFromFile(file);

        /* Concat the warnings anyway even if we weren't successful, since
         * the developer might still be interested in them. */
        warnings = warnings.concat(loadWarnings);

        /* If we were successful, then break here, otherwise try and load
         * the next file.
         *
         * Note that success is defined as "we were able to partially load
         * a file." */
        if (success) {
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
        descriptors = JSON.parse(Gio.resources_lookup_data("/com/endlessm/showmehow/data/lessons.json",
                                                           Gio.ResourceLookupFlags.NONE).get_data());
    }

    /* Add a "warnings" key to descriptors. */
    descriptors.warnings = warnings;
    return [descriptors, monitor];
}

const KNOWN_CLUE_TYPES = [
    "text",
    "image-path"
];

const _PIPELINE_FUNCS = {
    regex: regex_validator,
    shell: shell_executor_output,
    input: function(input) { return [input, []]; }
};


function _run_pipeline_step(pipeline, index, input, extras, done) {
    if (index === pipeline.length) {
        return done(input, extras);
    }

    const pipelineFunc = _PIPELINE_FUNCS[pipeline[index].type];
    const [output, funcExtras] = pipelineFunc(input, pipeline[index].value);
    return _run_pipeline_step(pipeline, index + 1, output, extras.concat(funcExtras), done);
}

function run_pipeline(pipeline, input, done) {
    return _run_pipeline_step(pipeline, 0, input, [], done);
}

const ShowmehowErrorDomain = GLib.quark_from_string("showmehow-error");
const ShowmehowErrors = {
    INVALID_TASK: 0,
    INVALID_TASK_SPEC: 1,
    INVALID_CLUE_TYPE: 2
};
const ShowmehowService = new Lang.Class({
    Name: "ShowmehowService",
    Extends: Showmehow.ServiceSkeleton,
    _init: function(props, descriptors, monitor) {
        this.parent(props);
        this._settings = new Gio.Settings({ schema_id: SHOWMEHOW_SCHEMA });
        this._descriptors = descriptors;
        this._monitor = monitor;

        /* Log the warnings, and also make them available to clients who are interested.
         *
         * XXX: For some odd reason, I'm not able to return "as" here and need to
         * return an array of structures in order to get this to work. */
        this._descriptors.warnings.forEach(w => log(w));
        this.connect("handle-get-warnings", Lang.bind(this, function(iface, method) {
            iface.complete_get_warnings(method, GLib.Variant.new("a(s)",
                                                                 this._descriptors.warnings.map(function(w, i) {
                return [w];
            })));
        }));
        this.connect("handle-get-unlocked-lessons", Lang.bind(this, function(iface, method, client) {
            /* We call addArrayUnique here to ensure that showmehow is always in the
             * list, even if the gsettings key messes up and gets reset to an
             * empty list. */
            let unlocked = addArrayUnique(this._settings.get_strv("unlocked-lessons"), [
                "showmehow",
                "intro"
            ]).map(l => {
                return lessonDescriptorMatching(l, this._descriptors);
            }).filter(d => {
                return d && d.available_to.indexOf(client) !== -1;
            }).map(d => [d.name, d.desc, d.entry]);

            iface.complete_get_unlocked_lessons(method, GLib.Variant.new("a(sss)", unlocked));
        }));
        this.connect("handle-get-known-spells", Lang.bind(this, function(iface, method, client) {
            /* Get all the lesson details for the "known" spells, eg, the ones the
             * user has already completed.
             */
            let ret = this._settings.get_strv("known-spells").map(l => {
                return lessonDescriptorMatching(l, this._descriptors);
            }).filter(d => {
                return d && d.available_to.indexOf(client) !== -1;
            }).map(d => [d.name, d.desc, d.entry]);
            iface.complete_get_known_spells(method, GLib.Variant.new("a(sss)", ret));
        }));
        this.connect("handle-get-task-description", Lang.bind(this, function(iface, method, lesson, task) {
            /* Return the descriptions for this task
             *
             * Note that in the specification file we allow a shorthand
             * to just specify that we want textual input, since it is
             * a very common case. Detect that here and turn it into
             * a JSON object representation that consumers can understand.
             */
            this._validateAndFetchTask(lesson, task, method, function(task_detail) {
                let input_spec;
                if (typeof task_detail.input === "string") {
                    input_spec = {
                        type: task_detail.input,
                        settings: {
                        }
                    };
                } else if (typeof task_detail.input === "object") {
                    input_spec = task_detail.input;
                } else {
                    method.return_error_literal(ShowmehowErrorDomain,
                                                ShowmehowErrors.INVALID_TASK_SPEC,
                                                "Can't have an input spec which " +
                                                "isn't either an object or a " +
                                                "string (error in processing " +
                                                JSON.stringify(task_detail.input) +
                                                ")");
                }

                iface.complete_get_task_description(method,
                                                    GLib.Variant.new("(ss)",
                                                                     [task_detail.task,
                                                                      JSON.stringify(input_spec)]));
            });
        }));
        this.connect("handle-attempt-lesson-remote", Lang.bind(this, function(iface,
                                                                              method,
                                                                              lesson,
                                                                              task,
                                                                              input_code) {
            this._validateAndFetchTask(lesson, task, method, Lang.bind(this, function(task_detail) {
                this._validateAndCreatePipeline(task_detail.mapper,
                                                method,
                                                "Couldn't run task " + task + " on lesson " + lesson,
                                                Lang.bind(this, function(pipeline) {
                    /* Run each step in the pipeline over the input and
                     * get a result code at the end. Each step should
                     * pass a string to the next function. */
                    run_pipeline(pipeline, input_code, Lang.bind(this, function(result, extras) {
                        /* Start to build up the response based on what is in extras */
                        let responses = [
                            {
                                type: "scroll_wait",
                                value: select_random_from(WAIT_MESSAGES)
                            }
                        ].concat(extras.filter(function(extra) {
                            return extra.type === "response";
                        }).map(function(extra) {
                            return extra.content;
                        }));

                        /* Take the result and run it through "effects" to
                         * determine what to do next.
                         */
                        if (Object.keys(task_detail.effects).indexOf(result) === -1) {
                            method.return_error_literal(ShowmehowErrorDomain,
                                                        ShowmehowErrors.INVALID_TASK_SPEC,
                                                        "Don't know how to handle response " +
                                                        result + " with effects " +
                                                        JSON.stringify(task_detail.effects, null, 2));
                        } else {
                            const effect = task_detail.effects[result];
                            if (effect.reply) {
                                if (typeof effect.reply === "string") {
                                    responses.push({
                                        type: "scrolled",
                                        value: effect.reply
                                    });
                                } else if (typeof effect.reply === "object") {
                                    responses.push(effect.reply);
                                } else {
                                    method.return_error_literal(ShowmehowErrorDomain,
                                                                ShowmehowErrors.INVALID_TASK_SPEC,
                                                                "Can't have an output spec which " +
                                                                "isn't either an object or a " +
                                                                "string (error in processing " +
                                                                JSON.stringify(effect.reply) +
                                                                ")");
                                }
                            }

                            if (effect.side_effects) {
                                effect.side_effects.map(Lang.bind(this, function(side_effect) {
                                    switch (side_effect.type) {
                                    case "shell":
                                        shell_executor(side_effect.value);
                                        break;
                                    case "unlock":
                                        {
                                            /* Get all unlocked tasks and this task's unlocks value and
                                             * combine the two together into a single set */
                                            let unlocked = this._settings.get_strv("unlocked-lessons");
                                            this._settings.set_strv("unlocked-lessons", addArrayUnique(unlocked, side_effect.value));
                                        }
                                        break;
                                    default:
                                        method.return_error_literal(ShowmehowErrorDomain,
                                                                    ShowmehowErrors.INVALID_TASK_SPEC,
                                                                    "Don't know how to handle side effect type " +
                                                                    side_effect.type + " in parsing (" +
                                                                    JSON.stringify(side_effect) + ")");
                                        break;
                                    }
                                }));
                            }

                            if (effect.completes_lesson) {
                                /* Add this lesson to the known-spells key */
                                let known = this._settings.get_strv("known-spells");
                                this._settings.set_strv("known-spells",
                                                        addArrayUnique(known, [lesson]));
                            }

                            const move_to = effect.move_to || (effect.completes_lesson ? "" : task);
                            iface.complete_attempt_lesson_remote(method,
                                                                 new GLib.Variant("(ss)",
                                                                                  [JSON.stringify(responses),
                                                                                   move_to]));
                        }
                    }));
                }));
            }));
        }));

        this.connect("handle-register-clue", Lang.bind(this, function(iface, method, type, clue) {
            try {
                this._registerClue(type, clue);
                iface.complete_register_clue(method);
            } catch (e) {
                method.return_error_literal(ShowmehowErrorDomain,
                                            ShowmehowErrors.INVALID_CLUE_TYPE,
                                            String(e));
                log(String(e));
                log(String(e.stack));
            }
        }));

        this.connect("handle-get-clues", Lang.bind(this, function(iface, method) {
            iface.complete_get_clues(method, this._settings.get_value("clues"));
        }));
        /* If we did have a monitor on the file, it means that we can notify clients
         * when a reload has happened. To do that, connect to the "changed" signal
         * and emit the "content-refreshed" signal when a change happens. Clients
         * should reset their internal state when this happens. */
        if (this._monitor) {
            this._monitor.connect('changed', Lang.bind(this, function(monitor, file, other, type) {
                if (type === Gio.FileMonitorEvent.CHANGED) {
                    log("Refreshing file " + file.get_parse_name());
                    let [descriptors, warnings, success] = loadLessonDescriptorsFromFile(file);

                    if (success) {
                        this._descriptors = descriptors;
                        this._descriptors.warnings = warnings;

                        this.emit_lessons_changed();
                    }
                }
            }));
        }
    },
    _validateAndFetchTask: function(lesson, task, method, success) {
        try {
            const lesson_detail = this._descriptors.filter(d => {
                return d.name === lesson;
            })[0];
            const task_detail_key = Object.keys(lesson_detail.practice).filter(k => {
                return k === task;
            })[0];
            const task_detail = lesson_detail.practice[task_detail_key];
            return success(task_detail);
        } catch(e) {
            return method.return_error_literal(ShowmehowErrorDomain,
                                               ShowmehowErrors.INVALID_TASK,
                                               "Either the lesson " + lesson +
                                               " or task id " + task +
                                               " was invalid\n" + e + " " + e.stack);
        }
    },
    _validateAndCreatePipeline: function(mappers, method, err_prefix, callback) {
        /* This function finds the executor and validator specified
         * and runs callback. If it can't find them, for instance, they
         * are invalid, it returns an error. */
        const pipeline = mappers.map(function(mapper) {
            if (typeof mapper === "string") {
                return {
                    type: mapper,
                    value: null
                };
            } else if (typeof mapper === "object") {
                return mapper;
            }

            return null;
        });

        const any_invalid = pipeline.some(function(mapper) {
            return !mapper || Object.keys(mapper).length !== 2 || mapper.type === undefined || mapper.value === undefined;
        });

        if (any_invalid) {
            method.return_error_literal(ShowmehowErrorDomain,
                                        ShowmehowErrors.INVALID_TASK_SPEC,
                                        err_prefix + ": " +
                                        "Invalid mapper definition (" +
                                        JSON.stringify(pipeline, null, 2) + ")");
        } else {
            callback(pipeline);
        }
    },
    _onPracticeCompleted: function(lesson, task, method) {
        let lesson_detail = this._descriptors.filter(d => d.name === lesson)[0];
        const success_side_effect = lesson_detail.practice[task].success_side_effect;

        /* Perform any side effects */
        if (success_side_effect) {
            let executor;

            try {
                executor = KNOWN_EXECUTORS[success_side_effect.executor];
            } catch (e) {
                method.return_error_literal(ShowmehowErrorDomain,
                                            ShowmehowErrors.INVALID_TASK_SPEC,
                                            err_prefix +
                                            ": Attempting to use executor " +
                                            executor_spec +
                                            " but no such executor exists");
            }

            executor(success_side_effect.command);
        }

        /* Unlock additional tasks if this task is the last one */
        if (task < lesson_detail.practice.length - 1) {
            return;
        }

        /* Get all unlocked tasks and this task's unlocks value and
         * combine the two together into a single set */
        let unlocks = this._descriptors.filter(d => d.name === lesson)[0].unlocks;
        let unlocked = this._settings.get_strv("unlocked-lessons");
        this._settings.set_strv("unlocked-lessons", addArrayUnique(unlocked, unlocks));

        /* Add this lesson to the known-spells key */
        let known = this._settings.get_strv("known-spells");
        this._settings.set_strv("known-spells", addArrayUnique(known, [lesson]));
    },
    _registerClue: function(type, content) {
        if (KNOWN_CLUE_TYPES.indexOf(type) === -1) {
            throw new Error("Tried to register clue of type " + type + " but " +
                            "the service does not know how to handle that type. " +
                            "Known clue types are " + KNOWN_CLUE_TYPES.join(" "));
        }

        let clues = this._settings.get_value("clues").deep_unpack();
        clues = addArrayUnique(clues, [[content, type]], function(v, array) {
            return array.filter(function(existingClue) {
                return existingClue[0] == v[0] &&
                       existingClue[1] == v[1];
            }).length === 0;
        });
        this._settings.set_value("clues", GLib.Variant.new("a(ss)", clues));
    }
});

/**
 * parseArguments
 *
 * Sadly, GOptionEntry is not supported by Gjs, so this is a poor-man's
 * option parser.
 *
 * This option parser is a simple "state machine" option parser. It just
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
        const isDoubleDash = arg.startsWith("--");
        if (isDoubleDash) {
            parsing = arg.slice(2);
        }

        const key = parsing || arg;
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
            argv[i + 1].startsWith("--")) {
            options[key].push(isDoubleDash ? !!arg : arg);
        }
    });

    return options;
}

const ShowmehowServiceApplication = new Lang.Class({
    Name: 'ShowmehowServiceApplication',
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
        const parsed = parseArguments(ARGV);
        try {
            this._commandLineFilename = parsed["lessons-file"][0];
        } catch (e) {
            this._commandLineFilename = null;
        }

        /* Must return -1 here to continue processing, otherwise
         * we will exit with a code */
        return -1;
    },
    vfunc_dbus_register: function(conn, object_path) {
        this.parent(conn, object_path);
        const [descriptors, monitor] = loadLessonDescriptors(this._commandLineFilename);
        this._skeleton = new ShowmehowService({
        }, descriptors, monitor);
        this._skeleton.export(conn, object_path);
        return true;
    },
    vfunc_dbus_unregister: function(conn, object_path) {
        if (this._skeleton) {
            this._skeleton.unexport();
        }
    }
});

let application = new ShowmehowServiceApplication({
    "application-id": "com.endlessm.Showmehow.Service",
    "flags": Gio.ApplicationFlags.IS_SERVICE |
             Gio.ApplicationFlags.HANDLES_COMMAND_LINE
});
application.run(ARGV);
