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

const Lang = imports.lang;

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

function regex_validator(result, regex) {
    return result.match(new RegExp(regex));
}

function other_command_regex_validator(result, spec) {
    const execution_result = execute_command_for_output(spec.command);
    return regex_validator(execution_result.stdout + "\n" + execution_result.stderr,
                           spec.output_regex);
}

/* Executing raw shellcode. What could possibly go wrong? */
function shell_executor(shellcode, environment) {
    return execute_command_for_output(["/bin/bash", "-c", shellcode + "; exit 0"],
                                      environment);
}

function shell_executor_output(shellcode, environment) {
    const result = shell_executor(shellcode, environment);
    return {
        validatable_output: result.stdout + "\n" + result.stderr,
        printable_output: result.stdout + "\n" + result.stderr
    };
}


const KNOWN_VALIDATORS = {
    "regex": regex_validator,
    "command": other_command_regex_validator
};

const KNOWN_EXECUTORS = {
    "shell": shell_executor_output
};


const ShowmehowErrorDomain = GLib.quark_from_string("showmehow-error");
const ShowmehowErrors = {
    INVALID_TASK: 0,
    INVALID_TASK_SPEC: 1
};
const ShowmehowService = new Lang.Class({
    Name: "ShowmehowService",
    Extends: Showmehow.ServiceSkeleton,
    _init: function(props) {
        this.parent(props);
        this._settings = new Gio.Settings({ schema_id: SHOWMEHOW_SCHEMA });
        /* This isn't the preferable way of doing it, though it seems like resource
         * paths are not working, at least not locally */
        this._descriptors = JSON.parse(Gio.resources_lookup_data("/com/endlessm/showmehow/data/lessons.json",
                                                                 Gio.ResourceLookupFlags.NONE).get_data());
        this.connect("handle-get-unlocked-lessons", Lang.bind(this, function(iface, method) {
            /* An immediately invoked function expression to extract the relevant
             * useful information from a lesson descriptor without extracting
             * everything all at once. */
            let ret = this._settings.get_strv("unlocked-lessons").map(l => (d => {
                return [d.name, d.desc, d.practice.length, d.done];
            })(this._descriptors.filter(d => d.name === l)[0]));
            iface.complete_get_unlocked_lessons(method, GLib.Variant.new("a(ssis)", ret));
        }));
        this.connect("handle-get-task-description", Lang.bind(this, function(iface, method, lesson, task) {
            /* Return the descriptions for this task */
            this._validateAndFetchTask(lesson, task, method, function(task_detail) {
                iface.complete_get_task_description(method,
                                                    GLib.Variant.new("(sss)",
                                                                     [task_detail.task,
                                                                      task_detail.success,
                                                                      task_detail.fail]));
            });
        }));
        this.connect("handle-attempt-lesson-remote", Lang.bind(this, function(iface,
                                                                              method,
                                                                              lesson,
                                                                              task,
                                                                              input_code) {
            this._validateAndFetchTask(lesson, task, method, Lang.bind(this, function(task_detail) {
                this._attemptLesson("shell",
                                    task_detail.expected.type,
                                    method,
                                    "Couldn't run task " + task + " on lesson " + lesson,
                                    function(executor, validator) {
                    const result = executor(input_code, task_detail.environment);
                    const success = validator(result.validatable_output,
                                              task_detail.expected.value);
                    const wait_message = select_random_from(WAIT_MESSAGES);
                    iface.complete_attempt_lesson_remote(method,
                                                         GLib.Variant.new("(ssb)",
                                                                          [wait_message,
                                                                           result.printable_output,
                                                                           success]));
                });
            }));
        }));
    },
    _validateAndFetchTask: function(lesson, task, method, success) {
        try {
            let task_detail = this._descriptors.filter(d => d.name === lesson)[0].practice[task];
            return success(task_detail);
        } catch(e) {
            return method.return_error_literal(ShowmehowErrorDomain,
                                               ShowmehowErrors.INVALID_TASK,
                                               "Either the lesson " + lesson +
                                               " or task number " + task +
                                               " was invalid\n" + e);
        }
    },
    _attemptLesson: function(executor_spec, validator_spec, method, err_prefix, callback) {
        /* This function finds the executor and validator specified
         * and runs callback. If it can't find them, for instance, they
         * are invalid, it returns an error. */
        let executor, validator;

        try {
            executor = KNOWN_EXECUTORS[executor_spec];
        } catch (e) {
            method.return_error_literal(ShowmehowErrorDomain,
                                        ShowmehowErrors.INVALID_TASK_SPEC,
                                        err_prefix +
                                        ": Attempting to use executor " +
                                        executor_spec +
                                        " but no such executor exists");
        }

        try {
            validator = KNOWN_VALIDATORS[validator_spec];
        } catch (e) {
            method.return_error_literal(ShowmehowErrorDomain,
                                        ShowmehowErrors.INVALID_TASK_SPEC,
                                        err_prefix +
                                        ": Attempting to use validator " +
                                        validator_spec +
                                        " but no such validator exists");
        }

        return callback(executor, validator);
    }
});

let loop = GLib.MainLoop.new(null, false);
Gio.bus_own_name(Gio.BusType.SESSION,
                 "com.endlessm.Showmehow.Service",
                 Gio.BusNameOwnerFlags.ALLOW_REPLACEMENT |
                 Gio.BusNameOwnerFlags.REPLACE,
                 function(conn, name) {
                     let manager = Gio.DBusObjectManagerServer.new("/com/endlessm/Showmehow");
                     let obj = Showmehow.ObjectSkeleton.new("/com/endlessm/Showmehow/Service");
                     obj.set_service(new ShowmehowService());
                     manager.export(obj);
                     manager.set_connection(conn);
                 },
                 null,
                 null);
loop.run();
                 
