import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("options page exposes completed records, storage, color, and weekly controls", () => {
  const html = readFileSync("src/options/options.html", "utf8");

  for (const id of [
    "completedSearch",
    "completedList",
    "pickCompletedFile",
    "createCompletedFile",
    "requestCompletedPermission",
    "colorPresetList",
    "addColorPreset",
    "weeklyChart"
  ]) {
    assert.equal(html.includes(`id="${id}"`), true);
  }

  assert.equal(html.includes("vendor/echarts.min.js"), true);
});
