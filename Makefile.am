# Arbitrary files
arbitrary_files = \
	files/sw.txt \
	files/background_pic.jpg \
	files/test.txt \
	$(NULL)

lesson_directories = \
	files/text-processing-fs \
	files/webrequest-fs \
	$(NULL)

filesdir = $(pkgdatadir)/files
files_DATA = $(arbitrary_files)

# Resource javascript modules
resource_dist_js_files = \
	lib/controller.js \
	lib/descriptors.js \
	lib/service.js \
	lib/validation.js \
	$(NULL)

resource_nondist_js_files = \
	lib/config.js \
	$(NULL)

lib/config.js: $(srcdir)/lib/config.js.in
	$(AM_V_GEN) mkdir -p lib/ && \
	sed -e 's,%CODING_FILES_DIR%,$(pkgdatadir)/files,g' -e 's,%CODING_SHARED_SCRIPT_DIR%,$(pkglibexecdir)/coding-shared-dir,g' $< > $@.tmp && \
	mv -f $@.tmp $@

# Mocks
javascript_mocks = \
	mocks/constructors.js \
	$(NULL)

# Tests
javascript_tests = \
	tests/testShowmehowServiceContent.js \
	$(NULL)

# All javascript modules
all_dist_js_files = \
	bin/showmehow-validator.js \
	bin/showmehow-service.js.in \
	$(javascript_mocks) \
	$(javascript_tests) \
	$(resource_dist_js_files) \
	$(NULL)

all_js_files = \
	$(all_dist_js_files) \
	$(resource_nondist_js_files) \
	$(NULL)


AM_CONFIG_MACRO_DIR =
AM_DISTCHECK_CONFIGURE_FLAGS = --enable-introspection --enable-service
EXTRA_DIST = \
	com.endlessm.ShowmehowService.xml \
	com.endlessm.ShowmehowService.service.in \
	com.endlessm.showmehow.gresource.xml \
	data/lessons.json.unvalidated.in \
	files/coding-shared-dir.in \
	lib/config.js.in \
	$(all_dist_js_files) \
	$(arbitrary_files) \
	$(lesson_directories) \
	$(NULL)
CLEANFILES =

if SHOWMEHOW_SERVICE_ENABLED
# Rename the showmehow-service script
showmehow-service: $(srcdir)/bin/showmehow-service.js.in
	$(AM_V_GEN) sed -e 's,%PKGDATADIR%,$(pkgdatadir),g' $< > $@.tmp && mv -f $@.tmp $@
	chmod +x $@

# Rename the showmehow-validator script
showmehow-validator: $(abs_top_srcdir)/bin/showmehow-validator.js
	cp $< $@
	chmod +x $@

# Validation of lessons (produces data.lessons)
data/lessons.json: $(abs_top_srcdir)/data/lessons.json.unvalidated.in $(all_js_files)
	gjs --include-path=$(abs_top_srcdir) \
	    $(abs_top_srcdir)/bin/showmehow-validator.js \
	    $(abs_top_srcdir)/data/lessons.json.unvalidated.in
	mkdir -p data
	cp $< $@

# Replace coding_files_dir path
files/coding-shared-dir: files/coding-shared-dir.in
	$(AM_V_GEN) mkdir -p files && \
	$(SED) -e 's,%coding_files_dir%,$(pkgdatadir)/files,g' < $< >$@.tmp && \
	mv -f $@.tmp $@

# Install directories for lessons. We need to do this because files_DATA doesn't
# support recursive copying
install-data-local:
	mkdir -p $(DESTDIR)$(pkgdatadir)
	for i in $(lesson_directories); do \
		mkdir -p $(DESTDIR)$(pkgdatadir)/$$i && \
		cp -r $(srcdir)/$$i $$(dirname $(DESTDIR)$(pkgdatadir)/$$i/..); \
	done

uninstall-local:
	for i in $(lesson_directories); do rm -rf $(DESTDIR)/$(pkgdatadir)/$$i; done

# GResources
resource_files = \
	$(resource_dist_js_files) \
	$(resource_nondist_js_files) \
	data/lessons.json \
	$(NULL)

resourcedir = $(pkgdatadir)
resource_DATA = com.endlessm.showmehow.gresource

com.endlessm.showmehow.gresource: $(abs_top_srcdir)/com.endlessm.showmehow.gresource.xml $(resource_files)
	$(AM_V_GEN) glib-compile-resources --target=$@ --sourcedir=$(srcdir) --sourcedir=$(builddir) $<

# Scripts to install
bin_SCRIPTS = \
	showmehow-service \
	showmehow-validator \
	$(NULL)

servicedir = $(datadir)/dbus-1/services
service_DATA = com.endlessm.ShowmehowService.service

# DBus Service
com.endlessm.ShowmehowService.service: $(abs_top_srcdir)/com.endlessm.ShowmehowService.service.in
	$(AM_V_GEN) sed -e 's|@bindir[@]|${bindir}|g' $< > $@

# Script for placing files in the shared dir
pkglibexec_SCRIPTS = files/coding-shared-dir

endif SHOWMEHOW_SERVICE_ENABLED

# Generate the Showmehow GDBus Skeleton library
# GDBus-Codegen for Showmehow
Showmehow.c: $(abs_top_srcdir)/com.endlessm.ShowmehowService.xml
	gdbus-codegen --generate-c-code Showmehow --c-namespace Showmehow --c-generate-object-manager --interface-prefix com.endlessm.Showmehow. $<

Showmehow.h: Showmehow.c

gdbus_codegen_built_sources = \
	Showmehow.c \
	Showmehow.h \
	$(NULL)

libshowmehow_1_0_la_SOURCES = \
	$(gdbus_codegen_built_sources) \
	showmehow-cmd-helper.c \
	showmehow-cmd-helper.h \
	$(NULL)
libshowmehow_1_0_la_CFLAGS = $(SHOWMEHOW_SERVICE_CFLAGS)
libshowmehow_1_0_la_LIBADD = $(SHOWMEHOW_SERVICE_LIBS)

# All libraries
lib_LTLIBRARIES = libshowmehow-1.0.la

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

# Run tests when running 'make check'
TESTS = \
	$(javascript_tests) \
	run_coverage.coverage \
	$(NULL)
LOG_COMPILER = gtester
AM_LOG_FLAGS = -k --verbose

TEST_EXTENSIONS = .js .coverage

JS_LOG_DRIVER = env AM_TAP_AWK='$(AWK)' $(SHELL) $(top_srcdir)/tap-driver.sh
JS_LOG_DRIVER_FLAGS = --comments
JS_LOG_COMPILER = jasmine
AM_JS_LOG_FLAGS = --tap --no-config @JASMINE_REPORT_ARGUMENT@

# Use locally built versions of CodingGameService-1.0.gir, JS modules, and
# libraries. We clobber GJS_PATH and include the lib directory and the
# $(top_srcdir) and $(top_builddir) directories for including test helper files.
# (May need to change to AM_TESTS_ENVIRONMENT in a later version of Automake)
TESTS_ENVIRONMENT = \
	export GJS_PATH="$(top_srcdir):$(top_srcdir)/lib:$(top_builddir):$(top_builddir)/lib"; \
	export GI_TYPELIB_PATH="$(top_builddir)$${GI_TYPELIB_PATH:+:$$GI_TYPELIB_PATH}"; \
	export GSETTINGS_SCHEMA_DIR="/app/share/glib-2.0/schemas"; \
	export LD_LIBRARY_PATH="$(top_builddir)/.libs$${LD_LIBRARY_PATH:+:$$LD_LIBRARY_PATH}"; \
	export G_TEST_SRCDIR="$(abs_srcdir)/tests"; \
	export G_TEST_BUILDDIR="$(abs_builddir)/tests"; \
	export LC_ALL=C; \
	export CODING_SOURCE_FILES_DIR="$(top_srcdir)/files"; \
	export OVERRIDDEN_HOME_BASE="$${PWD}/$$(mktemp -d showmehow-service-tests-fake-home-XXXXXX)"; \
	export HOME="$$(mkdir -p $${OVERRIDDEN_HOME_BASE}/home/user; echo $${OVERRIDDEN_HOME_BASE}/home/user)"; \
	$(NULL)

# # # COVERAGE # # #

# Don't specify the resource:/// URIs here, because the tests load modules from
# the local directory, not from the GResource
EOS_JS_COVERAGE_FILES := $(patsubst $(srcdir)/%,%,$(wildcard $(srcdir)/lib/*.js))

@EOS_COVERAGE_RULES@

AM_JS_LOG_FLAGS += @EOS_JS_COVERAGE_LOG_FLAGS@

# Things to get rid of later
CLEANFILES += \
	$(bin_SCRIPTS) \
	$(service_DATA) \
	$(gdbus_codegen_built_sources) \
	com.endlessm.showmehow.gresource \
	data/lessons.json \
	files/coding-shared-dir \
	lib/config.js \
	$(NULL)
