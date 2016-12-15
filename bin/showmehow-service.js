#!/usr/bin/env gjs
// showmehow-service.js
//
// Copyright (c) 2016 Endless Mobile Inc.
// All Rights Reserved.
//
// The Showmehow service is the central place where all 'lessons' about
// the operating system are stored and progress is kept.


const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Showmehow = imports.gi.Showmehow;

// This is a hack to cause Showmehow js resources to get loaded
const ShowmehowResource = imports.gi.Showmehow.get_resource();  // eslint-disable-line no-unused-vars

const Lang = imports.lang;

// Put ourself in the search path. Note that we have the least priority.
// This will allow us to run locally against non-packed files that
// are already on disk if the user sets GJS_PATH appropriately.
imports.searchPath.push('resource:///com/endlessm/showmehow');

const Config = imports.lib.config;
const Controller = imports.lib.controller;
const Descriptors = imports.lib.descriptors;
const Service = imports.lib.service;


//
// parseArguments
//
// Sadly, GOptionEntry is not supported by Gjs, so this is a poor-man's
// option parser.
//
// This option parser is a simple 'state machine' option parser. It just
// has a state as to whether it is parsing a double-dash option, or
// if it is parsing something else. There is no type checking or
// validation.
//
// Sadly, this means that there is no way to add arguments to --help
// to show the user.
//
// Everything is stored as an array.

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

        // Whether we push arg to the options
        // list depends on what is ahead of us.
        //
        // If this was a double-dash argument
        // then check if the next argument
        // starts with something that is
        // not a double dash. If so, we should
        // treat this argument as a key and
        // not a value, otherwise treat it
        // truthy value.

        if (!isDoubleDash ||
            i === argv.length - 1 ||
            argv[i + 1].startsWith('--')) {
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

        // For some rather daft reasons, we have to parse ARGV
        // directly to find out some interesting things.
        let parsed = parseArguments(ARGV);
        try {
            this._commandLineFilename = parsed['lessons-file'][0];
        } catch (e) {
            this._commandLineFilename = null;
        }

        // Must return -1 here to continue processing, otherwise
        // we will exit with a code
        return -1;
    },

    vfunc_dbus_register: function(conn, object_path) {
        this.parent(conn, object_path);
        let [descriptors, monitor] = Descriptors.loadLessonDescriptors(this._commandLineFilename);
        this._skeleton = new Service.ShowmehowDBusService();
        this._skeleton.export(conn, object_path);
        this._service = new Controller.ShowmehowController(descriptors, monitor, this._skeleton);
        return true;
    },

    vfunc_dbus_unregister: function(conn, object_path) {
        if (this._skeleton && this._skeleton.has_connection(conn)) {
            this._skeleton.unexport();
        }

        this.parent(conn, object_path);
    }
});

let application = new ShowmehowServiceApplication({
    'application-id': 'com.endlessm.Showmehow.Service',
    'flags': Gio.ApplicationFlags.IS_SERVICE |
             Gio.ApplicationFlags.HANDLES_COMMAND_LINE
});
application.run(ARGV);
