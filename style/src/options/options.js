import { loadSettings, saveSettings } from "../shared/settings.js";
import { STYLE_SETTINGS_UPDATED } from "../shared/messages.js";

const controls = {
  showPadding: document.getElementById("showPadding"),
  showMargin: document.getElementById("showMargin"),
  showBorder: document.getElementById("showBorder"),
  showGap: document.getElementById("showGap"),
  showSize: document.getElementById("showSize"),
  showFont: document.getElementById("showFont"),
  showColor: document.getElementById("showColor"),
  selectionModeClick: document.getElementById("selectionModeClick"),
  selectionModeBox: document.getElementById("selectionModeBox"),
  selectionDescendants: document.getElementById("selectionDescendants"),
  selectionSelf: document.getElementById("selectionSelf"),
  opacity: document.getElementById("opacity"),
  opacityValue: document.getElementById("opacityValue"),
  labelSize: document.getElementById("labelSize"),
  labelSizeValue: document.getElementById("labelSizeValue"),
  highlightColor: document.getElementById("highlightColor"),
  maxAnnotations: document.getElementById("maxAnnotations"),
  maxAnnotationsValue: document.getElementById("maxAnnotationsValue"),
  paddingColor: document.getElementById("paddingColor"),
  marginColor: document.getElementById("marginColor"),
  borderColor: document.getElementById("borderColor"),
  gapColor: document.getElementById("gapColor")
};

let currentSettings = null;

function render(settings) {
  currentSettings = settings;

  controls.showPadding.checked = settings.showPadding;
  controls.showMargin.checked = settings.showMargin;
  controls.showBorder.checked = settings.showBorder;
  controls.showGap.checked = settings.showGap;
  controls.showSize.checked = settings.showSize;
  controls.showFont.checked = settings.showFont;
  controls.showColor.checked = settings.showColor;
  controls.selectionModeClick.checked = settings.selectionMode === "click";
  controls.selectionModeBox.checked = settings.selectionMode === "box";
  controls.selectionDescendants.checked = settings.selectionScope === "descendants";
  controls.selectionSelf.checked = settings.selectionScope === "self";
  controls.opacity.value = String(settings.opacity);
  controls.opacityValue.textContent = `${Math.round(settings.opacity * 100)}%`;
  controls.labelSize.value = String(settings.labelSize);
  controls.labelSizeValue.textContent = `${settings.labelSize}px`;
  controls.highlightColor.value = settings.highlightColor;
  controls.maxAnnotations.value = String(settings.maxAnnotations);
  controls.maxAnnotationsValue.textContent = String(settings.maxAnnotations);
  controls.paddingColor.value = settings.layerColors.padding;
  controls.marginColor.value = settings.layerColors.margin;
  controls.borderColor.value = settings.layerColors.border;
  controls.gapColor.value = settings.layerColors.gap;

  document.documentElement.style.setProperty("--accent", settings.highlightColor);
}

function broadcastSettings(settings) {
  if (!globalThis.chrome?.tabs?.query) {
    return;
  }

  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (!tab.id) {
        continue;
      }
      chrome.tabs.sendMessage(tab.id, { type: STYLE_SETTINGS_UPDATED, settings }, () => {
        void chrome.runtime?.lastError;
      });
    }
  });
}

async function persist(patch) {
  const next = await saveSettings(patch);
  render(next);
  broadcastSettings(next);
}

function bindCheckbox(control, key) {
  control.addEventListener("change", () => {
    void persist({ [key]: control.checked });
  });
}

bindCheckbox(controls.showPadding, "showPadding");
bindCheckbox(controls.showMargin, "showMargin");
bindCheckbox(controls.showBorder, "showBorder");
bindCheckbox(controls.showGap, "showGap");
bindCheckbox(controls.showSize, "showSize");
bindCheckbox(controls.showFont, "showFont");
bindCheckbox(controls.showColor, "showColor");

controls.selectionModeClick.addEventListener("change", () => {
  if (controls.selectionModeClick.checked) {
    void persist({ selectionMode: "click" });
  }
});

controls.selectionModeBox.addEventListener("change", () => {
  if (controls.selectionModeBox.checked) {
    void persist({ selectionMode: "box" });
  }
});

function bindLayerColor(control, key) {
  control.addEventListener("change", () => {
    void persist({
      layerColors: {
        ...currentSettings.layerColors,
        [key]: control.value
      }
    });
  });
}

controls.selectionDescendants.addEventListener("change", () => {
  if (controls.selectionDescendants.checked) {
    void persist({ selectionScope: "descendants" });
  }
});

controls.selectionSelf.addEventListener("change", () => {
  if (controls.selectionSelf.checked) {
    void persist({ selectionScope: "self" });
  }
});

controls.opacity.addEventListener("input", () => {
  controls.opacityValue.textContent = `${Math.round(Number(controls.opacity.value) * 100)}%`;
});

controls.opacity.addEventListener("change", () => {
  void persist({ opacity: Number(controls.opacity.value) });
});

controls.labelSize.addEventListener("input", () => {
  controls.labelSizeValue.textContent = `${controls.labelSize.value}px`;
});

controls.labelSize.addEventListener("change", () => {
  void persist({ labelSize: Number(controls.labelSize.value) });
});

controls.maxAnnotations.addEventListener("input", () => {
  controls.maxAnnotationsValue.textContent = controls.maxAnnotations.value;
});

controls.maxAnnotations.addEventListener("change", () => {
  void persist({ maxAnnotations: Number(controls.maxAnnotations.value) });
});

controls.highlightColor.addEventListener("change", () => {
  void persist({ highlightColor: controls.highlightColor.value });
});

bindLayerColor(controls.paddingColor, "padding");
bindLayerColor(controls.marginColor, "margin");
bindLayerColor(controls.borderColor, "border");
bindLayerColor(controls.gapColor, "gap");

loadSettings().then(render);
