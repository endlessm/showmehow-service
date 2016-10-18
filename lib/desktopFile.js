/* lib/desktop-file-editor.js
 *
 * Copyright (c) 2016 Endless Mobile Inc.
 * All Rights Reserved.
 */

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;

const Lang = imports.lang;

const _FACTORY = {};


const EditAction = new Lang.Class({
    Name: "EditAction",

    _init: function(params) {
        for (var key in this.PARAMS) {
            if (params[key] === undefined) {
                // Use default value from PARAMS.
                this["_" + key] = this.PARAMS[key];
            } else {
                this["_" + key] = params[key];
            }
        }
    },

    PARAMS: {},

    _toObject: function() {
        let serializable = { action: this.__name__ };
        for (let key in this.PARAMS) {
            if (key[0] !== "_") {
                serializable[key] = this["_" + key];
            }
        }
        return serializable;
    },

    serialize: function() {
        return JSON.stringify(this._toObject());
    },
});


const EditCommandAction = new Lang.Class({
    Name: "EditCommandAction",
    Extends: EditAction,

    PARAMS: {
        exec: null,
        tryExec: null,
        oldExec: null,
        oldTryExec: null,
    },

    apply: function(desktopFile) {
        this._oldExec = desktopFile.get_string("Desktop Entry", "Exec");
        try {
            this._oldTryExec = desktopFile.get_string("Desktop Entry", "TryExec");
        } catch (e) { }
        desktopFile.set_string("Desktop Entry", "Exec", this._exec);
        if (this._tryExec) {
            desktopFile.set_string("Desktop Entry", "TryExec", this._tryExec);
        }
    },

    undo: function(desktopFile) {
        desktopFile.set_string("Desktop Entry", "Exec", this._oldExec); 
        if (this._oldTryExec) {
            desktopFile.set_string("Desktop Entry", "TryExec", this._oldTryExec);
        }
    },
});

_FACTORY.EditCommandAction = EditCommandAction;


const EditStringFieldAction = new Lang.Class({
    Name: "EditStringFieldAction",
    Extends: EditAction,

    GROUP: null,
    KEY: null,

    PARAMS: {
        value: null,
        oldValue: null,
    },

    apply: function(desktopFile) {
        this._oldValue = desktopFile.get_string(this.GROUP, this.KEY);
        desktopFile.set_string(this.GROUP, this.KEY, this._value);
    },

    undo: function(desktopFile) {
        desktopFile.set_string(this.GROUP, this.KEY, this._oldValue);
    },
});


const EditIconAction = new Lang.Class({
    Name: "EditIconAction",
    Extends: EditStringFieldAction,
    GROUP: "Desktop Entry",
    KEY: "Icon",
});

_FACTORY.EditIconAction = EditIconAction;


const Editor = new Lang.Class({
    Name: "Editor",

    _init: function(identifier) {
        this._identifier = identifier;
        this._needsSaving = false;
        this._keyFile = new GLib.KeyFile();
        this._actions = [];
        let path = "applications/" + identifier;
        let userFullPath = Gio.File.new_for_path(GLib.get_user_data_dir()).get_child(path);
        this._path = userFullPath.get_path();
        this._metadataPath = this._path + ".json";

        let [found, fullPath] = this._keyFile.load_from_data_dirs(path,
                GLib.KeyFileFlags.KEEP_TRANSLATIONS);
        if (!found) {
            throw new Error("cannot find " + identifier);
        }

        if (this._path === fullPath) {
            // We are using a .desktop file in the user directory, check whether an
            // accompanying JSON file is present.
            let jsonPath = Gio.File.new_for_path(this._metadataPath);
            if (jsonPath.query_exists(null)) {
                // Found, deserialize and re-instantiate the actions.
                let data = JSON.parse(jsonPath.load_contents(null)[1]);
                for (let actionData of data.actions) {
                    let actionFactory = _FACTORY[actionData.action];
                    this._actions.push(new actionFactory(actionData));
                }
            } else {
                // TODO: Handle making a backup of the contents of an user-customized
                //       application launcher file.
                throw new Error("desktop file is overriden by user: " + identifier);
            }
        } else {
            // We are not using an overriden .desktop file from the user directory.
            // Make sure the user applications directory exists, to save the file
            // there later on.
            if (!userFullPath.has_parent(null)) {
                let parentPath = userFullPath.get_parent();
                parentPath.make_directory_with_parents();
            }
        }
    },

    apply: function(editAction) {
        editAction.apply(this._keyFile);
        this._actions.push(editAction);
        this._needsSaving = true;
        return this;
    },

    undo: function(editActionClass) {
        for (let i = this._actions.length - 1; i >= 0; --i) {
            let editAction = this._actions[i];
            if (editAction instanceof editActionClass) {
                editAction.undo(this._keyFile);
                this._actions.splice(i, 1);
                this._needsSaving = true;
            }
        }
        return this;
    },

    save: function() {
        if (this._needsSaving) {
            this._keyFile.save_to_file(this._path);
            let jsonPath = Gio.File.new_for_path(this._metadataPath);
            jsonPath.replace_contents(this.serialize(),
                    null, false, Gio.FileCreateFlags.NONE, null);
            this._needsSaving = false;
        }
        return this;
    },

    restore: function() {
        // TODO: Handle restoring saved user-overriden files.
        if (this._actions.length > 0) {
            this._actions = [];
            this._needsSaving = false;
            GLib.unlink(this._path);
            GLib.unlink(this._metadataPath);
        }
        return this;
    },

    serialize: function() {
        return JSON.stringify({
            desktopFile: this._identifier,
            actions: this._actions.map(a => a._toObject()),
        });
    },
});


function setCommand(identifier, commandLine, executableName) {
    if (!executableName) {
        // TODO: This only picks the first non-empty word, implement parsing quoted params as per
        //       https://specifications.freedesktop.org/desktop-entry-spec/latest/ar01s06.html
        executableName = commandLine.match(/^\s*([^\s]+)/)[0];
    }
    let editor = new Editor(identifier);
    editor.apply(new EditCommandAction({
        exec: commandLine,
        tryExec: executableName,
    })).save();
}

function setIcon(identifier, icon) {
    let editor = new Editor(identifier);
    editor.apply(new EditIconAction({ value: icon })).save();
}

function restoreCommand(identifier) {
    let editor = new Editor(identifier);
    editor.undo(EditCommandAction).save();
}

function restore(identifier) {
    let editor = new Editor(identifier);
    editor.restore();
}
