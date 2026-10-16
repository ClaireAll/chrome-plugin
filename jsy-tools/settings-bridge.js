(() => {
  if (globalThis.__jsyToolsSettingsBridge) {
    globalThis.__jsyToolsSettingsBridge();
    return;
  }
  let settings = { quickUploadExcel: true, recentActionsEnabled: true, recentActions: [] };
  let ready = false;
  const publish = () => {
    if (ready) window.postMessage({ channel: "jsy-tools", type: "settings", ...settings }, location.origin);
  };
  globalThis.__jsyToolsSettingsBridge = publish;
  window.addEventListener("message", event => {
    if (event.source === window && event.origin === location.origin && event.data?.channel === "jsy-tools" && event.data.type === "ready") publish();
    if (event.source === window && event.origin === location.origin && event.data?.channel === "jsy-tools" &&
        event.data.type === "recent-action" && ready && settings.recentActionsEnabled) {
      chrome.runtime.sendMessage({ type: "remember-recent-action", action: event.data.action })
        .catch(error => console.error("[jsy-tools] 最近操作同步失败", error));
    }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && Object.keys(settings).some(key => key in changes)) {
      for (const key of Object.keys(settings)) {
        if (key in changes) settings[key] = changes[key].newValue ?? (key === "recentActions" ? [] : true);
      }
      ready = true;
      publish();
    }
  });
  chrome.storage.local.get(settings).then(saved => {
    settings = saved;
    ready = true;
    publish();
  }).catch(error => console.error("[jsy-tools] 无法读取配置", error));
})();
