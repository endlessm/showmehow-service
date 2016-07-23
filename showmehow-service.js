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

function read_file_contents(path) {
    const cmdlineFile = Gio.File.new_for_path(path);
    const [ok, contents, etag] = cmdlineFile.load_contents(null);
    return contents;
}

function execute_command_for_output(argv) {
    const [ok, stdout, stderr, status] = GLib.spawn_sync(null, argv, null, 0, null);
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

const ShowmehowErrorDomain = GLib.quark_from_string("showmehow-error");
const ShowmehowErrors = {
};
const ShowmehowService = new Lang.Class({
    Name: "ShowmehowService",
    Extends: Showmehow.ServiceSkeleton,
    _init: function(props) {
        this.parent(props);
    },
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
                 
