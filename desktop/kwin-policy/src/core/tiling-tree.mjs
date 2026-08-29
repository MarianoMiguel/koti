// COSMIC-class automatic tiling (PRD §12, Automatic policy).
//
// Internally a binary split tree — like COSMIC/i3 — but the tree is an
// implementation detail, never UI vocabulary. The user experiences:
//   - a new window splits the *focused* tile; orientation follows the tile's
//     aspect ratio (wide → side-by-side, tall → stacked)
//   - dragging a window over another inserts by quadrant (left/right/top/bottom)
//   - dragging a shared edge resizes the underlying split
//   - directional focus/move with the keyboard
// Pure and immutable: trees are plain JSON-able objects, rects in / rects out.
//
// Node: {type:'leaf', id} | {type:'split', dir:'h'|'v', ratio, a, b}
// 'h': a left, b right. 'v': a top, b bottom.

const clampRatio = (r) => Math.max(0.1, Math.min(0.9, r));

export function leaf(id) {
  return { type: "leaf", id };
}

function split(dir, ratio, a, b) {
  return { type: "split", dir, ratio: clampRatio(ratio), a, b };
}

/** In-order window ids. */
export function windows(tree) {
  if (!tree) return [];
  if (tree.type === "leaf") return [tree.id];
  return [...windows(tree.a), ...windows(tree.b)];
}

/** Tile rects for the whole tree. */
export function computeRects(tree, screen, gap = 0) {
  const out = new Map();
  const walk = (node, rect) => {
    if (node.type === "leaf") {
      out.set(node.id, rect);
      return;
    }
    const [ra, rb] = splitRect(rect, node.dir, node.ratio, gap);
    walk(node.a, ra);
    walk(node.b, rb);
  };
  if (tree) walk(tree, { ...screen });
  return out;
}

function splitRect(rect, dir, ratio, gap) {
  if (dir === "h") {
    const aw = Math.round((rect.width - gap) * ratio);
    return [
      { x: rect.x, y: rect.y, width: aw, height: rect.height },
      { x: rect.x + aw + gap, y: rect.y, width: rect.width - aw - gap, height: rect.height },
    ];
  }
  const ah = Math.round((rect.height - gap) * ratio);
  return [
    { x: rect.x, y: rect.y, width: rect.width, height: ah },
    { x: rect.x, y: rect.y + ah + gap, width: rect.width, height: rect.height - ah - gap },
  ];
}

/**
 * Insert a window by splitting the target tile (the focused one, per COSMIC).
 * Without a target — or when it's gone — the largest tile splits, which keeps
 * unattended inserts balanced. Orientation follows the target tile's aspect.
 */
export function insertWindow(tree, id, { at = null, screen, gap = 0 } = {}) {
  if (!tree) return leaf(id);
  const rects = computeRects(tree, screen, gap);
  let targetId = at !== null && rects.has(at) ? at : null;
  if (targetId === null) {
    let best = -1;
    for (const [wid, r] of rects) {
      const area = r.width * r.height;
      if (area > best) {
        best = area;
        targetId = wid;
      }
    }
  }
  const rect = rects.get(targetId);
  const dir = rect.width >= rect.height ? "h" : "v";
  return replaceLeaf(tree, targetId, (l) => split(dir, 0.5, l, leaf(id)));
}

export function removeWindow(tree, id) {
  if (!tree) return null;
  if (tree.type === "leaf") return tree.id === id ? null : tree;
  const a = removeWindow(tree.a, id);
  const b = removeWindow(tree.b, id);
  if (a === null) return b; // parent collapses into the surviving sibling
  if (b === null) return a;
  if (a === tree.a && b === tree.b) return tree;
  return { ...tree, a, b };
}

/**
 * Drag-and-drop insertion: drop `dragId` onto `targetId`'s quadrant.
 * left/right → side-by-side; top/bottom → stacked.
 */
export function dropAt(tree, dragId, targetId, quadrant) {
  if (dragId === targetId) return tree;
  const pruned = removeWindow(tree, dragId);
  if (!pruned) return leaf(dragId);
  const make = (l) => {
    switch (quadrant) {
      case "left":
        return split("h", 0.5, leaf(dragId), l);
      case "right":
        return split("h", 0.5, l, leaf(dragId));
      case "top":
        return split("v", 0.5, leaf(dragId), l);
      case "bottom":
        return split("v", 0.5, l, leaf(dragId));
      default:
        throw new RangeError(`unknown quadrant: ${quadrant}`);
    }
  };
  return replaceLeaf(pruned, targetId, make);
}

export function swapWindows(tree, idA, idB) {
  if (!tree) return tree;
  if (tree.type === "leaf") {
    if (tree.id === idA) return leaf(idB);
    if (tree.id === idB) return leaf(idA);
    return tree;
  }
  return { ...tree, a: swapWindows(tree.a, idA, idB), b: swapWindows(tree.b, idA, idB) };
}

/**
 * Spatial neighbor for keyboard focus (dir: 'left'|'right'|'up'|'down').
 * Chooses by direction of tile centers, requiring perpendicular overlap;
 * nearest edge wins, larger overlap breaks ties.
 */
export function focusDirection(tree, id, dir, screen, gap = 0) {
  const rects = computeRects(tree, screen, gap);
  const me = rects.get(id);
  if (!me) return null;
  const horizontal = dir === "left" || dir === "right";
  const sign = dir === "left" || dir === "up" ? -1 : 1;
  let best = null;
  for (const [wid, r] of rects) {
    if (wid === id) continue;
    const forward = horizontal
      ? sign * (r.x + r.width / 2 - (me.x + me.width / 2))
      : sign * (r.y + r.height / 2 - (me.y + me.height / 2));
    if (forward <= 0) continue;
    const overlap = horizontal
      ? Math.min(me.y + me.height, r.y + r.height) - Math.max(me.y, r.y)
      : Math.min(me.x + me.width, r.x + r.width) - Math.max(me.x, r.x);
    if (overlap <= 0) continue;
    if (!best || forward < best.forward || (forward === best.forward && overlap > best.overlap)) {
      best = { id: wid, forward, overlap };
    }
  }
  return best ? best.id : null;
}

/**
 * Flip the orientation of the split a window sits in — hyprland's
 * `togglesplit`. Side-by-side becomes stacked and back, for the *deepest*
 * split containing this window, which is the one the user is looking at.
 */
export function toggleOrientation(tree, id) {
  const path = pathTo(tree, id);
  if (!path || path.length === 0) return tree;
  const parent = path[path.length - 1].node;
  return replaceNode(tree, parent, { ...parent, dir: parent.dir === "h" ? "v" : "h" });
}

/**
 * Swap a window with the first tile in the layout — the "master", in the
 * vocabulary every tiling WM shares even when the tree does not have one.
 */
export function swapWithMaster(tree, id) {
  const order = windows(tree);
  if (order.length < 2) return tree;
  const master = order[0];
  if (master === id) return tree;
  return swapWindows(tree, master, id);
}

/** The window after `id` in tile order, wrapping — hyprland's `cyclenext`. */
export function cycleNext(tree, id, delta = 1) {
  const order = windows(tree);
  if (order.length === 0) return null;
  const at = order.indexOf(id);
  if (at === -1) return order[0];
  return order[(at + delta + order.length) % order.length];
}

/** Keyboard move: swap with the spatial neighbor in `dir` (no-op at edges). */
export function moveDirection(tree, id, dir, screen, gap = 0) {
  const other = focusDirection(tree, id, dir, screen, gap);
  return other ? swapWindows(tree, id, other) : tree;
}

/**
 * Resize by dragging one edge of a window outward (positive delta grows it).
 * The deepest ancestor split whose boundary is that edge absorbs the change.
 */
export function resizeEdge(tree, id, edge, deltaPx, screen, gap = 0) {
  const path = pathTo(tree, id);
  if (!path) return tree;
  // Deepest matching ancestor: walk from the leaf upward.
  for (let i = path.length - 1; i >= 0; i--) {
    const { node, side } = path[i];
    const matches =
      (edge === "right" && node.dir === "h" && side === "a") ||
      (edge === "left" && node.dir === "h" && side === "b") ||
      (edge === "bottom" && node.dir === "v" && side === "a") ||
      (edge === "top" && node.dir === "v" && side === "b");
    if (!matches) continue;
    const rect = rectOfNode(tree, node, screen, gap);
    const span = (node.dir === "h" ? rect.width : rect.height) - gap;
    // Growing the a-side raises the ratio; growing the b-side lowers it.
    const grow = side === "a" ? deltaPx : -deltaPx;
    return replaceNode(tree, node, { ...node, ratio: clampRatio(node.ratio + grow / span) });
  }
  return tree; // screen-edge: nothing to resize against
}

// --- internal helpers -------------------------------------------------------

function replaceLeaf(tree, id, make) {
  if (tree.type === "leaf") return tree.id === id ? make(tree) : tree;
  const a = replaceLeaf(tree.a, id, make);
  if (a !== tree.a) return { ...tree, a };
  const b = replaceLeaf(tree.b, id, make);
  if (b !== tree.b) return { ...tree, b };
  return tree;
}

/** Ancestor chain to a leaf as [{node, side}, …] from root to parent-of-leaf. */
function pathTo(tree, id, acc = []) {
  if (!tree) return null;
  if (tree.type === "leaf") return tree.id === id ? acc : null;
  return (
    pathTo(tree.a, id, [...acc, { node: tree, side: "a" }]) ??
    pathTo(tree.b, id, [...acc, { node: tree, side: "b" }])
  );
}

function rectOfNode(tree, target, screen, gap) {
  let found = null;
  const walk = (node, rect) => {
    if (found) return;
    if (node === target) {
      found = rect;
      return;
    }
    if (node.type === "leaf") return;
    const [ra, rb] = splitRect(rect, node.dir, node.ratio, gap);
    walk(node.a, ra);
    walk(node.b, rb);
  };
  walk(tree, { ...screen });
  return found;
}

function replaceNode(tree, target, replacement) {
  if (tree === target) return replacement;
  if (tree.type === "leaf") return tree;
  const a = replaceNode(tree.a, target, replacement);
  if (a !== tree.a) return { ...tree, a };
  const b = replaceNode(tree.b, target, replacement);
  if (b !== tree.b) return { ...tree, b };
  return tree;
}
