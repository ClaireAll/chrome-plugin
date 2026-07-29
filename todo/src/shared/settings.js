import { DEFAULT_COLOR_PRESETS } from "./domain.js";

const DEFAULT_BALL_THEME_COLOR = "#2563eb";

export const DEFAULT_SETTINGS = {
  ballPosition: null,
  ballThemeColor: DEFAULT_BALL_THEME_COLOR,
  colorPresets: DEFAULT_COLOR_PRESETS,
  defaultColor: "#ffffff"
};

export function sanitizeSettings(input) {
  const source = input && typeof input === "object" ? input : {};
  const colorPresets = sanitizeColorPresets(source.colorPresets);
  const requestedDefaultColor = normalizeHexColor(source.defaultColor);
  const defaultColor = colorPresets.includes(requestedDefaultColor) ? requestedDefaultColor : colorPresets[0];
  return {
    ballPosition: sanitizeBallPosition(source.ballPosition),
    ballThemeColor: normalizeHexColor(source.ballThemeColor) || DEFAULT_BALL_THEME_COLOR,
    colorPresets,
    defaultColor
  };
}

export function sanitizeColorPresets(value) {
  const colors = Array.isArray(value) ? value.map(normalizeHexColor).filter(Boolean) : DEFAULT_COLOR_PRESETS;
  return colors.length ? [...new Set(colors)] : DEFAULT_COLOR_PRESETS;
}

function sanitizeBallPosition(value) {
  if (!value || typeof value !== "object") return null;
  const side = value.side === "left" || value.side === "right" ? value.side : null;
  const leftRatio = Number(value.leftRatio);
  const topRatio = Number(value.topRatio);
  if (Number.isFinite(leftRatio) || Number.isFinite(topRatio)) {
    const edgeSide = side || ratioToSide(leftRatio);
    return {
      leftRatio: edgeSide === "right" ? 1 : 0,
      topRatio: clampRatio(topRatio),
      snapped: true,
      side: edgeSide
    };
  }
  const left = Number(value.left);
  const top = Number(value.top);
  return {
    left: Number.isFinite(left) ? Math.max(0, left) : 0,
    top: Number.isFinite(top) ? Math.max(0, top) : 0,
    snapped: true,
    side
  };
}

function ratioToSide(value) {
  return clampRatio(value) < 0.5 ? "left" : "right";
}

function clampRatio(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

function normalizeHexColor(value) {
  return isHexColor(value) ? value.toLowerCase() : "";
}

function isHexColor(value) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}
