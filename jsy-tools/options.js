const saveStatus = document.querySelector("#save-status");
const isExtension = Boolean(globalThis.chrome?.storage?.local && globalThis.chrome?.runtime?.id);
const capabilities = [
  { key: "quickUploadExcel", input: document.querySelector("#quick-upload"), state: document.querySelector("#feature-state") },
  { key: "recentActionsEnabled", input: document.querySelector("#recent-actions"), state: document.querySelector("#recent-state") },
  { key: "tablePreviewEnabled", input: document.querySelector("#table-preview"), state: document.querySelector("#preview-state") },
  { key: "corpSearchEnabled", input: document.querySelector("#corp-search-enabled"), state: document.querySelector("#corp-search-state") },
];

function render(capability, enabled) {
  capability.input.checked = enabled;
  capability.state.textContent = enabled ? "已开启" : "已关闭";
}

if (isExtension) {
  capabilities.forEach(capability => { capability.input.disabled = true; });
  chrome.storage.local.get({ quickUploadExcel: true, recentActionsEnabled: true, tablePreviewEnabled: true, corpSearchEnabled: true }).then(settings => {
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

(() => {
  const { defaults, normalize, palette } = JsyTableStyle;
  const toggle = document.querySelector("#table-style-enabled");
  const controls = document.querySelector("#style-controls");
  const sample = document.querySelector("#style-sample");
  const picker = document.querySelector("#theme-color");
  const hex = document.querySelector("#theme-hex");
  const error = document.querySelector("#color-error");
  const swatches = document.querySelectorAll("[data-theme-color]");
  let config = normalize(defaults);
  let saved = config;
  let ready = !isExtension;
  let write = Promise.resolve();
  let revision = 0;
  let pendingWrites = 0;

  function renderStyle() {
    toggle.checked = config.enabled;
    toggle.disabled = !ready;
    controls.disabled = !ready || !config.enabled;
    document.querySelector("#style-state").textContent = config.enabled ? "已开启" : "已关闭";
    document.querySelector(`input[name="table-preset"][value="${config.preset}"]`).checked = true;
    document.querySelector(`input[name="table-size"][value="${config.size}"]`).checked = true;
    picker.value = config.color;
    hex.value = config.color.toUpperCase();
    hex.removeAttribute("aria-invalid");
    error.textContent = "";
    swatches.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.themeColor === config.color)));
    const colors = palette(config);
    sample.dataset.preset = config.enabled ? config.preset : "simple";
    for (const key of ["header", "stripe", "border"]) sample.style.setProperty(`--sample-${key}`, config.enabled ? colors[key] : { header: "#f0f2f6", stripe: "#f7f8fa", border: "#e1e6ed" }[key]);
    sample.style.setProperty("--sample-font", `${config.enabled ? colors.font : 14}px`);
  }

  function change(patch, persist = true) {
    if (!ready) return;
    config = normalize({ ...config, ...patch });
    renderStyle();
    if (!persist || !isExtension) return;
    const snapshot = { ...config };
    const current = ++revision;
    pendingWrites++;
    write = write.then(async () => {
      try {
        await chrome.storage.local.set({ tableStyle: snapshot });
        saved = snapshot;
        saveStatus.textContent = "设置已保存";
      } catch {
        if (current === revision) { config = saved; renderStyle(); }
        saveStatus.textContent = "保存失败，请重试";
      } finally { pendingWrites--; }
    });
  }

  toggle.addEventListener("change", () => change({ enabled: toggle.checked }));
  for (const [name, key] of [["table-preset", "preset"], ["table-size", "size"]]) {
    document.querySelectorAll(`input[name="${name}"]`).forEach(input => input.addEventListener("change", () => change({ [key]: input.value })));
  }
  picker.addEventListener("input", () => change({ color: picker.value }, false));
  picker.addEventListener("change", () => change({ color: picker.value }));
  hex.addEventListener("change", () => {
    const value = hex.value.trim();
    if (!/^#[\da-f]{6}$/i.test(value)) {
      hex.setAttribute("aria-invalid", "true");
      error.textContent = "请输入 # 加六位十六进制颜色";
      return;
    }
    change({ color: value });
  });
  swatches.forEach(button => button.addEventListener("click", () => change({ color: button.dataset.themeColor })));
  renderStyle();
  if (isExtension) {
    chrome.storage.local.get({ tableStyle: defaults }).then(settings => {
      config = saved = normalize(settings.tableStyle);
      ready = true;
      renderStyle();
    }).catch(() => { saveStatus.textContent = "读取表格样式失败，请重新打开配置页"; });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes.tableStyle) return;
      saved = normalize(changes.tableStyle.newValue);
      // 连续修改时，较早写入的通知不能覆盖用户较新的选择。
      if (!pendingWrites) { config = saved; renderStyle(); }
    });
  }
})();
