import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("manifest injects the todo content script into ordinary pages", () => {
  const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));

  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions.sort(), ["alarms", "notifications", "storage"].sort());
  assert.deepEqual(manifest.host_permissions, ["<all_urls>"]);
  assert.deepEqual(manifest.content_scripts[0].matches, ["<all_urls>"]);
  assert.deepEqual(manifest.content_scripts[0].js, ["src/content/content.js"]);
  assert.deepEqual(manifest.content_scripts[0].css, ["src/content/content.css"]);
  assert.equal(manifest.background.service_worker, "src/background/service-worker.js");
  assert.equal(manifest.background.type, "module");
  assert.equal(manifest.options_page, "src/options/options.html");
});

test("options page loads local ECharts instead of a remote script", () => {
  const html = readFileSync("src/options/options.html", "utf8");

  assert.equal(html.includes("vendor/echarts.min.js"), true);
  assert.equal(/https?:\/\//.test(html), false);
});
