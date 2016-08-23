#!/usr/bin/env gjs
/* showmehow-validator.js
 *
 * Copyright (c) 2016 Endless Mobile Inc.
 * All Rights Reserved.
 *
 * A simple script to validate a lesson descriptor file against
 * what we expect of lesson descriptor files. Exits with
 * the number of errors encountered.
 */

const System = imports.system;

/* Note that while Showmehow is technically unused as an import here, we
 * need to import it anyway because it will cause resource paths to be
 * registered by Gio internally. */
const Gio = imports.gi.Gio;
const ShowmehowResource = imports.gi.Showmehow.get_resource();

/* Put ourself in the search path. Note that we have the least priority.
 * This will allow us to run locally against non-packed files that
 * are already on disk if the user sets GJS_PATH appropriately. */
imports.searchPath.push('resource:///com/endlessm/showmehow')

const Validation = imports.lib.validation;


/**
 * validateFile
 *
 * Open the provided json file and report any errors.
 */
function validateFile(filename) {
    const [ok, contents, etag] = Gio.File.new_for_path(filename).load_contents(null);
    const [valid, errors] = Validation.validateDescriptors(JSON.parse(contents));
    errors.forEach(e => log("lesson validation error: " + e));
    return errors.length;
}

System.exit(validateFile(ARGV[0]));
