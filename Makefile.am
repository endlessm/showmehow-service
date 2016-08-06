AM_CONFIG_MACRO_DIR =
AM_DISTCHECK_CONFIGURE_FLAGS = --enable-introspection
EXTRA_DIST = com.endlessm.Showmehow.Service.xml \
	     com.endlessm.Showmehow.Service.desktop \
	     com.endlessm.Showmehow.Service.service.in \
	     com.endlessm.showmehow.gschema.xml \
	     com.endlessm.showmehow.gresource.xml \
	     data/lessons.json \
	     showmehow-service.js
CLEANFILES =

# Rename the showmehow-service script
showmehow-service: showmehow-service.js
	cp showmehow-service.js showmehow-service

# GDBus-Codegen for Showmehow
Showmehow.c: $(abs_top_srcdir)/com.endlessm.Showmehow.Service.xml
	gdbus-codegen --generate-c-code Showmehow --c-namespace Showmehow --c-generate-object-manager --interface-prefix com.endlessm.Showmehow. $(abs_top_srcdir)/com.endlessm.Showmehow.Service.xml

gdbus_codegen_built_sources = Showmehow.c Showmehow.h

# GSettings schemas
gsettings_SCHEMAS = com.endlessm.showmehow.gschema.xml

@GSETTINGS_RULES@

# GResources

resource_files = $(shell glib-compile-resources --sourcedir=$(srcdir) --generate-dependencies $(srcdir)/com.endlessm.showmehow.gresource.xml)
showmehow-resources.h: com.endlessm.showmehow.gresource.xml $(resource_files)
	$(AM_V_GEN) glib-compile-resources --target=$@ --sourcedir=$(srcdir) --sourcedir=$(builddir) --generate --c-name showmehow $<
showmehow-resources.c: com.endlessm.showmehow.gresource.xml $(resource_files)
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
bin_SCRIPTS = showmehow-service

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
com.endlessm.Showmehow.Service.service: com.endlessm.Showmehow.Service.service.in
	$(AM_V_GEN) sed -e 's|@bindir[@]|${bindir}|g' com.endlessm.Showmehow.Service.service.in > com.endlessm.Showmehow.Service.service

# XDG Autostart
autostartdir = $(sysconfdir)/xdg/autostart
dist_autostart_DATA = com.endlessm.Showmehow.Service.desktop

# Things to get rid of later
CLEANFILES += $(bin_SCRIPTS) \
	      $(service_DATA) \
	      $(resources_built_sources) \
	      $(gdbus_codegen_built_sources) \
	      $(NULL)
