/* lib/descriptors.js
 *
 * Copyright (c) 2016 Endless Mobile Inc.
 * All Rights Reserved.
 *
 * These functions are responsible for loading the lesson descriptors from
 * an underlying JSON file. They will also create a file monitor so that
 * the service can be notified if something changes.
 */

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;

const Lang = imports.lang;

const Validation = imports.lib.validation;

/**
 * loadLessonDescriptorsFromFile
 *
 * Given a GFile, load and validate lesson descriptors from it. Returns
 * the descriptors and warnings as a tuple.
 */
function loadLessonDescriptorsFromFile(file) {
    let warnings = [];
    let descriptors = null;
    let success = false;

    try {
        let contents = file.load_contents(null)[1];
        [descriptors, warnings] = Validation.validateDescriptors(JSON.parse(contents));
        success = true;
    } catch (e if e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) {
        // don't warn in this case
    } catch (e) {
        warnings.push('Unable to load ' + file.get_parse_name() + ': ' + String(e));
    }

    return [success ? descriptors : null, warnings];
}

/**
 * loadLessonDescriptors
 *
 * Attempts to load lesson descriptors from a file.
 *
 * The default case is to load the descriptors from the internal resource
 * file that makes up Showmehow's binary. However, we first:
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
function loadLessonDescriptors(cmdlineFilename) {
    let filenamesToTry = [
        cmdlineFilename,
        GLib.build_filenamev([GLib.get_user_config_dir(), 'com.endlessm.Showmehow.Service', 'lessons.json'])
    ].filter(f => !!f);

    var warnings = [];
    var descriptors = null;
    let monitor = null;

    /* Here we use a 'dumb' for loop, since we need to update
     * warnings if a filename didn't exist */
    for (let i = 0; i < filenamesToTry.length; ++i) {
        let file = Gio.File.new_for_path(filenamesToTry[i]);
        let loadWarnings;

        [descriptors, loadWarnings] = loadLessonDescriptorsFromFile(file);

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
        descriptors = JSON.parse(Gio.resources_lookup_data('/com/endlessm/showmehow/data/lessons.json',
                                                           Gio.ResourceLookupFlags.NONE).get_data());
    }

    /* Add a 'warnings' key to descriptors. */
    descriptors.warnings = warnings;
    return [descriptors, monitor];
}

