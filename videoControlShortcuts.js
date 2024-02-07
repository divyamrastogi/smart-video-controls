// videoControlShortcuts.js

/**
 * Sets up keyboard shortcuts for video control.
 */
function setupVideoControlShortcuts() {
  document.addEventListener("keydown", function (e) {
    if (e.altKey) {
      if (inIframe()) {
        const video = document.querySelectorAll("video")[0];
        if (e.code === "ArrowRight") {
          video.currentTime += 30; // Skip forward 30 seconds
          e.stopImmediatePropagation();
        } else if (e.code === "ArrowLeft") {
          video.currentTime -= 30; // Rewind 30 seconds
          e.stopImmediatePropagation();
        } else if (e.code === "KeyN") {
          window.parent.postMessage({ action: "nextEpisodeClicked" }, "*");
        } else if (e.code === "KeyP") {
          window.parent.postMessage({ action: "previousEpisodeClicked" }, "*");
        }
      } else {
        // send msg to iframe!
        const iframe = document.getElementsByTagName("iframe")[0];
        const message = { type: "video-control", action: null };
        if (e.code === "ArrowRight") {
          // Skip forward 30 seconds
          message.action = "forward";
          iframe.contentWindow.postMessage(message, "*");
        } else if (e.code === "ArrowLeft") {
          // Rewind 30 seconds
          message.action = "rewind";
          iframe.contentWindow.postMessage(message, "*");
        } else if (e.code === "KeyN") {
          navigateEpisode("next");
        } else if (e.code === "KeyP") {
          navigateEpisode("previous");
        }
      }
    }
  });
}
