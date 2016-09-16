# Resource javascript modules
resource_js_files = \
	lib/validation.js \
	$(NULL)

# All javascript modules
all_js_files = \
	coding-game-validator.js \
	coding-game-service.js \
	$(resource_js_files)
	$(NULL)


AM_CONFIG_MACRO_DIR =
AM_DISTCHECK_CONFIGURE_FLAGS = --enable-introspection
EXTRA_DIST = com.endlessm.CodingGameService.xml \
	     com.endlessm.CodingGameService.desktop \
	     com.endlessm.CodingGameService.service.in \
	     com.endlessm.CodingGameService.gschema.xml \
	     com.endlessm.CodingGameService.gresource.xml \
	     data/lessons.json.unvalidated.in \
	     $(all_js_files)
CLEANFILES =

# Rename the showmehow-service script
coding-game-service: $(abs_top_srcdir)/coding-game-service.js
	cp $< $@
	chmod +x $@

# Rename the showmehow-validator script
coding-game-validator: $(abs_top_srcdir)/coding-game-validator.js
	cp $< $@
	chmod +x $@

# GDBus-Codegen for CodingGameService
CodingGameService.c: $(abs_top_srcdir)/com.endlessm.CodingGameService.xml
	gdbus-codegen --generate-c-code CodingGameService --c-namespace CodingGameService --c-generate-object-manager --interface-prefix com.endlessm. $<

CodingGameService.h: CodingGameService.c

gdbus_codegen_built_sources = CodingGameService.c CodingGameService.h

# GSettings schemas
gsettings_SCHEMAS = com.endlessm.CodingGameService.gschema.xml

@GSETTINGS_RULES@

# Validation of lessons (produces data.lessons)
data/lessons.json: $(abs_top_srcdir)/data/lessons.json.unvalidated.in $(all_js_files)
	gjs --include-path=$(abs_top_srcdir) \
	    $(abs_top_srcdir)/coding-game-validator.js \
	    $(abs_top_srcdir)/data/lessons.json.unvalidated.in
	mkdir -p data
	cp $< $@

# GResources

resource_files = $(resource_js_files) \
	data/lessons.json \
	$(NULL)

coding-game-service-resources.h: $(abs_top_srcdir)/com.endlessm.CodingGameService.gresource.xml $(resource_files)
	$(AM_V_GEN) glib-compile-resources --target=$@ --sourcedir=$(srcdir) --sourcedir=$(builddir) --generate --c-name coding_game_service $<
coding-game-service-resources.c: $(abs_top_srcdir)/com.endlessm.CodingGameService.gresource.xml $(resource_files)
	$(AM_V_GEN) glib-compile-resources --target=$@ --sourcedir=$(srcdir) --sourcedir=$(builddir) --generate --c-name coding_game_service $<

resources_built_sources = coding-game-service-resources.c coding-game-service-resources.h

# Generate the CodingGameService GDBus Skeleton library
libcoding_game_service_1_0_la_SOURCES = $(resources_built_sources) \
					$(gdbus_codegen_built_sources) \
					$(NULL)
libcoding_game_service_1_0_la_CFLAGS = @CODING_GAME_SERVICE_CFLAGS@
libcoding_game_service_1_0_la_LDFLAGS = @CODING_GAME_SERVICE_LDFLAGS@
libcoding_game_service_1_0_la_LIBADD = @CODING_GAME_SERVICE_LIBS@

# All libraries
lib_LTLIBRARIES = libcoding_game_service-1.0.la

# Scripts to install
bin_SCRIPTS = coding-game-service \
	      coding-game-validator

# Header files to install
coding_game_serviceincludedir = $(includedir)/coding-game-service
nobase_coding_game_serviceinclude_HEADERS = \
	CodingGameService.h

# GObject-Introspection support
include $(INTROSPECTION_MAKEFILE)
INTROSPECTION_GIRS = $(NULL)
INTROSPECTION_SCANNER_ARGS = --add-include-path=$(srcdir) --warn-all
INTROSPECTION_COMPILER_ARGS = --includedir=$(srcdir)

if HAVE_INTROSPECTION
introspection_sources = $(libcoding_game_service_1_0_la_SOURCES)

CodingGameService-1.0.gir: libcoding_game_service-1.0.la
CodingGameService_1_0_gir_INCLUDES = GObject-2.0 Gio-2.0
CodingGameService_1_0_gir_CFLAGS = $(INCLUDES)
CodingGameService_1_0_gir_LIBS = libcoding_game_service-1.0.la
CodingGameService_1_0_gir_FILES = $(introspection_sources)
INTROSPECTION_GIRS += CodingGameService-1.0.gir

girdir = $(datadir)/gir-1.0
gir_DATA = $(INTROSPECTION_GIRS)

typelibdir = $(libdir)/girepository-1.0
typelib_DATA = $(INTROSPECTION_GIRS:.gir=.typelib)

CLEANFILES += $(gir_DATA) $(typelib_DATA)
endif

servicedir = $(datadir)/dbus-1/services
service_DATA = com.endlessm.CodingGameService.service

# DBus Service
com.endlessm.CodingGameService.service: $(abs_top_srcdir)/com.endlessm.CodingGameService.service.in
	$(AM_V_GEN) sed -e 's|@bindir[@]|${bindir}|g' $< > $@

# XDG Autostart
autostartdir = $(sysconfdir)/xdg/autostart
dist_autostart_DATA = com.endlessm.CodingGameService.desktop

# Things to get rid of later
CLEANFILES += $(bin_SCRIPTS) \
	      $(service_DATA) \
	      $(resources_built_sources) \
	      $(gdbus_codegen_built_sources) \
	      data/lessons.json \
	      $(NULL)
