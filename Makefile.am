AM_CONFIG_MACRO_DIR =
AM_DISTCHECK_CONFIGURE_FLAGS = --enable-introspection
EXTRA_DIST = com.endlessm.Sylvester.Service.xml
CLEANFILES = 


# Generate the Sylvester GDBus Skeleton library
libsylvester_1_0_la_SOURCES = Sylvester.c \
							  Sylvester.h
libsylvester_1_0_la_CFLAGS = @SYLVESTER_CFLAGS@
libsylvester_1_0_la_LDFLAGS = @SYLVESTER_LDFLAGS@
libsylvester_1_0_la_LIBADD = @SYLVESTER_LIBS@

# All libraries
lib_LTLIBRARIES = libsylvester-1.0.la

# GObject-Introspection support
include $(INTROSPECTION_MAKEFILE)
INTROSPECTION_GIRS = $(NULL)
INTROSPECTION_SCANNER_ARGS = --add-include-path=$(srcdir) --warn-all
INTROSPECTION_COMPILER_ARGS = --includedir=$(srcdir)

if HAVE_INTROSPECTION
introspection_sources = $(libsylvester_1_0_la_SOURCES)

Sylvester-1.0.gir: libsylvester-1.0.la
Sylvester_1_0_gir_INCLUDES = GObject-2.0 Gio-2.0
Sylvester_1_0_gir_CFLAGS = $(INCLUDES)
Sylvester_1_0_gir_LIBS = libsylvester-1.0.la
Sylvester_1_0_gir_FILES = $(introspection_sources)
INTROSPECTION_GIRS += Sylvester-1.0.gir

girdir = $(datadir)/gir-1.0
gir_DATA = $(INTROSPECTION_GIRS)

typelibdir = $(libdir)/girepository-1.0
typelib_DATA = $(INTROSPECTION_GIRS:.gir=.typelib)

CLEANFILES += $(gir_DATA) $(typelib_DATA)
endif

# GDBus-Codegen for Sylvester
Sylvester.c:
	gdbus-codegen --generate-c-code Sylvester --c-namespace Sylvester --c-generate-object-manager --interface-prefix com.endlessm.Sylvester. $(abs_top_srcdir)/com.endlessm.Sylvester.Service.xml


