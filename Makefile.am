# Arbitrary files
arbitrary_files = files/sw.txt files/background_pic.jpg

filesdir = $(pkgdatadir)/files
files_DATA = $(arbitrary_files)

# Resource javascript modules
resource_js_files = \
	lib/validation.js \
	lib/config.js \
	$(NULL)

# All javascript modules
all_js_files = \
	showmehow-validator.js \
	showmehow-service.js \
	$(resource_js_files) \
	$(NULL)


AM_CONFIG_MACRO_DIR =
AM_DISTCHECK_CONFIGURE_FLAGS = --enable-introspection
EXTRA_DIST = com.endlessm.Showmehow.Service.xml \
	     com.endlessm.Showmehow.Service.desktop \
	     com.endlessm.Showmehow.Service.service.in \
	     com.endlessm.showmehow.gschema.xml \
	     com.endlessm.showmehow.gresource.xml \
	     data/lessons.json.unvalidated.in \
	     $(all_js_files) \
	     $(arbitrary_files) \
	     $(NULL)
CLEANFILES =

lib/config.js: $(srcdir)/lib/config.js.in
	$(AM_V_GEN) sed -e 's,%CODING_FILES_DIR%,$(pkgdatadir)/files,g' $< > $@.tmp && \
	mv -f $@.tmp $@

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

gdbus_codegen_built_sources = Showmehow.c Showmehow.h

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

# GResources

resource_files = $(resource_js_files) \
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
			      $(NULL)
libshowmehow_1_0_la_CFLAGS = @SHOWMEHOW_CFLAGS@
libshowmehow_1_0_la_LDFLAGS = @SHOWMEHOW_LDFLAGS@
libshowmehow_1_0_la_LIBADD = @SHOWMEHOW_LIBS@

# All libraries
lib_LTLIBRARIES = libshowmehow-1.0.la

# Scripts to install
bin_SCRIPTS = showmehow-service \
	      showmehow-validator

# Header files to install
showmehowincludedir = $(includedir)/showmehow-service
nobase_showmehowinclude_HEADERS = \
	Showmehow.h

# GObject-Introspection support
include $(INTROSPECTION_MAKEFILE)
INTROSPECTION_GIRS = $(NULL)
INTROSPECTION_SCANNER_ARGS = --add-include-path=$(srcdir) --warn-all
INTROSPECTION_COMPILER_ARGS = --includedir=$(srcdir)

if HAVE_INTROSPECTION
introspection_sources = $(libshowmehow_1_0_la_SOURCES)

Showmehow-1.0.gir: libshowmehow-1.0.la
Showmehow_1_0_gir_INCLUDES = GObject-2.0 Gio-2.0
Showmehow_1_0_gir_CFLAGS = $(INCLUDES)
Showmehow_1_0_gir_LIBS = libshowmehow-1.0.la
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

# XDG Autostart
autostartdir = $(sysconfdir)/xdg/autostart
dist_autostart_DATA = com.endlessm.Showmehow.Service.desktop

# Things to get rid of later
CLEANFILES += $(bin_SCRIPTS) \
	      $(service_DATA) \
	      $(resources_built_sources) \
	      $(gdbus_codegen_built_sources) \
	      data/lessons.json \
	      lib/config.js
	      $(NULL)
