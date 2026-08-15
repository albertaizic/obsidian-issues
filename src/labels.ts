/**
 * Size of the label palette. The colours themselves live in `styles.css` as
 * `.is-label-color-0` … `.is-label-color-9`; nothing here knows what they are.
 */
export const LABEL_COLOR_COUNT = 10;

const LABEL_COLOR_CLASS_PREFIX = 'is-label-color-';

/**
 * Maps a label name onto a palette slot. The hash is deliberately unchanged
 * from the version that returned a hex value directly, so every existing
 * label keeps the colour it has always had.
 */
export function getLabelColorIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % LABEL_COLOR_COUNT;
}

export function getLabelColorClass(name: string): string {
  return `${LABEL_COLOR_CLASS_PREFIX}${getLabelColorIndex(name)}`;
}

/**
 * Tags an element with its palette class.
 *
 * Obsidian's plugin guidelines disallow assigning styles from JavaScript, and
 * that includes writing CSS custom properties onto `el.style` — which is what
 * this used to do. The class is the only thing decided at runtime; the colour
 * pair behind it is declared in `styles.css`, so themes and snippets can
 * restyle the palette.
 *
 * Any previously applied palette class is cleared first, so re-applying to the
 * same element replaces the colour rather than stacking a second one.
 */
export function applyLabelColor(el: HTMLElement, name: string): void {
  for (let i = 0; i < LABEL_COLOR_COUNT; i++) {
    el.removeClass(`${LABEL_COLOR_CLASS_PREFIX}${i}`);
  }
  el.addClass(getLabelColorClass(name));
}
