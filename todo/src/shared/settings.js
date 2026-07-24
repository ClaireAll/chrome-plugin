import { DEFAULT_COLOR_PRESETS } from "./domain.js";

export const DEFAULT_SETTINGS = {
  ballPosition: null,
  colorPresets: DEFAULT_COLOR_PRESETS,
  defaultColor: "#ffffff"
};

export function sanitizeSettings(input) {
  const source = input && typeof input === "object" ? input : {};
  const colorPresets = sanitizeColorPresets(source.colorPresets);
  const defaultColor = colorPresets.includes(source.defaultColor) ? source.defaultColor : colorPresets[0];
  return {
    ballPosition: sanitizeBallPosition(source.ballPosition),
    colorPresets,
    defaultColor
  };
}

export function sanitizeColorPresets(value) {
  const colors = Array.isArray(value) ? value.filter(isHexColor) : DEFAULT_COLOR_PRESETS;
  return colors.length ? [...new Set(colors)] : DEFAULT_COLOR_PRESETS;
}

function sanitizeBallPosition(value) {
  if (!value || typeof value !== "object") return null;
  const side = value.side === "left" || value.side === "right" ? value.side : null;
  const leftRatio = Number(value.leftRatio);
  const topRatio = Number(value.topRatio);
  if (Number.isFinite(leftRatio) || Number.isFinite(topRatio)) {
    return {
      leftRatio: clampRatio(leftRatio),
      topRatio: clampRatio(topRatio),
      snapped: value.snapped === true,
      side
    };
  }
  const left = Number(value.left);
  const top = Number(value.top);
  return {
    left: Number.isFinite(left) ? Math.max(0, left) : 0,
    top: Number.isFinite(top) ? Math.max(0, top) : 0,
    snapped: value.snapped === true,
    side
  };
}

function clampRatio(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

function isHexColor(value) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}
