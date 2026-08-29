// KWin adapter — binds the pure core (src/core/) to the KWin scripting API.
//
// NOT WIRED YET. This layer needs a live Plasma/KWin session and is developed
// on the P14s through the Customizer loop (`osctl desktop reload`, M1-08).
// Responsibilities when wired:
//   - subscribe to workspace signals (windowAdded, windowRemoved, focus,
//     virtualDesktop/output changes)
//   - resolve the active cell's mode via core/mode-state and delegate geometry
//     to the owning controller (tiling/scrolling/stage; floating stays native)
//   - apply returned rects to KWin windows; never compute layout here
//   - persist mode-state JSON via KWin script configuration
//
// Keeping this file logic-free is a PRD §72 requirement in spirit: everything
// testable lives in core/, everything privileged stays small and reviewable.
