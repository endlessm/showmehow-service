/*
 * showmehow-cmd-helper.h
 *
 * Copyright (c) 2016-2017 Endless Mobile, Inc.
 *
 * This is a small helper class which wraps a GPollableInputStream
 * and returns a GBytes (since g_pollable_input_stream_read_nonblocking
 * only appears to return a ByteArray)
 *
 */

#include <gio/gio.h>
#include <glib-2.0/glib.h>

#ifndef _SHOWMEHOW_CMD_HELPER_H
#define _SHOWMEHOW_CMD_HELPER_H

G_BEGIN_DECLS

GBytes * showmehow_read_nonblock_input_stream_for_bytes (GPollableInputStream *pollable_stream);

G_END_DECLS

#endif
