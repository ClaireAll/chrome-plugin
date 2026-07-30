export const SETTINGS_STORAGE_KEY = "styleInspectorSettings";

export const DEFAULT_SETTINGS = Object.freeze({
  selectionScope: "descendants",
  selectionMode: "click",
  showPadding: true,
  showMargin: true,
  showBorder: true,
  showGap: true,
  showSize: true,
  showFont: true,
  showColor: false,
  opacity: 0.06,
  labelSize: 11,
  highlightColor: "#22c55e",
  layerColors: Object.freeze({
    padding: "#f59e0b",
    margin: "#38bdf8",
    border: "#ef4444",
    gap: "#a78bfa",
    size: "#22c55e",
    font: "#14b8a6",
    color: "#fb7185"
  }),
  maxAnnotations: 260,
  theme: "dark"
});

const BOX_KEYS = ["showPadding", "showMargin", "showBorder", "showGap", "showSize", "showFont"];

function toBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(Math.max(number, min), max);
}

function normalizeHexColor(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed : fallback;
}

export function sanitizeSettings(input = {}, changedFields = {}) {
  const inputLayerColors = input.layerColors && typeof input.layerColors === "object" ? input.layerColors : {};
  const settings = {
    selectionScope: input.selectionScope === "self" ? "self" : DEFAULT_SETTINGS.selectionScope,
    selectionMode: input.selectionMode === "box" ? "box" : DEFAULT_SETTINGS.selectionMode,
    showPadding: toBoolean(input.showPadding, DEFAULT_SETTINGS.showPadding),
    showMargin: toBoolean(input.showMargin, DEFAULT_SETTINGS.showMargin),
    showBorder: toBoolean(input.showBorder, DEFAULT_SETTINGS.showBorder),
    showGap: toBoolean(input.showGap, DEFAULT_SETTINGS.showGap),
    showSize: toBoolean(input.showSize, DEFAULT_SETTINGS.showSize),
    showFont: toBoolean(input.showFont, DEFAULT_SETTINGS.showFont),
    showColor: toBoolean(input.showColor, DEFAULT_SETTINGS.showColor),
    opacity: clampNumber(input.opacity, DEFAULT_SETTINGS.opacity, 0.04, 0.35),
    labelSize: clampNumber(input.labelSize, DEFAULT_SETTINGS.labelSize, 9, 16),
    highlightColor: normalizeHexColor(input.highlightColor, DEFAULT_SETTINGS.highlightColor),
    layerColors: {
      padding: normalizeHexColor(inputLayerColors.padding, DEFAULT_SETTINGS.layerColors.padding),
      margin: normalizeHexColor(inputLayerColors.margin, DEFAULT_SETTINGS.layerColors.margin),
      border: normalizeHexColor(inputLayerColors.border, DEFAULT_SETTINGS.layerColors.border),
      gap: normalizeHexColor(inputLayerColors.gap, DEFAULT_SETTINGS.layerColors.gap),
      size: normalizeHexColor(inputLayerColors.size, DEFAULT_SETTINGS.layerColors.size),
      font: normalizeHexColor(inputLayerColors.font, DEFAULT_SETTINGS.layerColors.font),
      color: normalizeHexColor(inputLayerColors.color, DEFAULT_SETTINGS.layerColors.color)
    },
    maxAnnotations: Math.round(
      clampNumber(input.maxAnnotations, DEFAULT_SETTINGS.maxAnnotations, 20, 1000)
    ),
    theme: input.theme === "light" ? "light" : DEFAULT_SETTINGS.theme
  };

  const colorChanged = Object.hasOwn(changedFields, "showColor");

  if (colorChanged && settings.showColor) {
    for (const key of BOX_KEYS) {
      settings[key] = false;
    }
  }

  if (colorChanged && !settings.showColor) {
    for (const key of BOX_KEYS) {
      settings[key] = true;
    }
  }

  if (BOX_KEYS.some((key) => changedFields[key] && settings[key])) {
    settings.showColor = false;
  }

  if (settings.showColor) {
    for (const key of BOX_KEYS) {
      settings[key] = false;
    }
  }

  return settings;
}

export async function loadSettings(storageArea = globalThis.chrome?.storage?.local) {
  if (!storageArea?.get) {
    return { ...DEFAULT_SETTINGS };
  }

  const stored = await new Promise((resolve) => {
    storageArea.get([SETTINGS_STORAGE_KEY], (result) => {
      resolve(result?.[SETTINGS_STORAGE_KEY] ?? {});
    });
  });

  return sanitizeSettings({ ...DEFAULT_SETTINGS, ...stored });
}

export async function saveSettings(patch, storageArea = globalThis.chrome?.storage?.local) {
  const current = await loadSettings(storageArea);
  const next = sanitizeSettings({ ...current, ...patch }, patch);

  if (storageArea?.set) {
    await new Promise((resolve) => {
      storageArea.set({ [SETTINGS_STORAGE_KEY]: next }, resolve);
    });
  }

  return next;
}
