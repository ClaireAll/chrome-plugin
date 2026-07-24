(function exposePullRequestUrlMatcher(globalScope) {
  const PULL_REQUEST_PATH_PATTERN =
    /\/projects\/([^/]+)\/repos\/([^/]+)\/pull-requests\/(\d+)(?:\/|$)/i;

  function isPullRequestPageUrl(input) {
    return Boolean(getPullRequestPageKey(input));
  }

  function getPullRequestPageKey(input) {
    try {
      const url = new URL(input);
      const match = url.pathname.match(PULL_REQUEST_PATH_PATTERN);
      if (!match) return "";

      return [
        url.origin,
        decodeURIComponent(match[1]),
        decodeURIComponent(match[2]),
        match[3]
      ].join("|");
    } catch {
      return "";
    }
  }

  const api = { getPullRequestPageKey, isPullRequestPageUrl };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  globalScope.BitbucketPrAiReviewerUrl = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
