export const DEFAULT_SETTINGS = {
  themeMode: "system",
  accentColor: "#3b82f6",
  ballSize: 44,
  ballOpacity: 0.72,
  edgeOffset: 12,
  edgeHide: false,
  showRecentGroupName: false,
  recentGroupName: "",
  ballPosition: null
};

const SETTINGS_KEY = "groupSettings";

export async function loadSettings() {
  const stored = await chromeStorageGet(SETTINGS_KEY);
  return sanitizeSettings(stored?.[SETTINGS_KEY]);
}

export async function saveSettings(patch) {
  const current = await loadSettings();
  const next = sanitizeSettings({ ...current, ...patch });
  await chromeStorageSet({ [SETTINGS_KEY]: next });
  return next;
}

function sanitizeSettings(input) {
  const source = input && typeof input === "object" ? input : {};
  return {
    themeMode: ["light", "dark", "system"].includes(source.themeMode)
      ? source.themeMode
      : DEFAULT_SETTINGS.themeMode,
    accentColor: isHexColor(source.accentColor) ? source.accentColor : DEFAULT_SETTINGS.accentColor,
    ballSize: clampNumber(source.ballSize, 32, 72, DEFAULT_SETTINGS.ballSize),
    ballOpacity: clampNumber(source.ballOpacity, 0.25, 1, DEFAULT_SETTINGS.ballOpacity),
    edgeOffset: clampNumber(source.edgeOffset, -36, 36, DEFAULT_SETTINGS.edgeOffset),
    edgeHide: typeof source.edgeHide === "boolean" ? source.edgeHide : DEFAULT_SETTINGS.edgeHide,
    showRecentGroupName:
      typeof source.showRecentGroupName === "boolean"
        ? source.showRecentGroupName
        : DEFAULT_SETTINGS.showRecentGroupName,
    recentGroupName: String(source.recentGroupName || DEFAULT_SETTINGS.recentGroupName),
    ballPosition: sanitizeBallPosition(source.ballPosition)
  };
}

function sanitizeBallPosition(value) {
  if (!value || typeof value !== "object") return DEFAULT_SETTINGS.ballPosition;
  const side = value.side === "left" || value.side === "right" ? value.side : null;
  const top = Number(value.top);
  if (!side || !Number.isFinite(top)) return DEFAULT_SETTINGS.ballPosition;
  return {
    side,
    top: Math.min(10000, Math.max(0, top))
  };
}

function isHexColor(value) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function chromeStorageGet(key) {
  return new Promise((resolve) => {
    if (!globalThis.chrome?.storage?.local) {
      resolve({});
      return;
    }
    chrome.storage.local.get(key, resolve);
  });
}

function chromeStorageSet(value) {
  return new Promise((resolve) => {
    if (!globalThis.chrome?.storage?.local) {
      resolve();
      return;
    }
    chrome.storage.local.set(value, resolve);
  });
}
