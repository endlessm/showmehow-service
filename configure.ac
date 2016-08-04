#                                               -*- Autoconf -*-
# Process this file with autoconf to produce a configure script.

AC_PREREQ([2.69])
AC_INIT([showmehow], [0.0.1], [http://www.endlessm.com])
AM_INIT_AUTOMAKE([foreign subdir-objects])
AM_SILENT_RULES([yes])

# Set up libtool
LT_INIT

# Set up GObject-Introspection
GOBJECT_INTROSPECTION_CHECK([1.30.0])

# Set up GSettings
GLIB_GSETTINGS

# Checks for programs.

# Checks for libraries.
PKG_CHECK_MODULES(SHOWMEHOW, [glib-2.0 gio-2.0 gobject-2.0 gio-unix-2.0])

# Checks for header files.

# Checks for typedefs, structures, and compiler characteristics.

# Checks for library functions.

AC_SUBST([SHOWMEHOW_CFLAGS])
AC_SUBST([SHOWMEHOW_LDFLAGS])
AC_CONFIG_FILES([Makefile])
AC_OUTPUT
