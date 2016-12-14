// tests/js/testShowmehowServiceContent.js
//
// Copyright (c) 2016 Endless Mobile Inc.
// All Rights Reserved.
//
// These tests actually exercise all the lessonsto make sure that
// they return the intended response. The ordering of tests here
// between lessons matters.
//
// Note that this requires showmehow-service to be running on your
// system, so it makes sense only as an installed test.

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Lang = imports.lang;

const Showmehow = imports.gi.Showmehow;

// sortExampleKeys
//
// We need to do this here to ensure that 'failure' always comes before
// 'success'. The reason is that we might be relying on the ordering of
// tasks especially in lessons that have some sort of context. For
// instance, if the 'success' example and the 'failure' example both
// assign the same variable name.
function sortExampleKeys(keys) {
    return keys.sort(function(left, right) {
        if (left === "failure") {
            return -1;
        } else if (right === "failure") {
            return 1;
        } else {
            return left < right ? -1 : right > left;
        }
    });
}

describe('Showmehow Service Lesson', function () {
    let controller;
    let defaultLessons = JSON.parse(GLib.file_get_contents('data/lessons.json')[1]);
    beforeAll(function () {
        GLib.setenv('G_SETTINGS_BACKEND', 'memory', true);
        controller = Showmehow.ServiceProxy.new_for_bus_sync(Gio.BusType.SESSION,
                                                             0,
                                                             "com.endlessm.Showmehow.Service",
                                                             "/com/endlessm/Showmehow/Service",
                                                             null);
    });

    defaultLessons.forEach(function(lesson) {
        describe(lesson.name, function() {
            let session = -1;
            beforeAll(function() {
                if (lesson.requires_session) {
                    session = controller.call_open_session_sync(lesson.name, null)[1];
                }
            });

            Object.keys(lesson.practice).forEach(function(taskName) {
                describe(taskName, function() {
                    let task = lesson.practice[taskName];
                    sortExampleKeys(Object.keys(task.example)).forEach(function(result) {
                        let input = task.example[result];
                        it("returns " + result + " when called with " + input, function() {
                            let response = controller.call_attempt_lesson_remote_sync(session,
                                                                                      lesson.name,
                                                                                      taskName,
                                                                                      input,
                                                                                      null)[1];
                            expect(JSON.parse(response).result).toEqual(result);
                        });
                    });
                });
            });
        });
    });
});
