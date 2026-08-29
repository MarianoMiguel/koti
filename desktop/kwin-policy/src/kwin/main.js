// KWin adapter — binds the pure core (src/core/) to the KWin scripting API.
// Bundled by `npm run build:kwin` into package/contents/code/main.js (KWin
// loads a single script file; the ESM graph is an authoring convenience).
//
// Adapter v0 is OBSERVING ONLY: it loads, logs, and proves the core bundles
// and initializes inside KWin. Geometry application lands with M3-01 on the
// P14s through the Customizer loop (`osctl desktop reload`, M1-08).
//
// PRD §72 in spirit: everything testable lives in core/; this privileged layer
// stays small and reviewable.

import { MODES, createModeState, getMode } from "../core/mode-state.mjs";
import * as tiling from "../core/tiling.mjs";
import * as tree from "../core/tiling-tree.mjs";
import * as scrolling from "../core/scrolling.mjs";
import * as stage from "../core/stage.mjs";

const CORE = { tiling, tree, scrolling, stage };

export function init(ws) {
    const state = createModeState();
    print(`Koti window policy loaded (adapter v0, modes: ${MODES.join(", ")})`);
    print(`Koti: current desktop mode = ${getMode(state, "d1", "out1")} (default)`);

    // M3-01 wiring points (kept as signal names for on-device work):
    //   ws.windowAdded / ws.windowRemoved      → controller membership
    //   ws.windowActivated                     → focus for scrolling/stage
    //   ws.currentDesktopChanged / screens     → active (workspace × output) cell
    void ws;
    void CORE;
}

// `workspace` exists only inside KWin's script environment.
if (typeof workspace !== "undefined") {
    init(workspace);
}
