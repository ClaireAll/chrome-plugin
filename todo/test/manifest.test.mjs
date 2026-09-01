import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("manifest uses the native action popup without legacy injected pages", () => {
  const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));

  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions.sort(), ["alarms", "notifications", "storage"].sort());
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.content_scripts, undefined);
  assert.equal(manifest.background.service_worker, "dist/background/service-worker.js");
  assert.equal(manifest.background.type, "module");
  assert.equal(manifest.options_page, undefined);
  assert.equal(manifest.action.default_popup, "dist/popup.html");
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

function readPngSize(path) {
  const png = readFileSync(path);
  assert.equal(png.toString("ascii", 1, 4), "PNG");
  assert.equal(png.toString("ascii", 12, 16), "IHDR");
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20)
  };
}
