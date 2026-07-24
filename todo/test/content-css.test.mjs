import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("content CSS scopes styles and fixes panel dimensions", () => {
  const css = readFileSync("src/content/content.css", "utf8");

  assert.match(css, /#todo-extension-root/);
  assert.match(css, /\.todo-panel[\s\S]*width:\s*420px/);
  assert.match(css, /\.todo-panel[\s\S]*height:\s*560px/);
  assert.match(css, /\.todo-panel[\s\S]*width:\s*min\(420px,\s*calc\(100vw\s*-\s*24px\)\)/);
  assert.match(css, /\.todo-panel[\s\S]*height:\s*min\(560px,\s*calc\(100vh\s*-\s*24px\)\)/);
  assert.match(css, /\.todo-panel[\s\S]*position:\s*fixed/);
  assert.doesNotMatch(css, /\.todo-panel[\s\S]*bottom:\s*60px/);
  assert.match(css, /\.todo-ball[\s\S]*width:\s*48px/);
  assert.match(css, /\.todo-ball[\s\S]*border:\s*3px solid #2563eb/i);
  assert.match(css, /\.todo-ball-tick--teal/);
  assert.match(css, /\.todo-ball-tick--coral/);
  assert.match(css, /\.todo-panel-header/);
  assert.match(css, /\.todo-create-input:focus/);
  assert.doesNotMatch(css, /gradient/i);
  assert.equal(css.includes("body {"), false);
});
