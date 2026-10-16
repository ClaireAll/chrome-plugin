const TASK_DETAIL_URL_TEMPLATE = 'https://project.feishu.cn/b2rl2h/{type}/detail/{key}';
const TASK_KEY_PATTERN = /^(?:(f|m|g|s|JSY|REPORT|KERNEL)-)?(\d+)$/i;
const FEISHU_TASK_TYPES = { f: 'issue', m: 'story', g: 'assignment', s: 's' };

function validateKey(key) {
  const taskKey = String(key || '').trim().replace(/^#/, '');
  if (!taskKey) {
    return { valid: false, message: '请输入任务 key' };
  }

  return TASK_KEY_PATTERN.test(taskKey)
    ? { valid: true, message: '' }
    : { valid: false, message: '请输入有效的任务编号' };
}

function normalizeTaskKey(key) {
  const trimmedKey = String(key).trim().replace(/^#/, '');
  const prefixedNumericKey = trimmedKey.match(/^[a-zA-Z]+-(\d+)$/);

  return prefixedNumericKey ? prefixedNumericKey[1] : trimmedKey;
}

function buildTaskUrl(key) {
  const keyResult = validateKey(key);
  if (!keyResult.valid) {
    throw new Error(keyResult.message);
  }

  const taskKey = String(key).trim().replace(/^#/, '');
  const [, rawPrefix = 'm', id] = taskKey.match(TASK_KEY_PATTERN);
  const prefix = rawPrefix.toLowerCase();
  const taskType = FEISHU_TASK_TYPES[prefix];

  if (!taskType) {
    return `https://work.fineres.com/browse/${rawPrefix.toUpperCase()}-${id}`;
  }

  return TASK_DETAIL_URL_TEMPLATE
    .replace('{type}', taskType)
    .replace('{key}', encodeURIComponent(id));
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

if (typeof self !== 'undefined') {
  self.FeishuTaskUrlBuilder = {
    TASK_DETAIL_URL_TEMPLATE,
    buildTaskUrl,
    normalizeTaskKey,
    validateKey,
  };
}
