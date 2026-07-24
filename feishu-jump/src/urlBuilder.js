const TASK_DETAIL_URL_TEMPLATE = 'https://project.feishu.cn/b2rl2h/issue/detail/{key}';

function validateKey(key) {
  if (String(key || '').trim().length === 0) {
    return { valid: false, message: '请输入任务 key' };
  }

  return { valid: true, message: '' };
}

function normalizeTaskKey(key) {
  const trimmedKey = String(key).trim();
  const prefixedNumericKey = trimmedKey.match(/^[a-zA-Z]-(\d+)$/);

  return prefixedNumericKey ? prefixedNumericKey[1] : trimmedKey;
}

function buildTaskUrl(key) {
  const keyResult = validateKey(key);
  if (!keyResult.valid) {
    throw new Error(keyResult.message);
  }

  return TASK_DETAIL_URL_TEMPLATE.replace('{key}', encodeURIComponent(normalizeTaskKey(key)));
}

if (typeof module !== 'undefined') {
  module.exports = {
    TASK_DETAIL_URL_TEMPLATE,
    buildTaskUrl,
    normalizeTaskKey,
    validateKey,
  };
}

if (typeof window !== 'undefined') {
  window.FeishuTaskUrlBuilder = {
    TASK_DETAIL_URL_TEMPLATE,
    buildTaskUrl,
    normalizeTaskKey,
    validateKey,
  };
}
