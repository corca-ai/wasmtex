/*
 * metafont-screen.c — the display Metafont links when no window system is built.
 *
 * Fonts never draw to a screen here, so these are the same no-ops web2c's trap
 * device provides, without the test support that file pulls in.
 */

int mf_trap_initscreen(void) { return 0; }
void mf_trap_updatescreen(void) {}
void mf_trap_blankrectangle(int left, int right, int top, int bottom) {}
void mf_trap_paintrow(int row, int init_color, void *transition_vector, int vector_size) {}
