import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("content CSS scopes styles and fixes panel dimensions", () => {
  const css = readFileSync("src/content/content.css", "utf8");

  assert.match(css, /#todo-extension-root/);
  assert.match(css, /\.todo-panel[\s\S]*width:\s*420px/);
  assert.match(css, /\.todo-panel[\s\S]*height:\s*560px/);
  assert.match(css, /\.todo-panel[\s\S]*position:\s*fixed/);
  assert.doesNotMatch(css, /\.todo-panel[\s\S]*bottom:\s*60px/);
  assert.equal(css.includes("body {"), false);
});
