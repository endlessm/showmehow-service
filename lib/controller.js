// lib/controller.js
//
// Copyright (c) 2016-2017 Endless Mobile Inc.
//
// This file contains the ShowmehowController class - the class that
// responds to events coming from the DBUS service.
///

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Showmehow = imports.gi.Showmehow;

const Lang = imports.lang;

const Descriptors = imports.lib.descriptors;
const Service = imports.lib.service;
const Config = imports.lib.config;

function environment_object_to_envp(environment) {
    if (environment) {
        return Object.keys(environment)
                     .map(key => key + '=' + environment[key]);
    } else {
        return null;
    }
}

function environment_as_object() {
    let environment = {};
    GLib.listenv().forEach(key => environment[key] = GLib.getenv(key));
    return environment;
}

function execute_command_for_output(argv, user_environment={}, workingDirectory=null) {
    let environment = environment_as_object();
    Object.keys(user_environment).forEach(key => {
        environment[key] = user_environment[key];
    });

    let [ok, stdout, stderr, status] = GLib.spawn_sync(workingDirectory,
                                                       argv,
                                                       environment_object_to_envp(environment),
                                                       0,
                                                       null);

    if (!ok) {
        GLib.spawn_check_exit_status(status);
        throw new Error('Failed to execute: ' + argv.join(' ') + ', no error ' +
                        'message was set');
    }

    return {
        status: status,
        stdout: String(stdout),
        stderr: String(stderr)
    };
}

function spawnProcess(binary, argv=[], user_environment={}) {
    let environment = environment_as_object();
    Object.keys(user_environment).forEach(key => {
        environment[key] = user_environment[key];
    });

    let launcher = new Gio.SubprocessLauncher({
        flags: Gio.SubprocessFlags.STDIN_PIPE |
               Gio.SubprocessFlags.STDOUT_PIPE |
               Gio.SubprocessFlags.STDERR_PIPE
    });

    let envp = environment_object_to_envp(environment);
    launcher.set_environ(envp);
    let proc = launcher.spawnv([binary].concat(argv));

    return {
        proc: proc,
        stdin: proc.get_stdin_pipe(),
        stdout: proc.get_stdout_pipe(),
        stderr: proc.get_stderr_pipe()
    };
}


const PROLOGUES = {
    python: function(id) {
        return 'from gi.repository import Gio\n' +
               'application = Gio.Application.new("com.endlessm.Showmehow.Showmehow' + id + '", 0)\n' +
               'def activate(argv):\n' +
               '    from code import InteractiveConsole\n' +
               '    InteractiveConsole(locals=globals()).interact(banner="")\n' +
               '\n' +
               'application.connect("activate", activate)\n' +
               'application.run()\n';
    }
}

function matches_configured_regex(input, settings) {
    let settingsObject = typeof settings === 'object';
    let regex =  settingsObject ? settings.expression : settings;
    let mode = settingsObject ? (settings.single_line ? 'i' : 'mi') : 'mi';

    log("Matching: " + JSON.stringify([regex, mode, input]));

    // Case insensitive and multi-line unless requested
    if (input.match(new RegExp(regex, mode)) !== null) {
        log("Matching success");
        return true;
    }

    log("Matching failure");
    return false;
}

const InteractiveShell = new Lang.Class({
    Name: 'InteractiveShell',

    _init: function(binary, id, argv=[], user_environment={}) {
        this.parent();
        this._process = spawnProcess(binary, argv, user_environment);
        this.id = id;

        // Drain the standard output and error streams
        Showmehow.read_nonblock_input_stream_for_bytes(this._process.stdout);
        Showmehow.read_nonblock_input_stream_for_bytes(this._process.stderr);
    },

    // Validate input and write the result back to the stream
    evaluate: function(input, untilMatchStdout, untilMatchStderr, repeatTimes) {
        let stdout = '';
        let stderr = '';

        // Write the input we intend to evaluate
        this._process.stdin.write_all(input + '\n', null);

        // Repeat a maximum of repeatTimes times - we can't keep
        // checking against our regexes forever since this may be
        // a failure case, but we should keep checking for a little
        // while to match the successful case
        while (repeatTimes--) {
            // We give the shell 300ms to write its output
            GLib.usleep(GLib.USEC_PER_SEC * 0.3);

            // Once we're done, read the standard out for
            // the result and see if we need to read more
            let stdout_bytes = Showmehow.read_nonblock_input_stream_for_bytes(this._process.stdout);
            let stderr_bytes = Showmehow.read_nonblock_input_stream_for_bytes(this._process.stderr);

            stdout += String(stdout_bytes.get_data());
            stderr += String(stderr_bytes.get_data());

            // Nothing to check, we can get out now
            if (untilMatchStdout == null && untilMatchStderr == null)
                break;

            // Check if either one of our regex configurations
            // matches. If so we can get out now, if not, we need
            // to read some more output
            if (untilMatchStdout && matches_configured_regex(stdout, untilMatchStdout))
                break;

            if (untilMatchStderr && matches_configured_regex(stderr, untilMatchStderr))
                break;
        }

        return {
            stdout,
            stderr
        };
    },

    kill: function() {
        this._process.proc.force_exit();
    }
});             

// These overrides set up the runtimes so that we get unbuffered input and
// are able to interact just be sending data to the standard input and
// output
const RUNTIME_ARGV = {
    // Note that here we need to call `import code; code.InteractiveConsole` etc. This is
    // due to the way that python behaves when the standard out is not a tty device.
    // InteractiveConsole has slightly different and more acceptable behaviour. We need to
    // use it here despite the fact that we also do it in the prologue, since it is
    // needed to ensure that the prologue code is actually evaluated in the first place.
    python: ['-u', '-c', 'import code; code.InteractiveConsole(locals=globals()).interact(banner="")']
};
const RUNTIME_BINARIES = {
    python: 'python3'
};

// createInteractiveShellFor
//
// Creates a new InteractiveShell instance for the given runtime
// and environment. Will do what is required to set up that runtime so that
// it works correctly with the lessons we will run in showmehow (for instance
// in python, sets up a GApplication instance).
function createInteractiveShellFor(runtime, id, user_environment={}) {
    let shell = new InteractiveShell(GLib.find_program_in_path(RUNTIME_BINARIES[runtime] ||
                                                               runtime),
                                     id,
                                     RUNTIME_ARGV[runtime] || [],
                                     user_environment);
    if (PROLOGUES[runtime]) {
        shell.evaluate(PROLOGUES[runtime](id), null, null, 1);
    }
    return shell;
}

function select_random_from(array) {
    return array[Math.floor(Math.random() * array.length)];
}

const WAIT_MESSAGES = [
    'Wait for it',
    'Combubulating transistors',
    'Adjusting for combinatorial flux',
    'Hacking the matrix',
    'Exchanging electrical bits',
    'Refuelling source code',
    'Fetching arbitrary refs',
    'Resolving mathematical contradictions',
    'Fluxing liquid input'
];

function regex_validator(input, settings) {
    return [
        matches_configured_regex(input, settings) ? 'success': 'failure',
        []
    ];
}

function resolve_path(path) {
    // If it is an object, it might be relative to some data directory
    if (typeof path === 'object') {
        // Assume that it has this shape
        switch (path.settings.type) {
            case 'in_data_directory':
                return GLib.build_filenamev([workingDirectoryFor(path.settings.value),
                                             path.name]);
            default:
                throw new Error('Don\'t know how to handle path type ' + key);
        }
    }

    if (path.startsWith('~')) {
        // Even if we're running with an overridden HOME, this should work
        // fine, considering that HOME is set before gjs is started
        return GLib.build_filenamev([GLib.get_home_dir(), path.slice(1)]);
    }

    return path;
}

function check_directory_exists(input, directory) {
    let file_object = Gio.File.new_for_path(resolve_path(directory));
    try {
        if (file_object.query_info('standard::type',
                                   Gio.FileQueryInfoFlags.NONE,
                                   null).get_file_type() === Gio.FileType.DIRECTORY) {
            return ['success', []];
        } else {
            return ['failure', []];
        }
    } catch (e) {
        logError(e, 'Failed to get directory');
        return ['failure', []];
    }
}

function check_file_exists(input, file) {
    let file_object = Gio.File.new_for_path(resolve_path(file));
    try {
        if (file_object.query_info('standard::type',
                                   Gio.FileQueryInfoFlags.NONE,
                                   null).get_file_type() == Gio.FileType.REGULAR) {
            return ['success', []];
        } else {
            return ['failure', []];
        }
    } catch (e) {
        logError(e, 'Failed to get file');
        return ['failure', []];
    }
}

function check_file_contents(input, settings) {
    let file_object = Gio.File.new_for_path(resolve_path(settings.path));
    let ok, contents;

    try {
        [ok, contents] = GLib.file_get_contents(resolve_path(settings.path));
    } catch (e) {
        return ['failure', []];
    }

    return [String(contents).trim() === settings.value ? 'success': 'failure', []];
}

// copyDirectoryWithoutOverwriting
//
// This function will copy the directory source to a
// directory called destination without overwriting the
// destination directory, recursively.
//
// We have this function here because Gio.File.prototype.copy
// does not recursively copy directories, instead preferring
// for the programmer to implement their own strategy.
function copyDirectoryWithoutOverwriting(source, destination) {
    // Attempt to copy the first over the second, but don't allow for
    // overwrites. If it fails, it means we already have files there
    // and shouldn't continue.
    //
    // If it fails because of G_IO_ERROR_WOULD_RECURSE, create the
    // relevant directory and enumerate the children, adding them
    // to the copy queue.
    let copyQueue = [source];
    let parent = source.get_parent();
    while (copyQueue.length) {
        let toCopy = copyQueue.shift();
        // Get the relevant component to source and then append that
        // to destination, creating a new GFile.
        let relPath = parent.get_relative_path(toCopy) || '';
        let copyTo = destination.resolve_relative_path(relPath);

        try {
            toCopy.copy(copyTo, Gio.FileCopyFlags.NONE, null, null);
        } catch (e) {
            if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.WOULD_RECURSE)) {
                // Nope, this is a directory, make the directory if
                // possible and then enumerate the children and
                // add them to the copy queue.
                try {
                    copyTo.make_directory(null);
                } catch (e if e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS)) {
                     // Nope, maybe it already exists. If it does,
                     // that's fine, just keep going.
                }
            } else if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.WOULD_MERGE) ||
                       e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS)) {
                // Ignore this error, all we have to do is
                // enumerate the files.
            } else {
                // This is an error we can't ignore. Rethrow.
                throw new Error(`Error copying file ${toCopy.get_path()}: ${e}\n${e.stack || ''}`);
            }

            // Now that we're done error-handling, enumerate the
            // children and create GFile instances for each of them,
            // adding them to the back of copyQueue.
            let enumerator = null;
            try {
                enumerator = toCopy.enumerate_children('standard::name',
                                                       Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
                                                       null);
            } catch (e if e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_DIRECTORY)) {
                continue;
            }

            let childInfo = null;
            while ((childInfo = enumerator.next_file(null))) {
                copyQueue.push(enumerator.get_child(childInfo));
            }
        }
    }
}

// sourceFilesDirectoryFor
//
// Gets a path to 'source' files, (files to copy from) for a given
// dataDirectory, that may be used for a given task. This can be
// overridden at runtime by the use of the CODING_SOURCE_FILES_DIR
// variable.
function sourceFilesDirectoryFor(dataDirectory) {
    let overidden = GLib.getenv('CODING_SOURCE_FILES_DIR');
    let toplevel = overidden ? overidden : Config.coding_files_dir;

    return GLib.build_filenamev([
        toplevel,
        dataDirectory
    ]);
}

// targetFilesDirectory
//
// Gets a path in which to place the files for a given lesson once
// that lesson is started. By default this is in the user's home
// directory, but this can be overridden with the use of the
// CODING_TARGET_FILES_DIR variable.
function targetFilesDirectory(dataDirectory) {
    let overidden = GLib.getenv('CODING_TARGET_FILES_DIR');
    return overidden ? GLib.build_filenamev([overidden, dataDirectory]) : GLib.build_filenamev([
        GLib.get_user_config_dir(),
        'com.endlessm.ShowmehowService',
        'data_directories',
        dataDirectory
    ]);
}

// workingDirectoryFor
//
// This function will check if a copy of dataDirectory has been made in
// XDG_CONFIG_HOME/com.endlessm.ShowmehowService/data_directories and
// if not create it, copying files from the installed data into that
// directory.
//
// This allows lessons to direct mutation of files in that directory.
//
// TODO: This should be per-session on the connnection level, so that
// multiple uses of the service can't interfere with each other. For now
// none of the lessons mutate the data, so this should be fine.
function workingDirectoryFor(dataDirectory) {
    let dataDirectoryPath = Gio.File.new_for_path(sourceFilesDirectoryFor(dataDirectory));
    let configHomePath = Gio.File.new_for_path(targetFilesDirectory(dataDirectory));
    let configHomeServicePath = configHomePath.get_parent();

    // Make sure to make this directory first
    try {
        configHomeServicePath.make_directory_with_parents(null);
    } catch (e if e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS)) {
    }

    // Make a local copy, without overwriting
    copyDirectoryWithoutOverwriting(dataDirectoryPath, configHomeServicePath);

    // Now, once we're done, return the path to the working directory
    return configHomePath.get_path();
}

// Executing raw shellcode. What could possibly go wrong?
function shell_executor(shellcode,
                        session,
                        runtime,
                        environment,
                        workingDirectory,
                        untilMatchStdout,
                        untilMatchStderr,
                        repeatTimes) {
    // Note that at least for now, we don't support per-command environment
    // variables in sessions - only in cases where the session is not set
    if (!environment)
        environment = environment_as_object();
    if (Object.keys(environment).indexOf('CODING_FILES_DIR') === -1)
        environment.CODING_FILES_DIR = Config.coding_files_dir;
    if (Object.keys(environment).indexOf('CODING_SHARED_SCRIPT_DIR') === -1)
        environment.CODING_SHARED_SCRIPT_DIR = Config.coding_shared_script_dir;

    if (session) {
        // TODO: Right now the session support doesn't support working directories
        // or environment variables since those are set from GSubprocessLauncher as
        // one-per-process, but we could just execute some shellcode here to change
        // the working directory or environment variables as required.
        return session[runtime].evaluate(shellcode,
                                         untilMatchStdout,
                                         untilMatchStderr,
                                         repeatTimes);
    } else {
        return execute_command_for_output(['/bin/bash', '-c', shellcode + '; exit 0'],
                                          environment,
                                          workingDirectory);
    }
}


function _shell_executor_parse_gsettings_hook(input, hook_settings) {
    // If the input matches the format 'gsettings action schema key value'
    // then accept the input and attempt to change values from there.
    let matches = input.trim().match(/gsettings (\w+)\s+([^\s]+)\s+([^\s]+)\s+(.+)/);
    if (matches === null) {
        matches = input.trim().match(/gsettings (\w+)\s+([^\s]+)\s+([^\s]+)/);
    }

    if (matches === null) {
        return null;
    }

    let [action, schema, key] = matches.slice(1);
    let settings = new Gio.Settings({ schema: schema });

    switch (action) {
        case 'set':
            {
                // Sanity check, make sure that we picked the first regex
                // and not the second
                if (matches.length != 5) {
                    return null;
                }

                // gsettings, action, schema, key, value
                let value = matches[4];
                let escapedValue = value.replace(/'/g, '"');

                // First try to parse the value using JSON.parse, but if
                // that doesn't work, put it in quotes, or remove quotes,
                // then try again
                let parsed = null;
                try {
                    parsed = JSON.parse(escapedValue);
                } catch (e) {
                    if (!(e instanceof SyntaxError)) {
                        throw e;
                    }

                    try {
                        if (escapedValue.match(/^"(.*)"$/)) {
                            parsed = JSON.parse(escapedValue.slice(1, escapedValue.length - 1));
                        } else {
                            parsed = JSON.parse("\"" + escapedValue + "\"");
                        }
                    } catch (e) {
                        if (!(e instanceof SyntaxError)) {
                            throw e;
                        }

                        // Failed again. At this point there is not a lot
                        // we can do to parse the value, so just pass it
                        // directly to gsettings
                        return null
                    }
                }

                try {
                    settings.set_value(key, new GLib.Variant(hook_settings.variant_type,
                                                             parsed));
                    return 'Set ' + schema + ' ' + key + ' to value ' + value;
                } catch (e) {
                    return ('Error in setting ' + schema + ' ' + key +
                            ' to value ' + value + ': ' + String(e));
                }
            }
        case 'get':
            return JSON.stringify(settings.get_value(key).deep_unpack());
        default:
            return null;
    }
}


const _SHELL_EXECUTOR_HOOKS = {
    'parse_gsettings': _shell_executor_parse_gsettings_hook
};



function shell_executor_output(shellcode, session, settings) {
    let dataDirectory = settings ? settings.in_data_directory : null;
    let runtime = settings ? settings.runtime : null;

    // Run the prologue for this task
    if (settings && settings.before) {
        shell_executor(settings.before,
                       session,
                       runtime ? runtime : 'bash',
                       settings ? settings.environment : {},
                       dataDirectory ? workingDirectoryFor(dataDirectory) :
                                       null,
                       null,
                       null,
                       1);
    }

    // If there's a hook available, try running that, otherwise pass
    // the input directly to the shell.
    //
    // The reason we have this is that we might want to capture
    // certain commands and pretend that they were run through
    // the shell, but in fact run internally. This allows us to
    // ensure that during tests, GSettings changes are not set
    // systemwide.
    if (settings && settings.hook) {
        let result = _SHELL_EXECUTOR_HOOKS[settings.hook](shellcode, settings.hook_settings);
        if (result !== null) {
            return [result, []];
        }
    }

    let result = shell_executor(shellcode,
                                session,
                                runtime ? runtime : 'bash',
                                settings ? settings.environment : {},
                                dataDirectory ? workingDirectoryFor(dataDirectory) :
                                                null,
                                settings ? settings.until_match_stdout : null,
                                settings ? settings.until_match_stderr : null,
                                settings ? (settings.repeat_times || 1) : 1);
    return [result.stdout + '\n' + result.stderr, []];
}

function shell_custom_executor_output(shellcode, session, settings) {
    if (typeof settings.command !== 'string') {
        throw new Error('shell_custom_executor_output: settings.command ' +
                        'must be a string. settings is ' +
                        JSON.stringify(settings, null, 2));
    }
    return shell_executor_output(settings.command, session, settings);
}

function add_raw_output(input) {
    return [input, [
        {
            type: 'response',
            content: {
                'type': 'raw',
                'value': input
            }
        }
    ]];
}

function add_wrapped_output(input) {
    return [input, [
        {
            type: 'response',
            content: {
                'type': 'wrapped',
                'value': input
            }
        }
    ]];
}

function add_wait_message(input) {
    return [input, [
        {
            type: 'response',
            content: {
                'type': 'scroll_wait',
                value: select_random_from(WAIT_MESSAGES)
            }
        }
    ]];
}

function parse_json(input) {
    try {
        return [JSON.parse(input), []];
    } catch (e) {
        return [[], ['> That data wasn\'t JSON: ' + input]]
    }
}

// json_traverse_recurse
//
// Descend into an object by checking each of its keys. This only
// works for objects and doesn't work for arrays right now.
function json_traverse_recurse(object, path_remaining) {
    if (path_remaining.length === 0) {
        return object;
    }

    let next = path_remaining.slice(1);
    let key = path_remaining[0];

    try {
        return json_traverse_recurse(object[key], next);
    } catch (e) {
        return ''
    }
}

// json_pluck
//
// Pluck a value out of each member of an array of objects.
function json_pluck(input, path) {
    return [input.map(function(o) {
        return json_traverse_recurse(o, path.split('/'));
    }), []];
}

function equal_to(input, value) {
    // This is evil, but works until we need proper checking here
    return [JSON.stringify(input) === JSON.stringify(value) ? 'success': 'failure', []];
}

function is_subset(input, value) {
    let inputAsSet = new Set(input);
    return [value.every(function(e) {
        return inputAsSet.has(e);
    }) ? 'success' : 'failure', []];
}

function regex_replace(input, value) {
    let regex = new RegExp(value.regex, value.flags);
    return input.replace(regex, value.replace);
}

// From http://stackoverflow.com/questions/3446170/escape-string-for-use-in-javascript-regex
function regex_escape(input) {
    return input.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
}

const _VALUE_TRANSFORMERS = {
    regex_replace: regex_replace,
    regex_escape: regex_escape
}

function apply_transformations(input, transformations) {
    return transformations.reduce(function(value, transformer) {
        if (typeof transformer === 'string') {
            return _VALUE_TRANSFORMERS[transformer](value);
        } else {
            return _VALUE_TRANSFORMERS[transformer.type](value,
                                                         transformer.value);
        }
    }, input);
}

function matches_environment(input, value) {
    let environmentValue = GLib.getenv(value.variable);
    let matcher = _PIPELINE_FUNCS[value.matcher.type];

    if (value.transform) {
        environmentValue = apply_transformations(environmentValue,
                                                 value.transform);
    }

    return matcher(input.trim(),
                   value.matcher.value.replace(/@VARIABLE@/g,
                                               environmentValue));
}

// lessonDescriptorMatching:
//
// Given a lesson name and lesson descriptors, return
// the lesson descriptor.
//
function lessonDescriptorMatching(lesson, descriptors) {
    // An immediately invoked function expression to extract the relevant
    // useful information from a lesson descriptor without extracting
    // everything all at once.
    let matches = descriptors.filter(d => d.name === lesson);

    if (matches.length !== 1) {
        log('Expected only a single match from ' + lesson +
            ' but there were ' + matches.length + ' matches');
        return null;
    }

    return matches[0];
}


const _PIPELINE_FUNCS = {
    regex: regex_validator,
    input: function(input) { return [input, []]; },
    raw_output: add_raw_output,
    wait_message: add_wait_message,
    wrapped_output: add_wrapped_output,
    check_dir_exists: check_directory_exists,
    check_file_exists: check_file_exists,
    check_file_contents: check_file_contents,
    parse_json: parse_json,
    pluck_path: json_pluck,
    equal_to: equal_to,
    is_subset: is_subset,
    matches_environment: matches_environment
};


function _run_pipeline_step(pipeline, index, input, extras, done) {
    if (index === pipeline.length) {
        return GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, function() {
            done(input, extras);
            return GLib.SOURCE_REMOVE;
        });
    }

    let [output, funcExtras] = pipeline[index](input);
    return _run_pipeline_step(pipeline,
                              index + 1,
                              output,
                              extras.concat(funcExtras),
                              done);
}

function run_pipeline(pipeline, input, done) {
    return _run_pipeline_step(pipeline, 0, input, [], done);
}

const _CUSTOM_PIPELINE_CONSTRUCTORS = {
    check_external_events: function(mapper, service, session, lesson, task) {
        let lessonSatisfiedStatus = service._pendingLessonEvents[lesson][task];
        return function() {
            // We need to figure out which output to map to here. It should
            // not be possible for a given set of inputs to match two outputs,
            // - one should always be a subset of another
            let satisfiedOutputs = Object.keys(lessonSatisfiedStatus.outputs).filter(function(key) {
                // Return true if every event was satisfied
                let spec = lessonSatisfiedStatus.outputs[key];
                return Object.keys(spec.events).every(function(key) {
                    spec.events[key] = spec.events[key];
                    return spec.events[key];
                });
            });

            let event = satisfied_external_event_output_with_largest_subset(satisfiedOutputs,
                                                                              lessonSatisfiedStatus);
            return [event.name, []];
        };
    },
    shell: function(mapper, service, session, lesson, task) {
        return function(input) {
            return shell_executor_output(input, session, mapper.value);
        }
    },
    shell_custom: function(mapper, service, session, lesson, task) {
        return function(input) {
            return shell_custom_executor_output(input, session, mapper.value);
        }
    }
};

function mapper_to_pipeline_step(mapper, service, session, lesson, task) {
    let invalid = (!mapper ||
                   Object.keys(mapper).length !== 2 ||
                   mapper.type === undefined ||
                   mapper.value === undefined);

    if (invalid) {
        throw new Error('Invalid mapper definition (' +
                        JSON.stringify(mapper, null, 2) + ')');
    }

    if (_CUSTOM_PIPELINE_CONSTRUCTORS[mapper.type]) {
        return _CUSTOM_PIPELINE_CONSTRUCTORS[mapper.type](mapper, service, session, lesson, task);
    }

    return function(input) {
        return _PIPELINE_FUNCS[mapper.type](input, mapper.value);
    };
}

// determineRuntimesNeededForLesson
//
// Look up the lesson in descriptors and examine each of the tasks
// to determine what runtimes, if any, are required. If none are required
// then return null and the caller should handle this appropriately
function determineRuntimesNeededForLesson(descriptors, lesson) {
    let lessonDetail = lessonDescriptorMatching(lesson, descriptors);
    if (!lessonDetail.requires_session) {
        return null;
    }

    // By default, if one of the mappers is 'shell' and a runtime is
    // not specified, then add the 'bash' runtime. Otherwise add
    // the specified runtime.
    let runtimes = new Set();
    Object.keys(lessonDetail.practice).forEach(function(taskKey) {
        let task = lessonDetail.practice[taskKey];
        task.mapper.forEach(function(mapper) {
            if (mapper === 'shell') {
                runtimes.add('bash');
            } else if (typeof mapper === 'object' &&
                       mapper.type.startsWith('shell') &&
                       typeof mapper.value === 'object' &&
                       mapper.value.runtime) {
                runtimes.add(mapper.value.runtime);
            }
        });
    });

    if (runtimes.size) {
        return [...runtimes];
    }

    return null;
}

var ShowmehowController = new Lang.Class({
    Name: 'ShowmehowController',

    _init: function(descriptors, monitor, remoteService) {
        this.parent();

        this._descriptors = descriptors;
        this._monitor = monitor;
        this._pendingLessonEvents = {};
        this._remoteService = remoteService;

        this._remoteService.assignResponders({
            fetchWarnings: Lang.bind(this, function() {
                return this._descriptors.warnings;
            }),
            openSession: Lang.bind(this, this._openSession),
            closeSession: Lang.bind(this, this._closeSession),
            attemptLessonWithInput: Lang.bind(this, this._attemptLessonWithInput)
        });

        // Log the warnings, and also make them available to clients who are interested.
        //
        // XXX: For some odd reason, I'm not able to return 'as' here and need to
        // return an array of structures in order to get this to work.
        this._descriptors.warnings.forEach(w => log(w));

        // If we did have a monitor on the file, it means that we can notify clients
        // when a reload has happened. To do that, connect to the 'changed' signal
        // and emit the 'content-refreshed' signal when a change happens. Clients
        // should reset their internal state when this happens.
        if (this._monitor) {
            this._monitor.connect('changed', Lang.bind(this, function(monitor, file, other, type) {
                if (type === Gio.FileMonitorEvent.CHANGED) {
                    let [descriptors, warnings] = Descriptors.loadLessonDescriptorsFromFile(file);

                    if (descriptors) {
                        this._descriptors = descriptors;
                        this._descriptors.warnings = warnings;

                        this.notifyClientsOfDescriptorChange();
                    }
                }
            }));
        }
        this._sessions = {};
        this._sessionCount = 0;
    },

    _openSession: function(forLesson) {
        this._sessionCount++;
        this._sessions[this._sessionCount] = {};

        let runtimesRequired = determineRuntimesNeededForLesson(this._descriptors,
                                                                forLesson);
        if (runtimesRequired) {
            runtimesRequired.forEach(Lang.bind(this, function(r) {
                this._sessions[this._sessionCount][r] = createInteractiveShellFor(r, this._sessionCount, {});
            }));
            return this._sessionCount;
        }

        return -1;
    },

    _closeSession: function(id) {
        Object.keys(this._sessions[id]).forEach(Lang.bind(this, function(key) {
            this._sessions[id][key].kill();
        }));
    },

    _attemptLessonWithInput: function(session_id, lesson, task, input_code, onError, done) {
        let taskDetail = null;
        try {
            taskDetail = this._validateAndFetchTask(lesson, task);
        } catch (e) {
            onError(Service.ErrorDomain,
                    Service.Errors.INVALID_TASK,
                    'Either the lesson ' + lesson + ' or task id ' + task +
                    ' was invalid\n' + e + ' ' + e.stack);
            return;
        }

        let pipeline = null;
        try {
            let mapper = taskDetail.mapper;
            let session = this._sessions[session_id] || null;
            pipeline = this._getPipeline(mapper, session, lesson, task);
        } catch (e) {
            onError(Service.ErrorDomain,
                    Service.Errors.INVALID_TASK_SPEC,
                    'Couldn\'t run task ' + task + ' on lesson ' + lesson + ': ' +
                    'Couldn\'t create pipeline: ' +
                    String(e) + e.stack);
            return;
        }

        run_pipeline(pipeline, input_code, Lang.bind(this, function(result, extras) {
            // Start to build up the response based on what is in extras
            let responses = extras.filter(function(extra) {
                return extra.type === 'response';
            }).map(function(extra) {
                return extra.content;
            });

            done({
                result: result,
                responses: responses
            });
        }));
    },

    _validateAndFetchTask: function(lesson, task) {
        let lesson_detail = lessonDescriptorMatching(lesson, this._descriptors);
        let task_detail_key = Object.keys(lesson_detail.practice).filter(k => {
            return k === task;
        })[0];
        return lesson_detail.practice[task_detail_key];
    },

    _getPipeline: function(mappers, session, lesson, task) {
        // This function finds the executor and validator specified
        // and returns it. If it can't find them, for instance, they
        // are invalid, it throws an error.
        return mappers.map(Lang.bind(this, function(mapper) {
            if (typeof mapper === 'string') {
                return mapper_to_pipeline_step({
                    type: mapper,
                    value: ''
                }, this, session, lesson, task);
            } else if (typeof mapper === 'object') {
                return mapper_to_pipeline_step(mapper, this, session, lesson, task);
            }

            throw new Error('mapper must be a either a string or ' +
                            'or an object, got ' + JSON.stringify(mapper));
        }));
    }
});

