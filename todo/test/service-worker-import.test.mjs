import test from "node:test";
import assert from "node:assert/strict";

test("service worker module imports without Chrome APIs during syntax checks", async () => {
  globalThis.chrome = {
    runtime: { onMessage: { addListener() {} } },
    alarms: { onAlarm: { addListener() {} } },
    notifications: { onClicked: { addListener() {} } }
  };

  const module = await import(`../src/background/service-worker.ts?test=${Date.now()}`);

  assert.equal(typeof module.handleMessage, "function");
  assert.equal(typeof module.handleAlarm, "function");
});
