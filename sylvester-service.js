#!/usr/bin/env gjs
/* sylvester-service.js
 *
 * Copyright (c) 2016 Endless Mobile Inc.
 * All Rights Reserved.
 *
 * The sylvester service derives its name from Sylvester, the mathematician
 * who brought the concept of simultaneous equations and matricies from
 * the east to the west.
 *
 * The purpose of this service is to allow users to "enter the matrix",
 * i.e, to view and edit the source code for the applications that
 * make up their system, easily.
 *
 * This script creates a GDBus service on the name
 * org.endlessm.Sylvester.Service
 *
 * Call DownloadSourcesForPid to look up the source code for a particular
 * process-id and use apt-get source to download its sources and open
 * a gnome-builder window.
 *
 * DownloadSourcesForSelectedWindow is a debugging function to select
 * arbitrary windows and get their process-id.
 *
 * The service will emit the "RotateIn" signal when two windows are to
 * be rotated as a transition.
 */


const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Sylvester = imports.gi.Sylvester;

const Lang = imports.lang;

function read_file_contents(path) {
    const cmdlineFile = Gio.File.new_for_path(path);
    const [ok, contents, etag] = cmdlineFile.load_contents(null);
    return contents;
}

function execute_command_for_output(argv) {
    log("Running " + argv.join(" "));
    const [ok, stdout, stderr, status] = GLib.spawn_sync(null, argv, null, 0, null);
    return {
        status: status,
        stdout: String(stdout),
        stderr: String(stderr)
    }   
}

function launch_and_watch_pid(argv, on_exit_callback) {
    log("Running " + argv.join(" "));
    const [ok, child_pid] = GLib.spawn_async(null,
                                             argv,
                                             null,
                                             GLib.SpawnFlags.DO_NOT_REAP_CHILD,
                                             null);

    GLib.child_watch_add(GLib.PRIORITY_DEFAULT_IDLE, child_pid, function(pid, status) {
        log("Process " + pid + " (" + argv.join(" ") + ") exited with " + status);
        
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

function debian_package_for_cmdline(cmdline) {
    const result = execute_command_for_output(["/usr/bin/dpkg",
                                               "-S",
                                               String(cmdline).split(" ")[0]]);
    return String(result.stdout).trim().split(": ")[0];
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

function get_sources_for_pkg(pkg, done_callback) {
    const has_pkg_already = (directory_names_matching_in(new RegExp(pkg + ".*"),
                                                         ".").length > 0)
    let cmd_to_run = ["bash", "-c"];
    
    if (has_pkg_already) {
        cmd_to_run.push("echo 'Already Downloaded " + pkg + "... Launching Builder'; sleep 3; ");
    } else {
        cmd_to_run.push("apt-get source " + pkg + "; ");
    }
    
    cmd_to_run[cmd_to_run.length - 1] += ["gdbus",
                                          "call",
                                          "--session",
                                          "-d",
                                          "com.endlessm.Sylvester.Service",
                                          "-o",
                                          "/com/endlessm/Sylvester/Service",
                                          "-m",
                                          "com.endlessm.Sylvester.Service.LaunchBuilderForDpkgBundle",
                                          pkg].join(" ") + "; sleep 10;";

    return launch_and_watch_pid(["/usr/bin/xterm", "-e"].concat(cmd_to_run),
                                function(pid, status) {
                                    if (done_callback)
                                        done_callback(pkg, status);
                                });
}

function inside_directory(path, callback) {
    const current_dir = GLib.get_current_dir();
    GLib.mkdir_with_parents(path, parseInt("0755", 8));
    GLib.chdir(path);
    try {
        return callback.apply(this, arguments);
    } finally {
        GLib.chdir(current_dir);
    }
}

function working_directory_for_package(pkg) {
    return [GLib.get_home_dir(), "Source", "Packages", pkg].join("/")
}

function source_package_for_binary_pkg(binary_pkg) {
    return execute_command_for_output_success([
        "/usr/bin/apt-cache",
        "showsrc",
        binary_pkg
    ]).stdout.split("\n").filter(function(line) {
        return line.match("Package: [^\s]+$") !== null;
    })[0].match("Package: ([^\s]+)$")[1];
}

function download_sources_for_pid(pid, done) {
    const cmdline = read_file_contents(["",
                                        "proc",
                                        String(pid),
                                        "cmdline"].join("/"));
    const binary_pkg = debian_package_for_cmdline(cmdline);
    const source_pkg = source_package_for_binary_pkg(binary_pkg);
    return inside_directory(working_directory_for_package(source_pkg), function() {
		return get_sources_for_pkg(source_pkg, done);
    });
}

function open_gnome_builder_in(path) {
    return launch_and_watch_pid(["/usr/bin/gnome-builder", "-p", path]);
}

const SylvesterErrorDomain = GLib.quark_from_string("sylvester-error");
const SylvesterErrors = {
    DOWNLOADER_FAILED: 1,
    NEED_ACTIVE_DOWNLOADER: 2,
    COULDNT_FIND_PACKAGE: 3,
    COMMAND_FAILED: 4
};
const SylvesterService = new Lang.Class({
    Name: "SylvesterService",
    Extends: Sylvester.ServiceSkeleton,
    _init: function(props) {
        this.parent(props);
        this.connect("handle-download-sources-for-selected-window", Lang.bind(this, function(iface, method) {
            try {
                const xwininfo_output = execute_command_for_output_success(["/usr/bin/xwininfo", "-all"]);
                const process_id_line = xwininfo_output.stdout.split("\n").filter(function(line) {
                    return line.indexOf("Process id") !== -1;
                })[0].trim();
                const process_id = parseInt(process_id_line.match(/Process id\: ([0-9]+)/)[1]);
		        const downloader_pid = download_sources_for_pid(process_id, function(pkg, status) {
		            if (status !== 0) {
			           method.return_error_literal(SylvesterErrorDomain,
			                                       SylvesterErrors.DOWNLOADER_FAILED,
			                                       "Downloader process failed with " + status);
			        } else {
					    iface.complete_download_sources_for_selected_window(method)
					}
				});
			} catch (e) {
			    method.return_error_literal(SylvesterErrorDomain,
			                                SylvesterErrors.COMMAND_FAILED,
			                                String(e));
			}
            this._emit_rotate_in({
                destination: downloader_pid,
		        source: process_id
		    });
        }));
        this.connect("handle-download-sources-for-pid", Lang.bind(this, function(iface, method, pid) {
			const downloader_pid = download_sources_for_pid(pid, function(pkg, status) {
                if (status !== 0) {
	               method.return_error_literal(SylvesterErrorDomain,
	                                           SylvesterErrors.DOWNLOADER_FAILED,
	                                           "Downloader process failed with " + status);
	            } else {
			        iface.complete_download_sources_for_pid(method)
			    }
			});
            this._emit_rotate_in({
                destination: downloader_pid,
		        source: process_id
		    });
        }));
        this.connect("handle-launch-builder-for-dpkg-bundle", Lang.bind(this, function(iface, method, pkg) {
            if (!this._currently_active_step_pid) {
	             method.return_error_literal(SylvesterErrorDomain,
	                                         SylvesterErrors.COULDNT_FIND_PACKAGE,
	                                         "Need a currently active downloader process");
	             return false;
            }
			/* Open up the project with gnome-builder once we're done.
	         *
	         * 1. Change into the package directory.
	         * 2. Find the first directory with the package name in it.
	         * 3. Open GNOME Builder on the path.
	         * 4. Wait until it appears on the session bus, and then
	         *    call methods to open files etc.
	         */
	         const path = working_directory_for_package(pkg)
	         const directories = directory_names_matching_in(new RegExp(pkg + ".*"), path);
	         if (directories.length > 0) {
	             const builder_pid = open_gnome_builder_in([path, directories[0].name].join("/"));
	             this._emit_rotate_in({
	                 destination: builder_pid,
	                 source: this._currently_active_step_pid
	             });
	             iface.complete_launch_builder_for_dpkg_bundle(method, builder_pid);
	         } else {
	             log("No directories matching " + pkg + " in path " + path);
	             method.return_error_literal(SylvesterErrorDomain,
			                                 SylvesterErrors.NEED_ACTIVE_DOWNLOADER,
			                                 "Couldn't find any directories matching " +
			                                 pkg + " in " + path);
	             return false;
	         }
	         
	         this._currently_active_step_pid = undefined;
	         return true;
        }));
    },
    _emit_rotate_in: function(description) {
        this.emit_rotate_between_pid_windows(description.source, description.destination);
        this._currently_active_step_pid = description.destination;
    }
});

let loop = GLib.MainLoop.new(null, false);
Gio.bus_own_name(Gio.BusType.SESSION,
                 "com.endlessm.Sylvester.Service",
                 Gio.BusNameOwnerFlags.ALLOW_REPLACEMENT |
                 Gio.BusNameOwnerFlags.REPLACE,
                 function(conn, name) {
                     let manager = Gio.DBusObjectManagerServer.new("/com/endlessm/Sylvester");
                     let obj = Sylvester.ObjectSkeleton.new("/com/endlessm/Sylvester/Service");
                     obj.set_service(new SylvesterService());
                     manager.export(obj);
                     manager.set_connection(conn);
                 },
                 null,
                 null);
loop.run();
                 
