// navigationHandler.js

/**
 * Handles navigation to the next or previous episode.
 * @param {string} action - The action to perform ('next' or 'previous').
 */
function navigateEpisode(action) {
  chrome.storage.sync.get([`${action}EpisodeSelector`], function (data) {
    const episodeSelector = data[`${action}EpisodeSelector`];
    if (episodeSelector) {
      const episodeButton = document.querySelector(episodeSelector);
      if (episodeButton) episodeButton.click();
    }
  });
}

/**
 * Listens for messages from the content script and triggers episode navigation.
 */
function setupEpisodeNavigationListener() {
  window.addEventListener("message", function (event) {
    if (
      event.data.action === "nextEpisodeClicked" ||
      event.data.action === "previousEpisodeClicked"
    ) {
      navigateEpisode(event.data.action.replace("Clicked", ""));
    }
  });
}
