import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
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

test("项目权限改写不依赖用户信息接口先返回", async () => {
  const runtimeConnect = createEvent();
  const debuggerEvent = createEvent();
  const tabsUpdated = createEvent();
  const fulfilled = [];
  globalThis.chrome = {
    runtime: {
      onInstalled: createEvent(),
      onStartup: createEvent(),
      onConnect: runtimeConnect
    },
    debugger: {
      onEvent: debuggerEvent,
      onDetach: createEvent(),
      attach: async () => {},
      sendCommand: async (_source, method, params) => {
        if (method === "Runtime.evaluate") return { result: { value: "user-1" } };
        if (method === "Fetch.getResponseBody") {
          return {
            body: JSON.stringify({
              data: {
                cooperators: [{ member: "user-1", authType: "manager" }]
              }
            }),
            base64Encoded: false
          };
        }
        if (method === "Fetch.fulfillRequest") fulfilled.push(params);
        return {};
      },
      detach: async () => {}
    },
    tabs: {
      onRemoved: createEvent(),
      onUpdated: tabsUpdated,
      get: async (tabId) => ({ tabId, id: tabId, windowId: 42, url: "https://test.jiushuyun.com/decision/home" })
    },
    sidePanel: {
      onClosed: createEvent(),
      onOpened: createEvent(),
      setPanelBehavior: async () => {}
    },
    i18n: {
      getUILanguage: () => "zh-CN"
    }
  };

  try {
    await import(`./service-worker.js?project-auth=${Date.now()}`);
    const port = {
      name: PORT_NAME,
      onMessage: createEvent(),
      onDisconnect: createEvent(),
      postMessage() {}
    };
    runtimeConnect.emit(port);
    port.onMessage.emit({ type: PANEL_MESSAGE_TYPES.ATTACH_TAB, tabId: 8 });
    port.onMessage.emit({
      type: PANEL_MESSAGE_TYPES.SYNC_DATA,
      data: { quickConfig: { enabled: true, projectAuth: "view" } }
    });
    port.onMessage.emit({ type: PANEL_MESSAGE_TYPES.SET_RECORDING, enabled: true });
    await settle();
    await settle();

    tabsUpdated.emit(8, { url: "https://dev.jiushuyun.com/decision/home" });

    debuggerEvent.emit(
      { tabId: 8 },
      "Fetch.requestPaused",
      {
        requestId: "project-response",
        networkId: "project-network",
        request: {
          method: "GET",
          url: "https://dev.jiushuyun.com/decision/v2/platform/assets/projects/project-1/files?edit=true"
        },
        responseStatusCode: 200,
        responseHeaders: [{ name: "content-type", value: "application/json" }]
      }
    );
    await settle();
    await settle();

    assert.equal(fulfilled.length, 1);
    const body = JSON.parse(Buffer.from(fulfilled[0].body, "base64").toString("utf8"));
    assert.deepEqual(body.data.cooperators, [{ member: "user-1", authType: "view" }]);
  } finally {
    delete globalThis.chrome;
  }
});

test("企业类型覆盖会在业务模块初始化前同步到页面运行时", async () => {
  const runtimeConnect = createEvent();
  const addedScripts = [];
  globalThis.chrome = {
    runtime: {
      onInstalled: createEvent(),
      onStartup: createEvent(),
      onConnect: runtimeConnect
    },
    debugger: {
      onEvent: createEvent(),
      onDetach: createEvent(),
      attach: async () => {},
      sendCommand: async (_source, method, params) => {
        if (method === "Runtime.evaluate") return { result: { value: "user-1" } };
        if (method === "Page.addScriptToEvaluateOnNewDocument") {
          addedScripts.push(params.source);
          return { identifier: "runtime-override" };
        }
        return {};
      },
      detach: async () => {}
    },
    tabs: {
      onRemoved: createEvent(),
      onUpdated: createEvent(),
      get: async (tabId) => ({ tabId, id: tabId, windowId: 42, url: "https://test.jiushuyun.com/decision/home" })
    },
    sidePanel: {
      onClosed: createEvent(),
      onOpened: createEvent(),
      setPanelBehavior: async () => {}
    },
    i18n: {
      getUILanguage: () => "zh-CN"
    }
  };

  try {
    await import(`./service-worker.js?corp-runtime=${Date.now()}`);
    const port = {
      name: PORT_NAME,
      onMessage: createEvent(),
      onDisconnect: createEvent(),
      postMessage() {}
    };
    runtimeConnect.emit(port);
    port.onMessage.emit({ type: PANEL_MESSAGE_TYPES.ATTACH_TAB, tabId: 9 });
    port.onMessage.emit({
      type: PANEL_MESSAGE_TYPES.SYNC_DATA,
      data: { quickConfig: { corpPreset: "wecom" } }
    });
    port.onMessage.emit({ type: PANEL_MESSAGE_TYPES.SET_RECORDING, enabled: true });
    await settle();
    await settle();

    assert.equal(addedScripts.length, 1);
    const page = vm.createContext({});
    vm.runInContext(addedScripts[0], page);
    vm.runInContext("BI = { system: { third: true, corpType: 24, subCorpType: 'Default', subIntegrated: false } }", page);
    const system = JSON.parse(vm.runInContext("JSON.stringify(BI.system)", page));
    assert.deepEqual(system, {
      third: true,
      corpType: 22,
      subCorpType: "Default",
      subIntegrated: false,
      config: { odmType: "none" }
    });
  } finally {
    delete globalThis.chrome;
  }
});
