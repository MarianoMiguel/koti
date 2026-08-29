import { test } from "node:test";
import assert from "node:assert/strict";
import * as ctl from "../src/core/controller.mjs";
import { PRESET_WIDTHS } from "../src/core/scrolling.mjs";

const screen = { x: 0, y: 0, width: 1000, height: 600 };
const WS = 1;
const OUT = "eDP-1";

function scrolled(...ids) {
  const c = ctl.createController({ gap: 0 });
  for (const id of ids) ctl.addWindow(c, WS, OUT, id);
  ctl.switchMode(c, WS, OUT, "scrolling", { screen });
  return c;
}
const layout = (c) => ctl.computeLayout(c, WS, OUT, { screen });
const rectOf = (c, id) => layout(c).windows.find((w) => w.id === id)?.rect;
const shape = (c) => ctl.columns(c, WS, OUT).map((col) => col.windows.join("+"));

test("each window starts in a column of its own", () => {
  assert.deepEqual(shape(scrolled("a", "b", "c")), ["a", "b", "c"]);
});

test("consume stacks the next window into this column", () => {
  const c = scrolled("a", "b", "c");
  assert.equal(ctl.consumeIntoColumn(c, WS, OUT, "a"), true);
  assert.deepEqual(shape(c), ["a+b", "c"]);
  const a = rectOf(c, "a");
  const b = rectOf(c, "b");
  assert.equal(a.x, b.x);
  assert.equal(a.height + b.height, screen.height);
});

test("expel gives a stacked window its own column back", () => {
  const c = scrolled("a", "b");
  ctl.consumeIntoColumn(c, WS, OUT, "a");
  assert.equal(ctl.expelFromColumn(c, WS, OUT, "b"), true);
  assert.deepEqual(shape(c), ["a", "b"]);
});

test("consume and expel are refused outside scrolling mode", () => {
  const c = scrolled("a", "b");
  ctl.switchMode(c, WS, OUT, "tiling", { screen });
  assert.equal(ctl.consumeIntoColumn(c, WS, OUT, "a"), false);
  assert.equal(ctl.expelFromColumn(c, WS, OUT, "a"), false);
});

test("consume at the end of the strip changes nothing", () => {
  const c = scrolled("a", "b");
  assert.equal(ctl.consumeIntoColumn(c, WS, OUT, "b"), false);
});

test("preset widths cycle and the strip keeps the new width", () => {
  const c = scrolled("a", "b");
  const width = ctl.cycleColumnWidth(c, WS, OUT, "a", 1, { screen });
  assert.ok(PRESET_WIDTHS.map((f) => Math.round(screen.width * f)).includes(width));
  assert.equal(rectOf(c, "a").width, width);
  assert.equal(rectOf(c, "b").x, width, "and b follows it along the strip");
});

test("a preset width survives leaving scrolling and coming back (PRD §17)", () => {
  const c = scrolled("a", "b");
  const width = ctl.cycleColumnWidth(c, WS, OUT, "a", 1, { screen });
  ctl.switchMode(c, WS, OUT, "floating", { screen });
  ctl.switchMode(c, WS, OUT, "scrolling", { screen });
  assert.equal(rectOf(c, "a").width, width);
});

test("centring a column puts it in the middle of the screen", () => {
  const c = scrolled("a", "b", "c");
  ctl.centerColumn(c, WS, OUT, "b", { screen });
  const r = rectOf(c, "b");
  assert.equal(r.x + r.width / 2, screen.width / 2);
});

test("focus-first and focus-last reach the ends of the strip", () => {
  const c = scrolled("a", "b", "c");
  assert.equal(ctl.edgeWindow(c, WS, OUT, "first"), "a");
  assert.equal(ctl.edgeWindow(c, WS, OUT, "last"), "c");
});

test("up and down navigate inside a stacked column", () => {
  const c = scrolled("a", "b", "c");
  ctl.consumeIntoColumn(c, WS, OUT, "a");
  assert.equal(ctl.focusNeighbour(c, WS, OUT, "a", "down", { screen }), "b");
  assert.equal(ctl.focusNeighbour(c, WS, OUT, "b", "up", { screen }), "a");
  assert.equal(ctl.focusNeighbour(c, WS, OUT, "a", "right", { screen }), "c");
});

test("moving up and down reorders inside the column", () => {
  const c = scrolled("a", "b", "c");
  ctl.consumeIntoColumn(c, WS, OUT, "a");
  ctl.moveNeighbour(c, WS, OUT, "b", "up", { screen });
  assert.deepEqual(shape(c), ["b+a", "c"]);
});

test("moving left and right reorders whole columns", () => {
  const c = scrolled("a", "b", "c");
  ctl.moveNeighbour(c, WS, OUT, "a", "right", { screen });
  assert.deepEqual(shape(c), ["b", "a", "c"]);
});

test("closing a stacked window leaves the column intact", () => {
  const c = scrolled("a", "b", "c");
  ctl.consumeIntoColumn(c, WS, OUT, "a");
  ctl.removeWindow(c, WS, OUT, "b");
  assert.deepEqual(shape(c), ["a", "c"]);
});

test("a stacked column survives a serialize round trip", () => {
  const c = scrolled("a", "b", "c");
  ctl.consumeIntoColumn(c, WS, OUT, "a");
  const restored = ctl.deserialize(ctl.serialize(c));
  assert.deepEqual(ctl.columns(restored, WS, OUT), ctl.columns(c, WS, OUT));
  assert.deepEqual(ctl.computeLayout(restored, WS, OUT, { screen }), layout(c));
});
