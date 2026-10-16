importScripts('urlBuilder.js');

const taskUrlBuilder = self.FeishuTaskUrlBuilder;

function escapeDescription(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function createJumpSuggestion(text) {
  const trimmedText = String(text || '').trim();
  const keyResult = taskUrlBuilder.validateKey(trimmedText);

  if (!keyResult.valid) {
    return [];
  }

  const numericKey = /^#?(\d+)$/.exec(trimmedText);
  if (numericKey) {
    const id = numericKey[1];
    return [['f', '缺陷'], ['g', '指派'], ['s', 's 类型任务']].map(([prefix, label]) => ({
      content: `${prefix}-${id}`,
      description: `打开${label} <match>${prefix}-${id}</match>`,
    }));
  }

  return [
    {
      content: trimmedText,
      description: `跳转到任务 <match>${escapeDescription(trimmedText)}</match>`,
    },
  ];
}

function openTaskUrl(url, disposition) {
  if (disposition === 'newBackgroundTab') {
    chrome.tabs.create({ url, active: false });
    return;
  }

  if (disposition === 'newForegroundTab') {
    chrome.tabs.create({ url });
    return;
  }

  chrome.tabs.update({ url });
}

chrome.omnibox.setDefaultSuggestion({
  description: '输入任务编号，回车跳转到任务详情',
});

chrome.omnibox.onInputChanged.addListener((text, suggest) => {
  chrome.omnibox.setDefaultSuggestion({
    description: /^#?\d+$/.test(String(text).trim())
      ? '回车打开需求；选择下方建议打开其他类型'
      : '输入任务编号，回车跳转到任务详情',
  });
  suggest(createJumpSuggestion(text));
});

chrome.omnibox.onInputEntered.addListener((text, disposition) => {
  try {
    openTaskUrl(taskUrlBuilder.buildTaskUrl(text), disposition);
  } catch (error) {
    chrome.omnibox.setDefaultSuggestion({
      description: escapeDescription(error.message),
    });
  }
});
