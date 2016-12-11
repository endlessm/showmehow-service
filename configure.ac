#                                               -*- Autoconf -*-
# Process this file with autoconf to produce a configure script.

AC_PREREQ([2.69])
AC_INIT([showmehow-service], [0.0.0], [http://www.endlessm.com])
AM_INIT_AUTOMAKE([foreign subdir-objects])
AM_SILENT_RULES([yes])

# Set up libtool
LT_INIT

# Set up GObject-Introspection
GOBJECT_INTROSPECTION_CHECK([1.30.0])

# Checks for programs.

# Checks for libraries.
PKG_CHECK_MODULES(SHOWMEHOW_SERVICE, [glib-2.0 gio-2.0 gobject-2.0 gio-unix-2.0])

# Checks for SystemD
systemdsystemunitdir="$($PKG_CONFIG systemd --variable=systemdsystemunitdir)"
dnl Allow overriding systemdsystemunitdir during distcheck in order to trick
dnl Automake into allowing an install outside of $prefix
AC_ARG_WITH([systemdsystemunitdir],
    [AS_HELP_STRING([--with-systemdsystemunitdir=PATH], [directory for systemd service files])],
    [systemdsystemunitdir="$withval"])
AC_SUBST([systemdsystemunitdir])

# Checks for header files.

# Checks for typedefs, structures, and compiler characteristics.

# Checks for library functions.

AC_CONFIG_FILES([Makefile])
AC_OUTPUT
