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

test("options page invokes completed-file picker APIs directly from click handlers", () => {
  const source = readFileSync("src/options/options.js", "utf8");
  const workerSource = readFileSync("src/background/service-worker.js", "utf8");

  assert.match(source, /from "\.\.\/shared\/completed-file-store\.js"/);
  assert.match(source, /pickCompletedJsonFile\(\)/);
  assert.match(source, /createCompletedJsonFile\(\)/);
  assert.match(source, /requestCompletedFilePermission\(\)/);
  assert.doesNotMatch(source, /sendMessage\(MESSAGE_TYPES\.(PICK_COMPLETED_FILE|CREATE_COMPLETED_FILE|REQUEST_COMPLETED_FILE_PERMISSION)/);
  assert.doesNotMatch(workerSource, /pickCompletedJsonFile|createCompletedJsonFile|requestCompletedFilePermission/);
});

test("options page reports picker and creation failures in the completed-file status", () => {
  const source = readFileSync("src/options/options.js", "utf8");

  assert.match(source, /function showCompletedFileResult\(result\)[\s\S]*completedFileStatus\.textContent\s*=\s*result\.message\s*\|\|\s*"Completed JSON file operation failed"/);
  assert.match(source, /elements\.pickCompletedFile\.addEventListener\("click", async \(\) => \{[\s\S]*showCompletedFileResult\(result\)/);
  assert.match(source, /elements\.createCompletedFile\.addEventListener\("click", async \(\) => \{[\s\S]*showCompletedFileResult\(result\)/);
});
