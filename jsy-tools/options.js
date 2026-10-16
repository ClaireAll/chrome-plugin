const saveStatus = document.querySelector("#save-status");
const isExtension = Boolean(globalThis.chrome?.storage?.local && globalThis.chrome?.runtime?.id);
const capabilities = [
  { key: "quickUploadExcel", input: document.querySelector("#quick-upload"), state: document.querySelector("#feature-state") },
  { key: "recentActionsEnabled", input: document.querySelector("#recent-actions"), state: document.querySelector("#recent-state") },
];

function render(capability, enabled) {
  capability.input.checked = enabled;
  capability.state.textContent = enabled ? "已开启" : "已关闭";
}

if (isExtension) {
  capabilities.forEach(capability => { capability.input.disabled = true; });
  chrome.storage.local.get({ quickUploadExcel: true, recentActionsEnabled: true }).then(settings => {
    capabilities.forEach(capability => {
      render(capability, settings[capability.key] !== false);
      capability.input.disabled = false;
    });
  }).catch(() => { saveStatus.textContent = "读取设置失败，请重新打开配置页"; });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    capabilities.forEach(capability => {
      if (capability.key in changes) render(capability, changes[capability.key].newValue !== false);
    });
  });
} else {
  saveStatus.textContent = "外观预览 · 设置不写入插件";
}

capabilities.forEach(capability => {
  capability.input.addEventListener("change", async () => {
    const enabled = capability.input.checked;
    render(capability, enabled);
    if (!isExtension) return;
    capability.input.disabled = true;
    try {
      await chrome.storage.local.set({ [capability.key]: enabled });
      saveStatus.textContent = "设置已保存";
    } catch {
      render(capability, !enabled);
      saveStatus.textContent = "保存失败，请重试";
    } finally {
      capability.input.disabled = false;
    }
  });
});
