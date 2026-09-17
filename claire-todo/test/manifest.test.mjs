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

test("manifest declares crisp extension icons for every Chrome surface", () => {
  const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
  const expectedIcons = {
    16: "icons/icon-16.png",
    32: "icons/icon-32.png",
    48: "icons/icon-48.png",
    128: "icons/icon-128.png"
  };

  assert.deepEqual(manifest.icons, expectedIcons);
  assert.deepEqual(manifest.action.default_icon, expectedIcons);

  for (const [size, path] of Object.entries(expectedIcons)) {
    assert.deepEqual(readPngSize(path), { width: Number(size), height: Number(size) });
  }
});

test("options page loads local ECharts instead of a remote script", () => {
  const html = readFileSync("src/options/options.html", "utf8");

  assert.equal(html.includes("vendor/echarts.min.js"), true);
  assert.equal(/https?:\/\//.test(html), false);
});

function readPngSize(path) {
  const png = readFileSync(path);
  assert.equal(png.toString("ascii", 1, 4), "PNG");
  assert.equal(png.toString("ascii", 12, 16), "IHDR");
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20)
  };
}
