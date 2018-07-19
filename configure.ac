#                                               -*- Autoconf -*-
# Process this file with autoconf to produce a configure script.

AC_PREREQ([2.69])
AC_INIT([showmehow-service], [0.0.0], [http://www.endlessm.com])
AM_INIT_AUTOMAKE([1.12 foreign subdir-objects parallel-tests])
AM_SILENT_RULES([yes])

# Custom macros
AC_CONFIG_MACRO_DIRS([m4])

# Set up libtool
LT_INIT

# Set up GObject-Introspection
GOBJECT_INTROSPECTION_CHECK([1.30.0])

# Checks for programs.
AC_PROG_AWK  # needed for TAP driver
AC_PROG_SED  # needed for finding files for coverage
AC_REQUIRE_AUX_FILE([tap-driver.sh])

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

# Build options
AC_ARG_ENABLE([service], [Showmehow service], [
  SHOWMEHOW_SERVICE_ENABLED=$enableval
], [
  SHOWMEHOW_SERVICE_ENABLED=yes
])
AM_CONDITIONAL([SHOWMEHOW_SERVICE_ENABLED], [test "x$SHOWMEHOW_SERVICE_ENABLED" = "xyes"])

# Checks for header files.

# Checks for typedefs, structures, and compiler characteristics.

# Checks for library functions.

# JASMINE_JUNIT_REPORTS_DIR: Where to put test reports
AC_MSG_CHECKING([where to put test reports])
AC_ARG_VAR([JASMINE_JUNIT_REPORTS_DIR], [Where to put test reports])
AS_IF([test -n "$JASMINE_JUNIT_REPORTS_DIR"],
    [JASMINE_REPORT_ARGUMENT="--junit $JASMINE_JUNIT_REPORTS_DIR/\$\${log/%.log/.js.xml}"
    AC_MSG_RESULT([in $JASMINE_JUNIT_REPORTS_DIR])],
    [JASMINE_REPORT_ARGUMENT=
    AC_MSG_RESULT([nowhere])])
AC_SUBST([JASMINE_REPORT_ARGUMENT])

# Code Coverage
# -------------
EOS_COVERAGE_REPORT([js])

AC_CONFIG_FILES([Makefile])
AC_OUTPUT

echo "
        Build Showmehow service:    ${SHOWMEHOW_SERVICE_ENABLED}

"
