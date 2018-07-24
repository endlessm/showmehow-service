// tests/js/testShowmehowServiceContent.js
//
// Copyright (c) 2016-2017 Endless Mobile Inc.
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

const Controller = imports.lib.controller;
const Descriptors = imports.lib.descriptors;
const Mocks = imports.mocks.constructors;

const System = imports.system;

// recursivelyDropDirectory
//
// Descend into a directory depth-first and remove all files. 'directory'
// is a GFile representing a directory.
function recursivelyDropDirectory(directory) {
    // This can fail, but the strategy here is 'hope it doesnt'. If it fails
    // something else is going wrong, since we are deleting files that we
    // own.
    let directoryPath = directory.get_path();
    let enumerator = directory.enumerate_children('standard::name',
                                                  Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
                                                  null);
    let fileChildren = [];

    let childInfo = null;
    while ((childInfo = enumerator.next_file(null))) {
        let child = Gio.File.new_for_path(GLib.build_filenamev([directoryPath, childInfo.get_name()]));
        let fileType = childInfo.get_file_type();
        switch (fileType) {
            case Gio.FileType.REGULAR:
            case Gio.FileType.SYMBOLIC_LINK:
                fileChildren.push(child);
                break;
            case Gio.FileType.DIRECTORY:
                recursivelyDropDirectory(child);
                break;
            default:
                throw new Error('Don\'t know how to handle file type ' + fileType);
        }
    }

    // Now that we have dropped all directories, remove
    // any files.
    fileChildren.forEach(function(child) {
        child.delete(null);
    });

    // Drop this directory
    directory.delete(null);
}

// recursivelyDropOptionalDirectory
//
// Recursively drops a directory if a variable is set (for instance
// in an environment variable)
function recursivelyDropOptionalDirectory(path) {
    if (!path)
        return;

    recursivelyDropDirectory(Gio.File.new_for_path(path));
}

// configureHomeDirectory
//
// If we are running under an overridden home directory, create some
// folders and files to satisfy the expected layout.
function configureHomeDirectory() {
    // overriddenHome here represents /home, of which the 'user'
    // subdirectory should by convention be set as $HOME.
    let overiddenHome = GLib.getenv('OVERRIDDEN_HOME_BASE');
    if (!overiddenHome) {
        return;
    }

    // Create some users and some directories
    let directoriesToCreate = [
        GLib.build_filenamev([overiddenHome, 'home', 'shared']),
        // This will work fine because $HOME needs to be set before
        // gjs is started.
        GLib.build_filenamev([GLib.get_home_dir(), 'Pictures'])
    ];

    directoriesToCreate.forEach(function(directory) {
        try {
            Gio.File.new_for_path(directory).make_directory_with_parents(null);
        } catch (e if e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS)) {
        }
    });
}

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

let CUSTOM_MATCHERS = {
    toHaveResult: function(util, customEqualityTesters) {
        return {
            compare: function(actual, expected) {
                let pass = util.equals(actual.result, expected);
                return {
                    pass,
                    message: pass ? (
                        `Expected ${JSON.stringify(actual, null, 2)} result to be ${expected}`
                    ) : (
                        `Expected ${JSON.stringify(actual, null, 2)} result not to be ${expected}`
                    )
                };
            }
        };
    }
};

describe('Showmehow Service Lesson', function () {
    let controller, service;
    let [defaultLessons, warnings] = Descriptors.loadLessonDescriptorsFromFile(Gio.File.new_for_path('data/lessons.json'));

    /* Set the 'warnings' key, since this is what ShowmehowController expects internally */
    defaultLessons.warnings = warnings;

    beforeEach(function () {
        jasmine.addMatchers(CUSTOM_MATCHERS);
    });

    beforeAll(function () {
        configureHomeDirectory();
        GLib.setenv('GSETTINGS_BACKEND', 'memory', true);
        GLib.setenv('PATH', GLib.getenv('PATH') + ':/usr/games', true);
        GLib.setenv('CODING_TARGET_FILES_DIR', GLib.dir_make_tmp('showmehow-service-test-XXXXXX'), true);
        service = new Mocks.ChatServiceStub();
        controller = new Controller.ShowmehowController(defaultLessons, null, service);
    });

    afterAll(function() {
        recursivelyDropOptionalDirectory(GLib.getenv('CODING_TARGET_FILES_DIR'));
        recursivelyDropOptionalDirectory(GLib.getenv('OVERRIDDEN_HOME_BASE'));
    });

    defaultLessons.forEach(function(lesson) {
        describe(lesson.name, function() {
            let session = -1;
            beforeAll(function() {
                if (lesson.requires_session)
                    session = service.openSession(lesson.name);
            });

            afterAll(function() {
                if (session !== -1)
                    service.closeSession(session);
            });

            Object.keys(lesson.practice).forEach(function(taskName) {
                describe(taskName, function() {
                    let task = lesson.practice[taskName];
                    sortExampleKeys(Object.keys(task.example)).forEach(function(result) {
                        let input = task.example[result];
                        it('returns ' + result + ' when called with ' + input, function(done) {
                            let errorHandler = function(domain, code, message) {
                                throw new Error('Error ' + domain + ':' + code + ' "' + message + '" occurred');
                            };

                            let successHandler = function(response) {
                                expect(response).toHaveResult(result);
                                done();
                            }

                            let response = service.attemptLessonWithInput(session,
                                                                          lesson.name,
                                                                          taskName,
                                                                          input,
                                                                          errorHandler,
                                                                          successHandler);
                        });
                    });
                });
            });
        });
    });
});
