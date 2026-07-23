import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  appendCompletedRecord,
  createEmptyCompletedData
} from "../src/shared/domain.js";

test("runtime never loads remote scripts", () => {
  const html = readFileSync("src/options/options.html", "utf8");
  const manifest = readFileSync("manifest.json", "utf8");

  assert.equal(/<script[^>]+https?:\/\//.test(html), false);
  assert.equal(/https?:\/\//.test(manifest), false);
});

test("completed records contain only text and completedAt", () => {
  const data = appendCompletedRecord(createEmptyCompletedData(), "Task A", "2026-07-23T09:30:00.000Z");

  assert.deepEqual(Object.keys(data.completed[0]).sort(), ["completedAt", "text"]);
});

test("vendored ECharts file is present", () => {
  const source = readFileSync("vendor/echarts.min.js", "utf8");

  assert.equal(source.length > 100000, true);
  assert.equal(source.includes("echarts"), true);
});
