(() => {
  if (globalThis.__jsyToolsSettingsBridge) {
    globalThis.__jsyToolsSettingsBridge();
    return;
  }
  // 桥接独立初始化，旧页面或单独注入时不依赖另一份脚本已加载。
  const defaults = { quickUploadExcel: true, recentActionsEnabled: true, tablePreviewEnabled: true, recentActions: [],
    tableStyle: { enabled: true, preset: "zebra", color: "#00afa5", size: "medium" } };
  let settings = { ...defaults };
  let ready = false;
  let stopped = false;
  function available() {
    try { return Boolean(globalThis.chrome?.runtime?.id && chrome.storage?.local); }
    catch { return false; }
  }
  function stop() {
    if (stopped) return;
    stopped = true;
    window.removeEventListener("message", onMessage);
    try { chrome.storage.onChanged.removeListener(onChanged); } catch { /* 旧扩展上下文可能已释放。 */ }
    if (globalThis.__jsyToolsSettingsBridge === publish) delete globalThis.__jsyToolsSettingsBridge;
  }
  const publish = () => {
    if (stopped) return;
    if (!available()) { stop(); return; }
    if (ready) window.postMessage({ channel: "jsy-tools", type: "settings", ...settings }, location.origin);
  };
  globalThis.__jsyToolsSettingsBridge = publish;
  function onMessage(event) {
    if (stopped) return;
    if (!available()) { stop(); return; }
    if (event.source === window && event.origin === location.origin && event.data?.channel === "jsy-tools" && event.data.type === "ready") publish();
    if (event.source === window && event.origin === location.origin && event.data?.channel === "jsy-tools" &&
        event.data.type === "recent-action" && ready && settings.recentActionsEnabled) {
      const failed = error => {
        if (!available() || /Extension context invalidated/i.test(error?.message || "")) { stop(); return; }
        console.error("[jsy-tools] 最近操作同步失败", error);
      };
      try {
        Promise.resolve(chrome.runtime.sendMessage({ type: "remember-recent-action", action: event.data.action })).catch(failed);
      } catch (error) { failed(error); }
    }
  }
  function onChanged(changes, area) {
    if (stopped) return;
    if (!available()) { stop(); return; }
    if (area === "local" && Object.keys(settings).some(key => key in changes)) {
      for (const key of Object.keys(settings)) {
        if (key in changes) settings[key] = changes[key].newValue ?? defaults[key];
      }
      ready = true;
      publish();
    }
  }
  if (!available()) { stop(); return; }
  window.addEventListener("message", onMessage);
  chrome.storage.onChanged.addListener(onChanged);
  chrome.storage.local.get(settings).then(saved => {
    if (stopped || !available()) { stop(); return; }
    settings = saved;
    ready = true;
    publish();
  }).catch(error => {
    if (!available()) { stop(); return; }
    console.error("[jsy-tools] 无法读取配置", error);
  });
})();
