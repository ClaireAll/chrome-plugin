(function () {
  const { buildTaskUrl } = window.FeishuTaskUrlBuilder;

  const jumpForm = document.getElementById('jumpForm');
  const taskKeyInput = document.getElementById('taskKey');

  jumpForm.addEventListener('submit', (event) => {
    event.preventDefault();
    taskKeyInput.setCustomValidity('');

    try {
      const url = buildTaskUrl(taskKeyInput.value);
      chrome.tabs.create({ url });
    } catch (error) {
      taskKeyInput.setCustomValidity(error.message);
      taskKeyInput.reportValidity();
    }
  });

  taskKeyInput.addEventListener('input', () => {
    taskKeyInput.setCustomValidity('');
  });
})();
