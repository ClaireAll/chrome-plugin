import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  appendCompletedRecord,
  createEmptyCompletedData
} from "../src/shared/domain.ts";

test("runtime never loads remote scripts", () => {
  const manifest = readFileSync("manifest.json", "utf8");

  assert.equal(/https?:\/\//.test(manifest), false);
  const parsedManifest = JSON.parse(manifest);
  assert.equal(parsedManifest.action.default_popup, "dist/popup.html");
  assert.equal(parsedManifest.content_scripts, undefined);
  assert.equal(parsedManifest.options_page, undefined);
});

test("completed records contain only text and completedAt", () => {
  const data = appendCompletedRecord(createEmptyCompletedData(), "Task A", "2026-07-23T09:30:00.000Z");

  assert.deepEqual(Object.keys(data.completed[0]).sort(), ["completedAt", "text"]);
});
