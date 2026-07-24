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

  const normalizedKey = taskUrlBuilder.normalizeTaskKey(trimmedText);

  return [
    {
      content: trimmedText,
      description: `跳转到飞书任务 <match>${escapeDescription(normalizedKey)}</match>`,
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
  description: '输入飞书任务编号，回车跳转到任务详情',
});

chrome.omnibox.onInputChanged.addListener((text, suggest) => {
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
