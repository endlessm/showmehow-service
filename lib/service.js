// lib/service.js
//
// Copyright (c) 2016 Endless Mobile Inc.
// All Rights Reserved.
//
// This file contains the ShowmehowDBUSService class - which is the d-bus
// service that we use to communicate with external processes.

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Showmehow = imports.gi.Showmehow;

const Lang = imports.lang;

const ErrorDomain = GLib.quark_from_string('showmehow-error');
const Errors = {
    INVALID_TASK: 0,
    INVALID_TASK_SPEC: 1,
    INVALID_CLUE_TYPE: 2,
    INTERNAL_ERROR: 3
};

const ShowmehowDBusService = new Lang.Class({
    Name: 'ShowmehowDBusService',
    Extends: Showmehow.ServiceSkeleton,

    _init: function() {
        this.parent();
        this._responders = {};
    },

    assignResponders: function(responders) {
        this._responders = responders;
    },

    vfunc_handle_get_warnings: function(method) {
        try {
            let wrappedResponders = this._responders.fetchWarnings().map((w) => [w]);
            this.complete_get_warnings(method, GLib.Variant.new('a(s)', wrappedResponders));
        } catch(e) {
            logError(e, 'Could not submit warnings');
            method.return_error_literal(ErrorDomain,
                                        Errors.INTERNAL_ERROR,
                                        String(e));
        }

        return true;
    },

    vfunc_handle_open_session: function(method, forLesson) {
        try {
            this.complete_open_session(method, this._responders.openSession(forLesson));
        } catch(e) {
            logError(e, 'Failed to open a new session');
            method.return_error_literal(ErrorDomain,
                                        Errors.INTERNAL_ERROR,
                                        String(e));
        }
    },

    vfunc_handle_close_session: function(method, id) {
        try {
            this._responders.closeSession(id);
            this.complete_close_session(method);
        } catch(e) {
            logError(e, 'Failed to close session ' + id);
            method.return_error_literal(ErrorDomain,
                                        Errors.INTERNAL_ERROR,
                                        String(e));
        }
    },

    vfunc_handle_attempt_lesson_remote: function(method, session_id, lesson, task, input_code) {
        try {
            this._responders.attemptLessonWithInput(session_id,
                                                    lesson,
                                                    task,
                                                    input_code,
                                                    Lang.bind(this, function(domain, code, message) {
                                                        method.return_error_literal(domain, code, message);
                                                    }),
                                                    Lang.bind(this, function(returnValue) {
                                                        let serialized = JSON.stringify(returnValue);
                                                        this.complete_attempt_lesson_remote(method,
                                                                                            serialized);
                                                    }));
        } catch (e) {
            logError(e, 'Internal error in handle_lesson_response');
            method.return_error_literal(ErrorDomain,
                                        Errors.INTERNAL_ERROR,
                                        String(e));
        }

        return true;
    },

    notifyClientsOfDescriptorChange: function() {
        this.emit_lessons_changed();
    }
});
