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

const Gio = imports.gi.Gio;

const Validation = imports.lib.validation;


/**
 * validateFile
 *
 * Open the provided json file and report any errors.
 */
function validateFile(filename) {
    const contents = Gio.File.new_for_path(filename).load_contents(null)[1];
    const errors = Validation.validateDescriptors(JSON.parse(contents))[1];
    errors.forEach(e => log("lesson validation error: " + e));
    return errors.length;
}

System.exit(validateFile(ARGV[0]));
