AM_CONFIG_MACRO_DIR =
AM_DISTCHECK_CONFIGURE_FLAGS = --enable-introspection
EXTRA_DIST = com.endlessm.Showmehow.Service.xml
CLEANFILES = 


# Generate the Showmehow GDBus Skeleton library
libshowmehow_1_0_la_SOURCES = Showmehow.c \
							  Showmehow.h
libshowmehow_1_0_la_CFLAGS = @SHOWMEHOW_CFLAGS@
libshowmehow_1_0_la_LDFLAGS = @SHOWMEHOW_LDFLAGS@
libshowmehow_1_0_la_LIBADD = @SHOWMEHOW_LIBS@

# All libraries
lib_LTLIBRARIES = libshowmehow-1.0.la

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

# GDBus-Codegen for Showmehow
Showmehow.c:
	gdbus-codegen --generate-c-code Showmehow --c-namespace Showmehow --c-generate-object-manager --interface-prefix com.endlessm.Showmehow. $(abs_top_srcdir)/com.endlessm.Showmehow.Service.xml


