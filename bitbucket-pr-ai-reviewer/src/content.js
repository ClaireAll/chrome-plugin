(function initBitbucketAiReviewer() {
  if (window.__bitbucketAiReviewerLoaded) return;
  window.__bitbucketAiReviewerLoaded = true;

  const BALL_SIZE = 56;
  const PANEL_GAP = 24;
  const PANEL_MARGIN = 16;
  const POSITION_KEY = "bbai-floating-ball-position";
  const CLOSE_ANIMATION_MS = 360;
  const DEFAULT_STATUS = "准备评审当前合并请求。";
  const DockedPosition = window.BitbucketPrAiReviewerPosition;
  const ImageAttachments = window.BitbucketPrAiReviewerImages;

  const state = {
    open: false,
    status: DEFAULT_STATUS,
    loading: false,
    error: "",
    result: null,
    history: [],
    restoredReviewId: "",
    position: loadPosition(),
    dragging: false,
    movedDuringDrag: false,
    closing: false,
    closeTimer: null,
    feedbackFindingIndex: null,
    findingFeedbackDraft: "",
    findingFeedbackLoading: false,
    findingFeedbackImages: [],
    overallFeedbackOpen: false,
    overallFeedbackDraft: "",
    overallFeedbackImages: [],
    imageProcessingKind: "",
    imageSessionVersion: 0,
    activeRequestId: "",
    activeRequestUrl: "",
    activeRequestKind: "",
    settingsOpen: false,
    settings: null,
    settingsBusy: false,
    settingsMessage: "",
    settingsError: false
  };

  const root = document.createElement("aside");
  root.className = "bbai-panel";
  document.documentElement.appendChild(root);

  const ballRoot = document.createElement("aside");
  ballRoot.className = "bbai-panel bbai-panel--closed";
  document.documentElement.appendChild(ballRoot);

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "toggle-panel") {
      if (!isPullRequestPage()) {
        closePanel({ immediate: true });
        render();
        return;
      }

      togglePanel();
    }

    if (message?.type === "review-progress") {
      if (!isPullRequestPage()) return;
      if (message.requestId && message.requestId !== state.activeRequestId) return;
      if (message.url && message.url !== location.href) return;

      state.status = message.status;
      render();
    }

    if (message?.type === "review-completed" && isSamePullRequestUrl(message.url, location.href)) {
      clearActiveRequestState(message.requestId);
      loadReviewHistory({ selectCurrent: true, expectedUrl: location.href });
    }

    if (message?.type === "review-failed" && isSamePullRequestUrl(message.url, location.href)) {
      clearActiveRequestState(message.requestId);
      state.error = message.error || "评审失败。";
      render();
    }
  });

  installLocationChangeWatcher();
  installOutsideCloseHandler();
  window.addEventListener("pagehide", () => {
    clearAllFeedbackImages();
  });
  render();
  if (isPullRequestPage()) recoverReviewPageState();

  function render() {
    if (!isPullRequestPage()) {
      closePanel({ immediate: true });
      root.hidden = true;
      root.innerHTML = "";
      ballRoot.hidden = true;
      ballRoot.innerHTML = "";
      return;
    }

    renderBall();
    applyPosition();

    const shouldShowPanel = state.open || state.closing;
    root.hidden = !shouldShowPanel;

    if (!shouldShowPanel) {
      root.className = "bbai-panel";
      root.innerHTML = "";
      return;
    }

    if (state.closing && root.innerHTML) {
      root.className = "bbai-panel bbai-panel--open bbai-panel--closing";
      applyPosition();
      return;
    }

    const reviewBusy = state.loading || state.findingFeedbackLoading;
    const previousScrollTop = root.querySelector(".bbai-detail-scroll")?.scrollTop || 0;
    root.innerHTML = `
      <div class="bbai-header">
        <div class="bbai-title-block">
          <div class="bbai-title">代码评审</div>
        </div>
        <button class="bbai-icon-button" type="button" data-action="close" aria-label="收起面板">×</button>
      </div>
      <div class="bbai-workspace">
        <aside class="bbai-workspace-sidebar">
          <div class="bbai-command-panel">
            <button class="bbai-primary" type="button" data-action="review" ${reviewBusy ? "disabled" : ""}>
              <span class="bbai-primary-main">${state.loading ? "评审中" : "开始评审"}</span>
            </button>
            <button class="bbai-secondary${state.settingsOpen ? " bbai-secondary--active" : ""}" type="button" data-action="settings">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"></path>
                <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"></path>
              </svg>
              <span>设置</span>
            </button>
          </div>
          <div class="bbai-status-card ${getStatusCardClass()}">
            <span class="bbai-status-orb" aria-hidden="true"></span>
            <div>
              <div class="bbai-status-label">${reviewBusy ? "正在评审" : "状态"}</div>
              <div class="bbai-status">${escapeHtml(getStatusText())}</div>
            </div>
          </div>
          ${renderHistory()}
        </aside>
        <section class="bbai-workspace-detail">
          ${state.settingsOpen ? renderSettings() : renderReviewDetail()}
        </section>
      </div>
    `;
    root.className = "bbai-panel bbai-panel--open";
    applyPosition();

    const detailScroll = root.querySelector(".bbai-detail-scroll");
    if (detailScroll) detailScroll.scrollTop = previousScrollTop;

    root.querySelector('[data-action="close"]').addEventListener("click", () => {
      closePanel();
    });
    root.querySelector('[data-action="settings"]').addEventListener("click", openSettings);
    root.querySelector('[data-action="review"]').addEventListener("click", () => {
      state.settingsOpen = false;
      runReview();
    });
    root.querySelectorAll("[data-history-id]").forEach((button) => {
      button.addEventListener("click", () => restoreHistory(button.dataset.historyId));
    });
    root.querySelectorAll("[data-history-delete-id]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        deleteHistoryRecord(button.dataset.historyDeleteId);
      });
    });
    bindDetailInteractions();
  }

  function renderBall() {
    ballRoot.hidden = false;
    ballRoot.className = `bbai-panel bbai-panel--closed${state.open || state.closing ? " bbai-panel--orb-active" : ""}`;

    let ball = ballRoot.querySelector(".bbai-ball");
    if (!ball) {
      ballRoot.innerHTML = `
        <button class="bbai-ball" type="button" title="AI 评审">
          <span class="bbai-fusion-field" aria-hidden="true">
            <span class="bbai-fusion-halo bbai-fusion-halo--outer"></span>
            <span class="bbai-fusion-halo bbai-fusion-halo--middle"></span>
            <span class="bbai-fusion-halo bbai-fusion-halo--inner"></span>
            <span class="bbai-fusion-scan"></span>
            <span class="bbai-fusion-orbit bbai-fusion-orbit--outer"></span>
            <span class="bbai-fusion-orbit bbai-fusion-orbit--inner"></span>
            <span class="bbai-fusion-core">
              <span class="bbai-code-core">&lt;/&gt;</span>
            </span>
          </span>
        </button>
      `;
      ball = ballRoot.querySelector(".bbai-ball");
      bindBallDrag(ball);
    }

    ball.setAttribute("aria-label", state.open ? "收起 AI 评审面板" : "打开 AI 评审面板");
  }

  function isPullRequestPage() {
    return Boolean(window.BitbucketPrAiReviewerUrl?.isPullRequestPageUrl(location.href));
  }

  function isSamePullRequestUrl(left, right) {
    const getKey = window.BitbucketPrAiReviewerUrl?.getPullRequestPageKey;
    if (typeof getKey !== "function") return left === right;

    const leftKey = getKey(left);
    return Boolean(leftKey && leftKey === getKey(right));
  }

  function installLocationChangeWatcher() {
    let currentUrl = location.href;

    const notifyLocationChange = () => {
      window.dispatchEvent(new Event("bbai-location-change"));
    };

    ["pushState", "replaceState"].forEach((methodName) => {
      const originalMethod = history[methodName];
      history[methodName] = function wrappedHistoryMethod(...args) {
        const result = originalMethod.apply(this, args);
        notifyLocationChange();
        return result;
      };
    });

    window.addEventListener("popstate", notifyLocationChange);
    window.addEventListener("hashchange", notifyLocationChange);
    window.addEventListener("bbai-location-change", () => {
      if (location.href === currentUrl) return;

      currentUrl = location.href;
      resetPageState();
      render();
      if (isPullRequestPage()) recoverReviewPageState();
    });
  }

  function resetPageState() {
    const activeRequestForPage = state.activeRequestId && state.activeRequestUrl === location.href;
    state.open = false;
    state.status = DEFAULT_STATUS;
    state.loading = activeRequestForPage && state.activeRequestKind === "review";
    state.error = "";
    state.result = null;
    state.history = [];
    state.restoredReviewId = "";
    state.dragging = false;
    state.movedDuringDrag = false;
    state.closing = false;
    state.settingsOpen = false;
    state.settingsBusy = false;
    state.settingsMessage = "";
    state.settingsError = false;
    resetFeedbackState({ includeLoading: true });
    state.findingFeedbackLoading = activeRequestForPage && state.activeRequestKind === "finding";
    clearCloseTimer();
  }

  function installOutsideCloseHandler() {
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (!state.open || state.closing || state.dragging) return;

        const target = event.target;
        if (root.contains(target) || ballRoot.contains(target)) return;

        closePanel();
      },
      true
    );
  }

  function togglePanel() {
    if (state.open || state.closing) {
      closePanel();
      return;
    }

    openPanel();
  }

  function openPanel() {
    clearCloseTimer();
    state.open = true;
    state.closing = false;
    render();
  }

  function closePanel({ immediate = false } = {}) {
    clearCloseTimer();
    clearAllFeedbackImages();

    if (immediate || !state.open) {
      state.open = false;
      state.closing = false;
      return;
    }

    state.closing = true;
    render();
    state.closeTimer = window.setTimeout(() => {
      state.open = false;
      state.closing = false;
      state.closeTimer = null;
      render();
    }, CLOSE_ANIMATION_MS);
  }

  function clearCloseTimer() {
    if (!state.closeTimer) return;
    window.clearTimeout(state.closeTimer);
    state.closeTimer = null;
  }

  function clearActiveRequestState(requestId = "") {
    if (requestId && state.activeRequestId && requestId !== state.activeRequestId) return;
    state.loading = false;
    state.findingFeedbackLoading = false;
    state.activeRequestId = "";
    state.activeRequestUrl = "";
    state.activeRequestKind = "";
  }

  function closeReviewDetail() {
    state.restoredReviewId = "";
    state.result = null;
    state.status = DEFAULT_STATUS;
    resetFeedbackState();
    render();
  }

  function bindBallDrag(ball) {
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let offsetY = 0;

    ball.addEventListener("pointerdown", (event) => {
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      offsetY = event.clientY - state.position.top;
      state.dragging = true;
      state.movedDuringDrag = false;
      ball.setPointerCapture(pointerId);
      ballRoot.classList.add("bbai-panel--dragging");
    });

    ball.addEventListener("pointermove", (event) => {
      if (!state.dragging || event.pointerId !== pointerId) return;

      const nextTop = event.clientY - offsetY;
      const moved = Math.abs(event.clientX - startX) + Math.abs(event.clientY - startY);

      if (moved > 4) state.movedDuringDrag = true;
      state.position = DockedPosition.clampDockedPosition({ top: nextTop }, BALL_SIZE, window.innerHeight, PANEL_MARGIN);
      applyPosition();
    });

    ball.addEventListener("pointerup", (event) => {
      if (!state.dragging || event.pointerId !== pointerId) return;

      state.dragging = false;
      ballRoot.classList.remove("bbai-panel--dragging");
      savePosition(state.position);
      ball.releasePointerCapture(pointerId);
      pointerId = null;

      if (!state.movedDuringDrag) {
        togglePanel();
      }
    });

    ball.addEventListener("pointercancel", () => {
      state.dragging = false;
      ballRoot.classList.remove("bbai-panel--dragging");
      savePosition(state.position);
      pointerId = null;
    });
  }

  function applyPosition() {
    const ballPosition = DockedPosition.clampDockedPosition(state.position, BALL_SIZE, window.innerHeight, PANEL_MARGIN);
    const ballStyle = DockedPosition.createDockedStyle(ballPosition);
    state.position = ballPosition;
    ballRoot.style.left = ballStyle.left;
    ballRoot.style.right = "var(--bbai-orb-right-offset, 0px)";
    ballRoot.style.top = ballStyle.top;

    if (!state.open && !state.closing) return;
    const narrowViewport = window.innerWidth <= 560;
    const panelRight = narrowViewport ? PANEL_MARGIN : BALL_SIZE + PANEL_GAP;
    root.style.left = "auto";
    if (narrowViewport) {
      root.style.right = `${PANEL_MARGIN}px`;
    } else {
      root.style.right = `${BALL_SIZE + PANEL_GAP}px`;
    }
    root.style.top = "50%";

    const panelWidth = root.offsetWidth || Math.min(1180, window.innerWidth - (narrowViewport ? PANEL_MARGIN * 2 : 104));
    const panelHeight = root.offsetHeight || Math.min(760, window.innerHeight - (narrowViewport ? 20 : 48));
    const panelLeft = window.innerWidth - panelRight - panelWidth;
    const panelTop = (window.innerHeight - panelHeight) / 2;
    const orbCenterX = window.innerWidth - BALL_SIZE / 2;
    const orbCenterY = state.position.top + BALL_SIZE / 2;
    root.style.setProperty("--bbai-sink-x", `${orbCenterX - panelLeft}px`);
    root.style.setProperty("--bbai-sink-y", `${orbCenterY - panelTop}px`);
  }

  function loadPosition() {
    try {
      const parsed = JSON.parse(localStorage.getItem(POSITION_KEY) || "null");

      if (Number.isFinite(parsed?.top)) {
        return DockedPosition.clampDockedPosition(parsed, BALL_SIZE, window.innerHeight, PANEL_MARGIN);
      }
    } catch {
      // Ignore malformed localStorage and use the default position.
    }

    return DockedPosition.getDefaultDockedPosition(window.innerHeight, BALL_SIZE, PANEL_MARGIN);
  }

  function savePosition(position) {
    localStorage.setItem(POSITION_KEY, JSON.stringify({ top: position.top }));
  }

  async function runReview({ feedback = "", baseReviewId = "", imageKind = "" } = {}) {
    if (state.loading || state.findingFeedbackLoading) return;

    const normalizedFeedback = String(feedback || "").trim();
    const isFollowUp = Boolean(normalizedFeedback);
    const requestId = createRequestId();
    const requestUrl = location.href;

    if (isFollowUp && !baseReviewId) {
      state.error = "请先选择一条评审记录，再提交补充审查。";
      render();
      return;
    }

    state.activeRequestId = requestId;
    state.activeRequestUrl = requestUrl;
    state.activeRequestKind = "review";
    state.loading = true;
    state.error = "";
    if (!isFollowUp) {
      state.result = null;
      state.restoredReviewId = "";
      resetFeedbackState();
    }
    state.status = isFollowUp ? "正在根据补充反馈重新审查整个 PR..." : "正在启动评审...";
    render();

    try {
      const images = imageKind ? await serializeFeedbackImages(imageKind) : [];
      const response = await chrome.runtime.sendMessage({
        type: "review-current-pr",
        url: location.href,
        feedback: normalizedFeedback,
        baseReviewId,
        requestId,
        images
      });

      if (!isCurrentRequest(requestId, requestUrl)) return;

      if (!response?.ok) {
        throw new Error(response?.error || "评审失败。");
      }

      state.result = response.result;
      state.history = Array.isArray(response.history) ? response.history : state.history;
      state.restoredReviewId = state.history[0]?.id || "";
      state.status = summarizeResult(response.result);
      if (isFollowUp) {
        clearFeedbackImages("overall");
        state.overallFeedbackOpen = false;
        state.overallFeedbackDraft = "";
      }
    } catch (error) {
      if (isCurrentRequest(requestId, requestUrl)) {
        state.error = error.message || String(error);
      }
    } finally {
      if (state.activeRequestId === requestId) {
        state.loading = false;
        state.activeRequestId = "";
        state.activeRequestUrl = "";
        state.activeRequestKind = "";
        render();
      }
    }
  }

  function bindDetailInteractions() {
    root.querySelector('[data-action="back-from-settings"]')?.addEventListener("click", () => {
      state.settingsOpen = false;
      state.settingsMessage = "";
      state.settingsError = false;
      render();
    });

    root.querySelector('[data-action="settings-form"]')?.addEventListener("submit", (event) => {
      event.preventDefault();
      savePanelSettings(event.currentTarget);
    });

    root.querySelector('[data-action="reset-settings"]')?.addEventListener("click", resetPanelSettings);

    root.querySelector('[data-action="back-to-review-list"]')?.addEventListener("click", closeReviewDetail);

    root.querySelectorAll('[data-action="toggle-finding-feedback"]').forEach((button) => {
      button.addEventListener("click", () => toggleFindingFeedback(button.dataset.findingIndex));
    });

    root.querySelector('[data-action="finding-feedback-input"]')?.addEventListener("input", (event) => {
      state.findingFeedbackDraft = event.target.value;
    });
    bindFeedbackImageInteractions("finding", '[data-action="finding-feedback-input"]');

    root.querySelector('[data-action="submit-finding-feedback"]')?.addEventListener("click", (event) => {
      submitFindingFeedback(event.currentTarget.dataset.findingIndex);
    });

    root.querySelector('[data-action="cancel-finding-feedback"]')?.addEventListener("click", () => {
      if (state.findingFeedbackLoading) return;
      state.feedbackFindingIndex = null;
      state.findingFeedbackDraft = "";
      clearFeedbackImages("finding");
      state.error = "";
      render();
    });

    root.querySelector('[data-action="toggle-overall-feedback"]')?.addEventListener("click", () => {
      if (state.loading || state.findingFeedbackLoading) return;
      if (state.overallFeedbackOpen) {
        clearFeedbackImages("overall");
      } else {
        clearFeedbackImages("finding");
        state.feedbackFindingIndex = null;
        state.findingFeedbackDraft = "";
      }
      state.overallFeedbackOpen = !state.overallFeedbackOpen;
      state.error = "";
      render();
    });

    root.querySelector('[data-action="overall-feedback-input"]')?.addEventListener("input", (event) => {
      state.overallFeedbackDraft = event.target.value;
    });
    bindFeedbackImageInteractions("overall", '[data-action="overall-feedback-input"]');

    root.querySelector('[data-action="submit-overall-feedback"]')?.addEventListener("click", () => {
      submitOverallFeedback();
    });

    root.querySelector('[data-action="cancel-overall-feedback"]')?.addEventListener("click", () => {
      if (state.loading) return;
      state.overallFeedbackOpen = false;
      state.overallFeedbackDraft = "";
      clearFeedbackImages("overall");
      state.error = "";
      render();
    });
  }

  function bindFeedbackImageInteractions(kind, textareaSelector) {
    const picker = root.querySelector(`.bbai-feedback-attachments[data-image-kind="${kind}"]`);
    const input = picker?.querySelector('[data-action="select-feedback-images"]');
    const dropzone = picker?.querySelector('[data-action="feedback-image-drop"]');
    const textarea = root.querySelector(textareaSelector);
    if (!textarea) return;

    root.querySelectorAll(`[data-action="remove-feedback-image"][data-image-kind="${kind}"]`).forEach((button) => {
      button.addEventListener("click", () => removeFeedbackImage(kind, button.dataset.imageId));
    });

    if (picker && input && dropzone) {
      picker.querySelector('[data-action="choose-feedback-images"]')?.addEventListener("click", () => {
        if (!isFeedbackImageBusy()) input.click();
      });

      input.addEventListener("change", () => {
        const files = Array.from(input.files || []);
        input.value = "";
        addFeedbackImages(kind, files);
      });

      dropzone.addEventListener("dragover", (event) => {
        if (!ImageAttachments.hasFileTransfer(event.dataTransfer?.types)) return;
        event.preventDefault();
        if (isFeedbackImageBusy()) return;
        dropzone.classList.add("bbai-feedback-dropzone--active");
      });

      dropzone.addEventListener("dragleave", () => {
        dropzone.classList.remove("bbai-feedback-dropzone--active");
      });

      dropzone.addEventListener("drop", (event) => {
        dropzone.classList.remove("bbai-feedback-dropzone--active");
        if (!ImageAttachments.hasFileTransfer(event.dataTransfer?.types)) return;
        event.preventDefault();
        if (isFeedbackImageBusy()) return;
        addFeedbackImages(kind, Array.from(event.dataTransfer?.files || []));
      });
    }

    textarea.addEventListener("paste", (event) => {
      if (isFeedbackImageBusy()) return;
      const files = Array.from(event.clipboardData?.items || [])
        .filter((item) => item.kind === "file" && String(item.type || "").startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter(Boolean);
      if (!files.length) return;

      event.preventDefault();
      addFeedbackImages(kind, files);
    });
  }

  async function addFeedbackImages(kind, files) {
    if (isFeedbackImageBusy()) return;

    const attachments = getFeedbackImages(kind);
    let selected;
    try {
      selected = ImageAttachments.validateFiles(files, attachments.length);
    } catch (error) {
      state.error = error.message || String(error);
      render();
      return;
    }

    if (!selected.length) return;

    const sessionVersion = state.imageSessionVersion;
    state.imageProcessingKind = kind;
    state.error = "";
    render();

    try {
      for (const file of selected) {
        const attachment = await ImageAttachments.compressImageFile(file);
        if (sessionVersion !== state.imageSessionVersion) {
          ImageAttachments.releaseAttachments([attachment]);
          return;
        }
        attachments.push(attachment);
      }
    } catch (error) {
      if (sessionVersion === state.imageSessionVersion) {
        state.error = error.message || String(error);
      }
    } finally {
      if (sessionVersion === state.imageSessionVersion) {
        state.imageProcessingKind = "";
        render();
      }
    }
  }

  function removeFeedbackImage(kind, imageId) {
    if (isFeedbackImageBusy()) return;
    const attachments = getFeedbackImages(kind);
    const index = attachments.findIndex((attachment) => attachment.id === imageId);
    if (index < 0) return;

    ImageAttachments.releaseAttachments([attachments[index]]);
    attachments.splice(index, 1);
    state.error = "";
    render();
  }

  async function serializeFeedbackImages(kind) {
    return await Promise.all(
      getFeedbackImages(kind).map(async (attachment) => ({
        name: attachment.name,
        type: attachment.type,
        size: attachment.size,
        dataUrl: await ImageAttachments.blobToDataUrl(attachment.blob)
      }))
    );
  }

  function getFeedbackImages(kind) {
    return kind === "overall" ? state.overallFeedbackImages : state.findingFeedbackImages;
  }

  function isFeedbackImageBusy() {
    return Boolean(state.loading || state.findingFeedbackLoading || state.imageProcessingKind);
  }

  function clearFeedbackImages(kind) {
    ImageAttachments.releaseAttachments(getFeedbackImages(kind));
    state.imageSessionVersion += 1;
    if (state.imageProcessingKind === kind) state.imageProcessingKind = "";
  }

  function clearAllFeedbackImages() {
    ImageAttachments.releaseAttachments(state.findingFeedbackImages);
    ImageAttachments.releaseAttachments(state.overallFeedbackImages);
    state.imageSessionVersion += 1;
    state.imageProcessingKind = "";
  }

  function toggleFindingFeedback(value) {
    if (state.findingFeedbackLoading || state.loading) return;

    const index = Number.parseInt(value, 10);
    if (!Number.isInteger(index) || index < 0) return;

    if (state.feedbackFindingIndex === index) {
      clearFeedbackImages("finding");
      state.feedbackFindingIndex = null;
    } else {
      clearFeedbackImages("finding");
      clearFeedbackImages("overall");
      state.feedbackFindingIndex = index;
      state.findingFeedbackDraft = "";
      state.overallFeedbackOpen = false;
      state.overallFeedbackDraft = "";
    }
    state.error = "";
    render();
  }

  async function submitFindingFeedback(value) {
    if (state.findingFeedbackLoading || state.loading) return;

    const findingIndex = Number.parseInt(value, 10);
    const reviewId = state.restoredReviewId;
    const feedback = state.findingFeedbackDraft.trim();
    const requestId = createRequestId();
    const requestUrl = location.href;

    if (!reviewId || !Number.isInteger(findingIndex) || findingIndex < 0) {
      state.error = "找不到要复审的意见，请重新打开评审详情。";
      render();
      return;
    }

    if (!feedback) {
      state.error = "请先填写要反馈给 AI 的内容。";
      render();
      return;
    }

    state.activeRequestId = requestId;
    state.activeRequestUrl = requestUrl;
    state.activeRequestKind = "finding";
    state.findingFeedbackLoading = true;
    state.error = "";
    state.status = "正在提交反馈并重新审查这条意见...";
    render();

    try {
      const images = await serializeFeedbackImages("finding");
      const response = await chrome.runtime.sendMessage({
        type: "review-finding-feedback",
        url: location.href,
        reviewId,
        findingIndex,
        category: "",
        feedback,
        requestId,
        images
      });

      if (!isCurrentRequest(requestId, requestUrl)) return;

      if (!response?.ok) {
        throw new Error(response?.error || "单条意见复审失败。");
      }

      state.history = Array.isArray(response.history) ? response.history : state.history;
      clearFeedbackImages("finding");
      if (state.restoredReviewId === reviewId) {
        state.result = response.result;
        state.feedbackFindingIndex = findingIndex;
        state.findingFeedbackDraft = "";
        state.status = formatFeedbackVerdictStatus(response.verdict);
      } else {
        const selectedRecord = state.history.find((item) => item.id === state.restoredReviewId);
        if (selectedRecord?.result) state.result = selectedRecord.result;
      }
    } catch (error) {
      if (isCurrentRequest(requestId, requestUrl)) {
        state.error = error.message || String(error);
      }
    } finally {
      if (state.activeRequestId === requestId) {
        state.findingFeedbackLoading = false;
        state.activeRequestId = "";
        state.activeRequestUrl = "";
        state.activeRequestKind = "";
        render();
      }
    }
  }

  function submitOverallFeedback() {
    const feedback = state.overallFeedbackDraft.trim();

    if (!feedback) {
      state.error = "请先填写希望 AI 补充审查的内容。";
      render();
      return;
    }

    runReview({
      feedback,
      baseReviewId: state.restoredReviewId,
      imageKind: "overall"
    });
  }

  function formatFeedbackVerdictStatus(verdict) {
    if (verdict === "dismissed") return "AI 已根据反馈撤回这条意见。";
    if (verdict === "revised") return "AI 已根据反馈修订这条意见。";
    return "AI 已复审并确认这条意见。";
  }

  async function openSettings() {
    if (state.settingsOpen) return;

    state.settingsOpen = true;
    state.settingsBusy = true;
    state.settingsMessage = "正在加载设置…";
    state.settingsError = false;
    render();

    try {
      const response = await chrome.runtime.sendMessage({ type: "get-settings" });
      if (!response?.ok) throw new Error(response?.error || "设置加载失败。");
      state.settings = response.settings;
      state.settingsMessage = "";
    } catch (error) {
      state.settingsMessage = error.message || String(error);
      state.settingsError = true;
    } finally {
      state.settingsBusy = false;
      render();
    }
  }

  async function savePanelSettings(form) {
    state.settings = Object.fromEntries(new FormData(form).entries());
    state.settingsBusy = true;
    state.settingsMessage = "正在保存…";
    state.settingsError = false;
    render();

    try {
      const response = await chrome.runtime.sendMessage({ type: "save-settings", settings: state.settings });
      if (!response?.ok) throw new Error(response?.error || "设置保存失败。");
      state.settings = response.settings;
      state.settingsMessage = "设置已保存。";
    } catch (error) {
      state.settingsMessage = error.message || String(error);
      state.settingsError = true;
    } finally {
      state.settingsBusy = false;
      render();
    }
  }

  async function resetPanelSettings() {
    state.settingsBusy = true;
    state.settingsMessage = "正在恢复默认设置…";
    state.settingsError = false;
    render();

    try {
      const response = await chrome.runtime.sendMessage({ type: "reset-settings" });
      if (!response?.ok) throw new Error(response?.error || "默认设置恢复失败。");
      state.settings = response.settings;
      state.settingsMessage = "已恢复默认设置。";
    } catch (error) {
      state.settingsMessage = error.message || String(error);
      state.settingsError = true;
    } finally {
      state.settingsBusy = false;
      render();
    }
  }

  async function recoverReviewPageState() {
    const requestUrl = location.href;

    try {
      const response = await chrome.runtime.sendMessage({
        type: "get-review-request-status",
        url: requestUrl
      });

      if (location.href !== requestUrl || !response?.ok) return;

      if (response.active) {
        state.activeRequestId = response.requestId || "";
        state.activeRequestUrl = requestUrl;
        state.activeRequestKind = response.kind || "review";
        state.loading = state.activeRequestKind === "review";
        state.findingFeedbackLoading = state.activeRequestKind === "finding";
        state.status = response.status || "正在评审当前合并请求...";
        state.error = "";
        render();
      }

      await loadReviewHistory({
        selectCurrent: !response.active || response.kind === "finding",
        expectedUrl: requestUrl
      });
    } catch {
      await loadReviewHistory({ selectCurrent: true, expectedUrl: requestUrl });
    }
  }

  async function loadReviewHistory({ selectCurrent = false, expectedUrl = location.href } = {}) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: "get-review-history",
        url: expectedUrl
      });

      if (!response?.ok || location.href !== expectedUrl) return;

      state.history = Array.isArray(response.history) ? response.history : [];
      if (selectCurrent && response.currentReview?.result) {
        state.result = response.currentReview.result;
        state.restoredReviewId = response.currentReview.id;
        state.error = "";
        if (!state.loading && !state.findingFeedbackLoading) {
          state.status = `已载入 ${formatTime(response.currentReview.reviewedAt)} 的评审记录。`;
        }
      }
      render();
    } catch {
      // History restore is best-effort and should not block review usage.
    }
  }

  function restoreHistory(historyId) {
    state.settingsOpen = false;
    if (historyId === state.restoredReviewId) {
      closeReviewDetail();
      return;
    }

    const record = state.history.find((item) => item.id === historyId);
    if (!record?.result) return;

    state.result = record.result;
    state.restoredReviewId = record.id;
    state.error = "";
    resetFeedbackState();
    if (!state.loading) {
      state.status = `已载入 ${formatTime(record.reviewedAt)} 的评审记录。`;
    }
    render();
  }

  async function deleteHistoryRecord(historyId) {
    if (!historyId) return;
    if (state.loading || state.findingFeedbackLoading) {
      state.error = "请等待当前评审完成后再删除历史记录。";
      render();
      return;
    }

    const isDeletingSelected = historyId === state.restoredReviewId;
    state.error = "";

    try {
      const response = await chrome.runtime.sendMessage({
        type: "delete-review-history",
        id: historyId
      });

      if (!response?.ok) {
        throw new Error(response?.error || "删除评审记录失败。");
      }

      state.history = Array.isArray(response.history) ? response.history : state.history;
      if (isDeletingSelected || (state.restoredReviewId && !state.history.some((item) => item.id === state.restoredReviewId))) {
        state.restoredReviewId = "";
        state.result = null;
        resetFeedbackState();
      }
      state.status = "已删除这条评审记录。";
    } catch (error) {
      state.error = error.message || String(error);
    } finally {
      render();
    }
  }

  function getStatusCardClass() {
    if (state.error) return "bbai-status-card--error";
    if (state.loading || state.findingFeedbackLoading) return "bbai-status-card--loading";
    return "";
  }

  function getStatusText() {
    if (state.error) return state.error;
    if (state.loading || state.findingFeedbackLoading) return state.status || "正在评审当前合并请求...";
    return state.status;
  }

  function resetFeedbackState({ includeLoading = false } = {}) {
    clearAllFeedbackImages();
    state.feedbackFindingIndex = null;
    state.findingFeedbackDraft = "";
    if (includeLoading) state.findingFeedbackLoading = false;
    state.overallFeedbackOpen = false;
    state.overallFeedbackDraft = "";
  }

  function createRequestId() {
    return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function isCurrentRequest(requestId, requestUrl) {
    return state.activeRequestId === requestId && location.href === requestUrl;
  }

  function getSelectedReviewRecord() {
    if (!state.restoredReviewId) return null;
    return state.history.find((item) => item.id === state.restoredReviewId) || null;
  }

  function renderSettings() {
    const settings = state.settings;

    return `
      <div class="bbai-settings-view">
        <button class="bbai-settings-back" type="button" data-action="back-from-settings">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19 12H5"></path>
            <path d="m11 18-6-6 6-6"></path>
          </svg>
          <span>返回</span>
        </button>
        <div class="bbai-settings-scroll">
          ${
            settings
              ? `
                <form class="bbai-settings-form" data-action="settings-form">
                  <fieldset ${state.settingsBusy ? "disabled" : ""}>
                    <section class="bbai-settings-section">
                      <div class="bbai-settings-section-title"><span>01</span><strong>Bitbucket 连接</strong></div>
                      <div class="bbai-settings-grid">
                        <label>服务地址<input name="bitbucketBaseUrl" type="url" autocomplete="off" value="${escapeHtml(settings.bitbucketBaseUrl)}" placeholder="https://code.fineres.com"></label>
                        <label>认证方式<select name="bitbucketAuthScheme"><option value="Bearer" ${settings.bitbucketAuthScheme === "Bearer" ? "selected" : ""}>Bearer</option><option value="Basic" ${settings.bitbucketAuthScheme === "Basic" ? "selected" : ""}>Basic</option></select></label>
                      </div>
                      <label>访问令牌<input name="bitbucketToken" type="password" autocomplete="off" value="${escapeHtml(settings.bitbucketToken)}" placeholder="请输入 Bitbucket Token"></label>
                    </section>

                    <section class="bbai-settings-section">
                      <div class="bbai-settings-section-title"><span>02</span><strong>DeepSeek 模型</strong></div>
                      <div class="bbai-settings-grid">
                        <label>服务地址<input name="deepseekBaseUrl" type="url" autocomplete="off" value="${escapeHtml(settings.deepseekBaseUrl)}" placeholder="https://api.deepseek.com"></label>
                        <label>模型名称<input name="deepseekModel" type="text" autocomplete="off" value="${escapeHtml(settings.deepseekModel)}" placeholder="deepseek-v4-flash"></label>
                      </div>
                      <label>API 密钥<input name="deepseekApiKey" type="password" autocomplete="off" value="${escapeHtml(settings.deepseekApiKey)}" placeholder="请输入 DeepSeek API Key"></label>
                    </section>

                    <section class="bbai-settings-section">
                      <div class="bbai-settings-section-title"><span>03</span><strong>评审策略</strong></div>
                      <div class="bbai-settings-grid">
                        <label>单个片段最大字符数<input name="maxDiffCharsPerChunk" type="number" min="4000" max="50000" step="1000" value="${escapeHtml(settings.maxDiffCharsPerChunk)}"></label>
                        <label>diff 上下文行数<input name="contextLines" type="number" min="0" max="20" step="1" value="${escapeHtml(settings.contextLines)}"></label>
                      </div>
                      <label>评审规则<textarea name="reviewRules" rows="7" placeholder="填写额外评审关注点">${escapeHtml(settings.reviewRules)}</textarea></label>
                    </section>

                    <div class="bbai-settings-actions">
                      <button class="bbai-feedback-submit" type="submit">保存设置</button>
                      <button class="bbai-feedback-cancel" type="button" data-action="reset-settings">恢复默认</button>
                      <span class="bbai-settings-message${state.settingsError ? " bbai-settings-message--error" : ""}" role="status">${escapeHtml(state.settingsMessage)}</span>
                    </div>
                  </fieldset>
                </form>
              `
              : `<div class="bbai-settings-loading${state.settingsError ? " bbai-settings-loading--error" : ""}">${escapeHtml(state.settingsMessage || "正在加载设置…")}</div>`
          }
        </div>
      </div>
    `;
  }

  function renderReviewDetail() {
    const record = getSelectedReviewRecord();

    if (!record?.result) {
      return `
        <div class="bbai-detail-empty">
          <span class="bbai-detail-empty-icon" aria-hidden="true">
            <svg viewBox="0 0 96 96">
              <rect x="20" y="12" width="48" height="66" rx="9"></rect>
              <path d="M31 29h27M31 40h22M31 51h16"></path>
              <circle cx="64" cy="62" r="15"></circle>
              <path d="m75 73 11 11"></path>
            </svg>
          </span>
          <strong>选择一条评审记录</strong>
          <span>从左侧最近评审中选择记录，查看发现的问题和反馈结果。</span>
        </div>
      `;
    }

    return `
      <div class="bbai-detail-selected">
        <div class="bbai-detail-heading">
          <button class="bbai-detail-back" type="button" data-action="back-to-review-list">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M19 12H5"></path>
              <path d="m11 18-6-6 6-6"></path>
            </svg>
            <span>返回</span>
          </button>
          <strong title="${escapeHtml(record.title || "评审结果")}">${escapeHtml(record.title || "评审结果")}</strong>
          ${renderSummary(record.result)}
        </div>
        <div class="bbai-detail-scroll">
          ${renderFindings(record.result)}
        </div>
        ${state.feedbackFindingIndex == null ? renderOverallFeedback() : ""}
      </div>
    `;
  }

  function renderHistory() {
    if (!state.history.length) return "";

    return `
      <section class="bbai-history" aria-label="最近评审">
        <div class="bbai-section-title">最近评审</div>
        <div class="bbai-history-list">
          ${state.history.map(renderHistoryItem).join("")}
        </div>
      </section>
    `;
  }

  function renderHistoryItem(record) {
    const total = Number(record.urgentCount || 0) + Number(record.suggestionCount || 0);
    const isActive = record.id === state.restoredReviewId;

    return `
      <div class="bbai-history-entry">
        <button class="bbai-history-item ${isActive ? "bbai-history-item--active" : ""}" type="button" data-history-id="${escapeHtml(record.id)}">
          <span class="bbai-history-title">${escapeHtml(record.title || "评审结果")}</span>
          <span class="bbai-history-meta">${escapeHtml(formatTime(record.reviewedAt))} / ${total} 条发现</span>
        </button>
        <button class="bbai-history-delete" type="button" data-history-delete-id="${escapeHtml(record.id)}" aria-label="删除这条评审记录">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 6h18"></path>
            <path d="M8 6V4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2v2"></path>
            <path d="m5 6 1 14c.1 1.1 1 2 2.1 2h7.8c1.1 0 2-.9 2.1-2l1-14"></path>
            <path d="M10 11v6"></path>
            <path d="M14 11v6"></path>
          </svg>
        </button>
      </div>
    `;
  }

  function renderSummary(result = state.result) {
    if (!result) return "";

    const findings = getActiveFindings(result);
    const changedFiles = Array.isArray(result.changedFiles) ? result.changedFiles : [];
    const urgent = findings.filter((finding) => finding.severity === "urgent").length;
    const suggestions = findings.filter((finding) => finding.severity === "suggestion").length;

    return `
      <div class="bbai-summary">
        <div><strong>${changedFiles.length}</strong><span>文件</span></div>
        <div><strong>${result.chunksReviewed}</strong><span>片段</span></div>
        <div><strong>${urgent}</strong><span>紧急</span></div>
        <div><strong>${suggestions}</strong><span>建议</span></div>
      </div>
    `;
  }

  function renderFindings(result = state.result) {
    if (!result) return "";
    const findings = Array.isArray(result.findings) ? result.findings : [];
    if (!findings.length) {
      return `<div class="bbai-empty">没有发现问题。</div>`;
    }

    return `
      <div class="bbai-findings">
        ${findings.map((finding, index) => renderFinding(finding, index)).join("")}
      </div>
    `;
  }

  function renderFinding(finding, index) {
    const location = [finding.filePath, finding.line ? `第 ${finding.line} 行` : ""].filter(Boolean).join(" / ");
    const dismissed = finding.reviewStatus === "dismissed";
    const feedbackOpen = state.feedbackFindingIndex === index;

    return `
      <div class="bbai-finding-block">
        <div class="bbai-finding-file" title="${escapeHtml(location || "无文件路径")}">${escapeHtml(location || "无文件路径")}</div>
        <article class="bbai-finding bbai-finding--${finding.severity}${dismissed ? " bbai-finding--dismissed" : ""}${feedbackOpen ? " bbai-finding--feedback-open" : ""}">
          <div class="bbai-finding-top">
            <span class="bbai-severity${dismissed ? " bbai-severity--dismissed" : ""}">${dismissed ? "已撤回" : formatSeverity(finding.severity)}</span>
            <span class="bbai-finding-heading-copy" title="${escapeHtml(finding.title)}">
              <strong class="bbai-finding-title">${escapeHtml(finding.title)}</strong>
            </span>
            <button class="bbai-feedback-trigger${feedbackOpen ? " bbai-feedback-trigger--active" : ""}" type="button" data-action="toggle-finding-feedback" data-finding-index="${index}" ${state.loading || state.findingFeedbackLoading ? "disabled" : ""}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.5 9.5 0 0 1-3.8-.8L3 21l1.8-4.8A8.5 8.5 0 1 1 21 11.5Z"></path>
                <path d="M8 12h.01M12 12h.01M16 12h.01"></path>
              </svg>
              <span>${feedbackOpen ? "收起反馈" : "反馈给 AI"}</span>
            </button>
          </div>
          <p>${escapeHtml(finding.detail)}</p>
          <div class="bbai-fix">${escapeHtml(finding.suggestion)}</div>
          ${renderFeedbackRounds(finding.feedbackRounds)}
          ${feedbackOpen ? renderFindingFeedbackComposer(index, state.findingFeedbackLoading) : ""}
        </article>
      </div>
    `;
  }

  function renderFindingFeedbackComposer(index, loading) {
    return `
      <div class="bbai-finding-feedback${loading ? " bbai-finding-feedback--loading" : ""}">
        <div class="bbai-finding-feedback-input-shell${state.findingFeedbackImages.length ? " bbai-finding-feedback-input-shell--with-images" : ""}">
          <textarea class="bbai-feedback-textarea bbai-finding-feedback-textarea" data-action="finding-feedback-input" maxlength="4000" placeholder="输入反馈内容，可直接粘贴图片…" ${loading ? "disabled" : ""}>${escapeHtml(state.findingFeedbackDraft)}</textarea>
          <div class="bbai-feedback-input-footer">
            ${renderInlineFeedbackImages(state.findingFeedbackImages, loading, "finding")}
            <div class="bbai-feedback-actions">
              <button class="bbai-feedback-cancel" type="button" data-action="cancel-finding-feedback" ${loading ? "disabled" : ""}>取消</button>
              <button class="bbai-feedback-submit" type="button" data-action="submit-finding-feedback" data-finding-index="${index}" ${loading || state.imageProcessingKind ? "disabled" : ""}>
                <span>${loading ? "正在重新审查" : "重新审查"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderInlineFeedbackImages(attachments, disabled, kind) {
    if (!Array.isArray(attachments) || !attachments.length) return "";

    return `
      <div class="bbai-inline-feedback-images" aria-label="已粘贴图片">
        ${attachments
          .map(
            (attachment) => `
              <figure class="bbai-inline-feedback-image">
                <img src="${escapeHtml(attachment.previewUrl || "")}" alt="${escapeHtml(attachment.name || "反馈图片")}">
                <button type="button" data-action="remove-feedback-image" data-image-kind="${escapeHtml(kind)}" data-image-id="${escapeHtml(attachment.id || "")}" aria-label="移除图片 ${escapeHtml(attachment.name || "反馈图片")}" ${disabled ? "disabled" : ""}>×</button>
              </figure>
            `
          )
          .join("")}
      </div>
    `;
  }

  function renderFeedbackRounds(rounds) {
    if (!Array.isArray(rounds) || !rounds.length) return "";

    return `
      <div class="bbai-feedback-rounds">
        ${rounds
          .map(
            (round) => `
              <div class="bbai-feedback-round">
                <div class="bbai-feedback-round-user">
                  <div class="bbai-feedback-round-label">
                    <span>你的反馈${round.category ? ` · ${escapeHtml(round.category)}` : ""}</span>
                    <time>${escapeHtml(formatTime(round.reviewedAt))}</time>
                  </div>
                  <p>${escapeHtml(round.feedback)}</p>
                </div>
                <div class="bbai-feedback-round-ai bbai-feedback-round-ai--${escapeHtml(round.verdict || "confirmed")}">
                  <div class="bbai-feedback-round-label">
                    <span>AI 复审 · ${formatFeedbackVerdict(round.verdict)}</span>
                  </div>
                  <p>${escapeHtml(round.response)}</p>
                </div>
              </div>
            `
          )
          .join("")}
      </div>
    `;
  }

  function renderOverallFeedback() {
    const busy = state.loading || state.findingFeedbackLoading;

    if (!state.overallFeedbackOpen) {
      return `
        <div class="bbai-overall-feedback">
          <span class="bbai-overall-feedback-icon" aria-hidden="true">✦</span>
          <div class="bbai-overall-feedback-copy">
            <strong>还发现了遗漏？</strong>
            <span>补充要求后重新审查整个 PR</span>
          </div>
          <button type="button" data-action="toggle-overall-feedback" ${busy ? "disabled" : ""}>补充审查</button>
        </div>
      `;
    }

    return `
      <div class="bbai-overall-feedback bbai-overall-feedback--open">
        <div class="bbai-finding-feedback-input-shell${state.overallFeedbackImages.length ? " bbai-finding-feedback-input-shell--with-images" : ""}">
          <textarea class="bbai-feedback-textarea bbai-finding-feedback-textarea" data-action="overall-feedback-input" maxlength="4000" placeholder="输入补充审查要求，可直接粘贴图片…" ${state.loading ? "disabled" : ""}>${escapeHtml(state.overallFeedbackDraft)}</textarea>
          <div class="bbai-feedback-input-footer">
            ${renderInlineFeedbackImages(state.overallFeedbackImages, busy, "overall")}
            <div class="bbai-feedback-actions">
              <button class="bbai-feedback-cancel" type="button" data-action="cancel-overall-feedback" ${state.loading ? "disabled" : ""}>取消</button>
              <button class="bbai-feedback-submit" type="button" data-action="submit-overall-feedback" ${state.loading || state.imageProcessingKind ? "disabled" : ""}>${state.loading ? "正在重新审查" : "重新审查整个 PR"}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function summarizeResult(result) {
    const findings = getActiveFindings(result);
    if (!findings.length) return "评审完成，未发现问题。";

    const urgent = findings.filter((finding) => finding.severity === "urgent").length;
    const suggestions = findings.length - urgent;
    return `评审完成：${urgent} 个紧急问题，${suggestions} 条建议。`;
  }

  function getActiveFindings(result) {
    return (Array.isArray(result?.findings) ? result.findings : []).filter((finding) => finding?.reviewStatus !== "dismissed");
  }

  function formatFeedbackVerdict(verdict) {
    if (verdict === "dismissed") return "已撤回";
    if (verdict === "revised") return "已修订";
    return "仍然成立";
  }

  function formatSeverity(severity) {
    if (severity === "urgent") return "紧急";
    if (severity === "suggestion") return "建议";
    return severity || "提示";
  }

  function formatTime(value) {
    if (!value) return "未知时间";
    return new Date(value).toLocaleString("zh-CN");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
