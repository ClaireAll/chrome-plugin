import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("content CSS scopes styles and fixes panel dimensions", () => {
  const css = readFileSync("src/content/content.css", "utf8");

  assert.match(css, /#todo-extension-root/);
  assert.match(css, /\.todo-panel[\s\S]*width:\s*320px/);
  assert.match(css, /\.todo-panel[\s\S]*height:\s*560px/);
  assert.match(css, /\.todo-panel[\s\S]*width:\s*min\(320px,\s*calc\(100vw\s*-\s*24px\)\)/);
  assert.match(css, /\.todo-panel[\s\S]*height:\s*min\(560px,\s*calc\(100vh\s*-\s*24px\)\)/);
  assert.match(css, /\.todo-panel[\s\S]*position:\s*fixed/);
  assert.doesNotMatch(css, /\.todo-panel[\s\S]*bottom:\s*60px/);
  assert.match(css, /\.todo-ball[\s\S]*width:\s*48px/);
  assert.match(css, /\.todo-ball[\s\S]*border:\s*3px solid #2563eb/i);
  assert.match(css, /\.todo-ball-tick--teal/);
  assert.match(css, /\.todo-ball-tick--coral/);
  assert.match(css, /\.todo-panel-header[\s\S]*height:\s*52px/);
  assert.match(css, /\.todo-create-form[\s\S]*height:\s*52px/);
  assert.match(css, /\.todo-item[\s\S]*border-left:\s*3px solid/);
  assert.match(css, /\.todo-item-actions button[\s\S]*border:\s*0/);
  assert.match(css, /\.todo-header-settings:focus-visible[\s\S]*outline:\s*3px solid #0f172a/i);
  assert.match(css, /\.todo-icon[\s\S]*width:\s*16px/);
  assert.match(css, /\.todo-create-input:focus/);
  assert.match(css, /\.todo-ball:focus-visible\s*\{[\s\S]*outline:\s*3px solid #0f172a[\s\S]*outline-offset:\s*4px/i);
  assert.match(css, /\.todo-ball:focus-visible\s*\{[\s\S]*box-shadow:\s*0 0 0 2px #fff,\s*0 0 0 5px #0f172a/i);
  assert.match(css, /\.todo-create-form\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/);
  assert.match(css, /\.todo-create-submit:focus-visible\s*\{[\s\S]*outline:\s*3px solid #0f172a/i);
  assert.doesNotMatch(css, /gradient/i);
  assert.equal(css.includes("body {"), false);
});
