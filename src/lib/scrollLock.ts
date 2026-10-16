/**
 * Keeps the page behind an open modal from scrolling, shared by every modal.
 *
 * Each modal used to save the page's overflow when it opened and put it back
 * when it closed. With two open at once, closing them out of order "restored"
 * the hidden overflow of the other, and the page stayed locked after
 * everything had closed: it looked frozen. Here the locks are counted, and
 * the page scrolls again only when the last one is let go.
 *
 * Browser only.
 */

let held = 0;
let before = '';

/** Locks the page; call what it returns to let go (calling it twice is harmless). */
export function lockScroll(): () => void {
  if (held++ === 0) {
    before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--held === 0) document.body.style.overflow = before;
  };
}
