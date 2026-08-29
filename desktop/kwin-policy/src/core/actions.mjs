// Raycast-style window actions (Mariano's vicinae setup, ported).
//
// These are the "put this window somewhere sensible, now" commands — almost
// maximize, center, halves, thirds, quarters — that a floating desktop lives
// on. The geometry matches his GNOME extension exactly, including the 8px gap
// and the rounding, so muscle memory carries over from NixOS.
//
// They belong to the modes where the user places windows themselves: Floating
// and Stage. Tiling and Scrolling decide placement for you, so an action that
// says "left half" has nothing to act on there.

/** Matches the GNOME extension's GAP, and the tiling gap, so nothing jumps. */
export const GAP = 8;

/**
 * Fractions of the work area: [x, y, width, height], each 0–1.
 * Kept as data, and kept in the same order as the original, so the two can be
 * diffed by eye if he changes one.
 */
export const FRACTIONAL_LAYOUTS = {
  "left-half": [0, 0, 1 / 2, 1],
  "center-half": [1 / 4, 0, 1 / 2, 1],
  "right-half": [1 / 2, 0, 1 / 2, 1],
  "top-half": [0, 0, 1, 1 / 2],
  "bottom-half": [0, 1 / 2, 1, 1 / 2],

  "first-third": [0, 0, 1 / 3, 1],
  "first-two-thirds": [0, 0, 2 / 3, 1],
  "center-third": [1 / 3, 0, 1 / 3, 1],
  "last-two-thirds": [1 / 3, 0, 2 / 3, 1],
  "last-third": [2 / 3, 0, 1 / 3, 1],

  "top-third": [0, 0, 1, 1 / 3],
  "top-two-thirds": [0, 0, 1, 2 / 3],
  "middle-third": [0, 1 / 3, 1, 1 / 3],
  "bottom-two-thirds": [0, 1 / 3, 1, 2 / 3],
  "bottom-third": [0, 2 / 3, 1, 1 / 3],

  "first-fourth": [0, 0, 1 / 4, 1],
  "second-fourth": [1 / 4, 0, 1 / 4, 1],
  "third-fourth": [1 / 2, 0, 1 / 4, 1],
  "last-fourth": [3 / 4, 0, 1 / 4, 1],

  "top-left-quarter": [0, 0, 1 / 2, 1 / 2],
  "top-right-quarter": [1 / 2, 0, 1 / 2, 1 / 2],
  "bottom-left-quarter": [0, 1 / 2, 1 / 2, 1 / 2],
  "bottom-right-quarter": [1 / 2, 1 / 2, 1 / 2, 1 / 2],

  "top-left-sixth": [0, 0, 1 / 3, 1 / 2],
  "top-center-sixth": [1 / 3, 0, 1 / 3, 1 / 2],
  "top-right-sixth": [2 / 3, 0, 1 / 3, 1 / 2],
  "bottom-left-sixth": [0, 1 / 2, 1 / 3, 1 / 2],
  "bottom-center-sixth": [1 / 3, 1 / 2, 1 / 3, 1 / 2],
  "bottom-right-sixth": [2 / 3, 1 / 2, 1 / 3, 1 / 2],
  "top-center-two-thirds": [1 / 6, 0, 2 / 3, 2 / 3],
};

/** Actions that are not a simple fraction of the work area. */
export const SPECIAL_ACTIONS = [
  "maximize",
  "almost-maximize",
  "reasonable-size",
  "center",
  "maximize-width",
  "maximize-height",
];

export const ACTIONS = Object.keys(FRACTIONAL_LAYOUTS).concat(SPECIAL_ACTIONS);

/** Edges snap to the fraction, then pull in by the gap on every side. */
export function fractionalRect(workArea, [x, y, width, height], gap = GAP) {
  const left = Math.round(workArea.x + workArea.width * x) + gap;
  const top = Math.round(workArea.y + workArea.height * y) + gap;
  const right = Math.round(workArea.x + workArea.width * (x + width)) - gap;
  const bottom = Math.round(workArea.y + workArea.height * (y + height)) - gap;
  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

export function centeredRect(workArea, requestedWidth, requestedHeight, gap = GAP) {
  const width = Math.min(Math.round(requestedWidth), workArea.width - gap * 2);
  const height = Math.min(Math.round(requestedHeight), workArea.height - gap * 2);
  return {
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
    width,
    height,
  };
}

/**
 * The geometry an action asks for.
 *
 * @param {string} action one of ACTIONS
 * @param {{frame: object, workArea: object, gap?: number}} context
 *        `frame` is where the window is now — `center` and the
 *        maximize-one-axis actions are relative to it.
 * @returns {{x: number, y: number, width: number, height: number}}
 */
export function actionRect(action, { frame, workArea, gap = GAP }) {
  if (FRACTIONAL_LAYOUTS[action]) {
    return fractionalRect(workArea, FRACTIONAL_LAYOUTS[action], gap);
  }
  switch (action) {
    case "maximize":
      return {
        x: workArea.x,
        y: workArea.y,
        width: workArea.width,
        height: workArea.height,
      };
    case "almost-maximize":
      return centeredRect(workArea, workArea.width * 0.9, workArea.height * 0.9, gap);
    case "reasonable-size":
      return centeredRect(
        workArea,
        Math.min(1025, workArea.width * 0.6),
        Math.min(900, workArea.height * 0.6),
        gap,
      );
    case "center":
      return centeredRect(workArea, frame.width, frame.height, gap);
    case "maximize-width":
      return {
        x: workArea.x + gap,
        y: frame.y,
        width: workArea.width - gap * 2,
        height: frame.height,
      };
    case "maximize-height":
      return {
        x: frame.x,
        y: workArea.y + gap,
        width: frame.width,
        height: workArea.height - gap * 2,
      };
    default:
      throw new RangeError(`unknown window action: ${action}`);
  }
}
