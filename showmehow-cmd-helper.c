/*
 * showmehow-cmd-helper.c
 *
 * This is a small helper class which wraps a GPollableInputStream
 * and returns a GBytes (since g_pollable_input_stream_read_nonblocking
 * only appears to return a ByteArray)
 *
 */

#include <gio/gio.h>
#include <glib.h>

#define BUFLEN 1024

GBytes *
showmehow_read_nonblock_input_stream_for_bytes (GPollableInputStream *pollable_stream,
                                                GError               *error)
{
    /* We'll use a GByteArray here to keep copying information in and a static buffer of
     * 1024 bytes of character data to read the input stream */
    guchar buffer[BUFLEN];
    
    GByteArray *array = g_byte_array_new ();
    size_t read = 0;
    GError *read_error = NULL;
    
    while ((read = g_pollable_input_stream_read_nonblocking (pollable_stream,
                                                             (void *) buffer,
                                                             len,
                                                             NULL,
                                                             &read_error)) != 0)
      {
        if (read_error)
          {
            if (!g_error_matches (read_error, G_IO_ERROR, G_IO_ERROR_WOULD_BLOCK))
              {
                g_propagate_error (&error, read_error);
                g_byte_array_unref (array);
                return NULL;
              }

            /* We received -EWOULDBLOCK. Return now */
            break;
          } else {
            /* Okay, now append read bytes to the array */
            g_byte_array_append (array, buffer, read);
          }
      }

    return g_byte_array_free_to_bytes (array);
}
