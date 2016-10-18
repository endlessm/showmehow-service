#!/usr/bin/env gjs
/* edit-desktop-file.js
 *
 * Copyright (c) 2016 Endless Mobile Inc.
 * All Rights Reserved.
 *
 * Simple script to exercise the desktop file editor.
 */

imports.searchPath.push(".");  // XXX: Kludge.

const DesktopFile = imports.lib.desktopFile;
const System = imports.system;

const usage = [
    "Usage: edit-desktop-file.js <command> <desktop-file-id> [arguments...]",
    "",
    "Available commands:",
    "",
    "   set-command <id> <command-line> [executable]",
    "   restore <id>",
    "",
];

if (ARGV.length < 2 || ARGV[0] === "help") {
    usage.map(line => print(line));
    System.exit(0);
}
switch (ARGV[0]) {
    case "restore":
        DesktopFile.restore(ARGV[1]);
        break;
    case "set-command":
        DesktopFile.setCommand(ARGV[1], ARGV[2], ARGV[3]);
        break;
    case undefined:
    case null:
        print("No command specified");
        System.exit(1);
        break;
    default:
        print("No such command: " + ARGV[0]);
}
