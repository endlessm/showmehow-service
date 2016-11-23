# Arbitrary files
arbitrary_files = \
	files/sw.txt \
	files/background_pic.jpg \
	files/test.txt \
	$(NULL)

lesson_directories = \
	files/text-processing-fs \
	$(NULL)

filesdir = $(pkgdatadir)/files
files_DATA = $(arbitrary_files)

# Resource javascript modules
resource_dist_js_files = \
	lib/validation.js \
	$(NULL)

resource_nondist_js_files = \
	lib/config.js \
	$(NULL)

lib/config.js: $(srcdir)/lib/config.js.in
	$(AM_V_GEN) mkdir -p lib/ && \
	sed -e 's,%CODING_FILES_DIR%,$(pkgdatadir)/files,g' -e 's,%CODING_SHARED_SCRIPT_DIR%,$(pkglibexecdir)/coding-shared-dir,g' $< > $@.tmp && \
	mv -f $@.tmp $@

# All javascript modules
all_dist_js_files = \
	showmehow-validator.js \
	showmehow-service.js \
	$(resource_dist_js_files) \
	$(NULL)

all_js_files = \
	$(all_dist_js_files) \
	$(resource_nondist_js_files) \
	$(NULL)


AM_CONFIG_MACRO_DIR =
AM_DISTCHECK_CONFIGURE_FLAGS = --enable-introspection
EXTRA_DIST = \
	com.endlessm.Showmehow.Service.xml \
	com.endlessm.Showmehow.Service.service.in \
	com.endlessm.showmehow.gschema.xml \
	com.endlessm.showmehow.gresource.xml \
	data/lessons.json.unvalidated.in \
	data/com.endlessm.Coding.policy.in \
	files/coding-shared-dir.in \
	lib/config.js.in \
	$(all_dist_js_files) \
	$(arbitrary_files) \
	$(NULL)
CLEANFILES =

# Rename the showmehow-service script
showmehow-service: $(abs_top_srcdir)/showmehow-service.js
	cp $< $@
	chmod +x $@

# Rename the showmehow-validator script
showmehow-validator: $(abs_top_srcdir)/showmehow-validator.js
	cp $< $@
	chmod +x $@

# GDBus-Codegen for Showmehow
Showmehow.c: $(abs_top_srcdir)/com.endlessm.Showmehow.Service.xml
	gdbus-codegen --generate-c-code Showmehow --c-namespace Showmehow --c-generate-object-manager --interface-prefix com.endlessm.Showmehow. $<

Showmehow.h: Showmehow.c

gdbus_codegen_built_sources = \
	Showmehow.c \
	Showmehow.h \
	$(NULL)

# GSettings schemas
gsettings_SCHEMAS = com.endlessm.showmehow.gschema.xml

@GSETTINGS_RULES@

# Validation of lessons (produces data.lessons)
data/lessons.json: $(abs_top_srcdir)/data/lessons.json.unvalidated.in $(all_js_files)
	gjs --include-path=$(abs_top_srcdir) \
	    $(abs_top_srcdir)/showmehow-validator.js \
	    $(abs_top_srcdir)/data/lessons.json.unvalidated.in
	mkdir -p data
	cp $< $@

# Replace pkglibexecdir path
data/com.endlessm.Coding.policy: data/com.endlessm.Coding.policy.in
	$(AM_V_GEN) mkdir -p data && \
	$(SED) -e 's,%pkglibexecdir%,$(pkglibexecdir),' < $< >$@.tmp && \
	mv -f $@.tmp $@

# Replace coding_files_dir path
files/coding-shared-dir: files/coding-shared-dir.in
	$(AM_V_GEN) mkdir -p files && \
	$(SED) -e 's,%coding_files_dir%,$(pkgdatadir)/files,g' < $< >$@.tmp && \
	mv -f $@.tmp $@

# Install directories for lessons. We need to do this because files_DATA doesn't
# support recursive copying
install-data-hook:
	for i in $(lesson_directories); do cp -r $$i $(DESTDIR)/$(filesdir:/%=%)/; done

# GResources

resource_files = \
	$(resource_dist_js_files) \
	$(resource_nondist_js_files) \
	data/lessons.json \
	$(NULL)

showmehow-resources.h: $(abs_top_srcdir)/com.endlessm.showmehow.gresource.xml $(resource_files)
	$(AM_V_GEN) glib-compile-resources --target=$@ --sourcedir=$(srcdir) --sourcedir=$(builddir) --generate --c-name showmehow $<
showmehow-resources.c: $(abs_top_srcdir)/com.endlessm.showmehow.gresource.xml $(resource_files)
	$(AM_V_GEN) glib-compile-resources --target=$@ --sourcedir=$(srcdir) --sourcedir=$(builddir) --generate --c-name showmehow $<

resources_built_sources = showmehow-resources.c showmehow-resources.h

# Generate the Showmehow GDBus Skeleton library
libshowmehow_1_0_la_SOURCES = $(resources_built_sources) \
			      $(gdbus_codegen_built_sources) \
			      showmehow-cmd-helper.c \
			      showmehow-cmd-helper.h \
			      $(NULL)
libshowmehow_1_0_la_CFLAGS = $(SHOWMEHOW_SERVICE_CFLAGS)
libshowmehow_1_0_la_LIBADD = $(SHOWMEHOW_SERVICE_LIBS)

# All libraries
lib_LTLIBRARIES = libshowmehow-1.0.la

# Scripts to install
bin_SCRIPTS = showmehow-service \
	      showmehow-validator

# Header files to install
showmehowincludedir = $(includedir)/showmehow-service
nobase_showmehowinclude_HEADERS = \
	Showmehow.h \
	$(NULL)

# GObject-Introspection support
include $(INTROSPECTION_MAKEFILE)
INTROSPECTION_GIRS = $(NULL)
INTROSPECTION_SCANNER_ARGS = --add-include-path=$(srcdir) --warn-all
INTROSPECTION_COMPILER_ARGS = --includedir=$(srcdir)

if HAVE_INTROSPECTION
introspection_sources = $(libshowmehow_1_0_la_SOURCES)

Showmehow-1.0.gir: libshowmehow-1.0.la
Showmehow_1_0_gir_INCLUDES = GObject-2.0 Gio-2.0 GLib-2.0
Showmehow_1_0_gir_CFLAGS = $(INCLUDES)
Showmehow_1_0_gir_LIBS = libshowmehow-1.0.la $(SHOWMEHOW_LDFLAGS)
Showmehow_1_0_gir_FILES = $(introspection_sources)
INTROSPECTION_GIRS += Showmehow-1.0.gir

girdir = $(datadir)/gir-1.0
gir_DATA = $(INTROSPECTION_GIRS)

typelibdir = $(libdir)/girepository-1.0
typelib_DATA = $(INTROSPECTION_GIRS:.gir=.typelib)

CLEANFILES += $(gir_DATA) $(typelib_DATA)
endif

servicedir = $(datadir)/dbus-1/services
service_DATA = com.endlessm.Showmehow.Service.service

# DBus Service
com.endlessm.Showmehow.Service.service: $(abs_top_srcdir)/com.endlessm.Showmehow.Service.service.in
	$(AM_V_GEN) sed -e 's|@bindir[@]|${bindir}|g' $< > $@

# Script for placing files in the shared dir 
pkglibexec_SCRIPTS = files/coding-shared-dir

# Polkit policy

polkit_policydir = $(datadir)/polkit-1/actions
dist_polkit_policy_DATA = data/com.endlessm.Coding.policy

# Things to get rid of later
CLEANFILES += \
	$(bin_SCRIPTS) \
	$(service_DATA) \
	$(resources_built_sources) \
	$(gdbus_codegen_built_sources) \
	data/lessons.json \
	data/com.endlessm.Coding.policy \
	files/coding-shared-dir \
	lib/config.js \
	$(NULL)
