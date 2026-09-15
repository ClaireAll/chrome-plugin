import test from "node:test";
import assert from "node:assert/strict";
import { PANEL_MESSAGE_TYPES, PORT_NAME } from "../shared/constants.js";

// 创建可由测试主动触发的 Chrome 事件。
function createEvent() {
  const listeners = [];
  return {
    addListener(listener) {
      listeners.push(listener);
    },
    emit(...args) {
      for (const listener of listeners) listener(...args);
    }
  };
}

// 等待后台消息队列和异步清理完成。
function settle() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("Side Panel 关闭后解除调试，重新打开时恢复原记录状态", async () => {
  const runtimeConnect = createEvent();
  const panelClosed = createEvent();
  const panelOpened = createEvent();
  const attached = [];
  const detached = [];
  globalThis.chrome = {
    runtime: {
      onInstalled: createEvent(),
      onStartup: createEvent(),
      onConnect: runtimeConnect
    },
    debugger: {
      onEvent: createEvent(),
      onDetach: createEvent(),
      attach: async (source) => attached.push(source),
      sendCommand: async () => ({}),
      detach: async (source) => detached.push(source)
    },
    tabs: {
      onRemoved: createEvent(),
      onUpdated: createEvent(),
      get: async (tabId) => ({ tabId, id: tabId, windowId: 42, url: "https://test.jiushuyun.com/decision/home" })
    },
    sidePanel: {
      onClosed: panelClosed,
      onOpened: panelOpened,
      setPanelBehavior: async () => {}
    },
    i18n: {
      getUILanguage: () => "zh-CN"
    }
  };

  await import(`./service-worker.js?panel-close=${Date.now()}`);
  const port = {
    name: PORT_NAME,
    onMessage: createEvent(),
    onDisconnect: createEvent(),
    postMessage() {}
  };
  runtimeConnect.emit(port);
  port.onMessage.emit({ type: PANEL_MESSAGE_TYPES.ATTACH_TAB, tabId: 7 });
  port.onMessage.emit({ type: PANEL_MESSAGE_TYPES.SET_RECORDING, enabled: true });
  await settle();
  await settle();

  panelClosed.emit({ windowId: 42, path: "src/sidepanel/sidepanel.html" });
  await settle();
  await settle();

  assert.deepEqual(detached, [{ tabId: 7 }]);
  panelOpened.emit({ windowId: 42, path: "src/sidepanel/sidepanel.html" });
  await settle();
  await settle();

  assert.deepEqual(attached, [{ tabId: 7 }, { tabId: 7 }]);
  delete globalThis.chrome;
});
