export const PORT_NAME = "api-rewriter-side-panel";

export const DATA_FILE_VERSION = 7;
export const DEFAULT_DATA_FILE_NAME = "api-rewriter.json";
export const MAX_BODY_BYTES = 5 * 1024 * 1024;
export const MAX_LIVE_REQUESTS = 100;

export const PANEL_MESSAGE_TYPES = Object.freeze({
  ATTACH_TAB: "panel:attach-tab",
  SYNC_DATA: "panel:sync-data",
  APPLY_QUICK_CONFIG: "panel:apply-quick-config",
  SET_RECORDING: "panel:set-recording",
  SET_MANUAL_INTERCEPT: "panel:set-manual-intercept",
  RESOLVE_PENDING: "panel:resolve-pending",
  GET_APPLIED_CHANGE: "panel:get-applied-change",
  CLEAR_REQUESTS: "panel:clear-requests",
  RESET_SESSION: "panel:reset-session"
});

export const WORKER_MESSAGE_TYPES = Object.freeze({
  STATE: "worker:state",
  APPLIED_CHANGE: "worker:applied-change"
});

export const INTERCEPT_STAGES = Object.freeze({
  REQUEST: "request",
  RESPONSE: "response"
});
