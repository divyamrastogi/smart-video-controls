// content.js
function handleRuntimeMessages() {
  chrome.runtime.onMessage.addListener(function (
    request,
    sender,
    sendResponse
  ) {
    const video = document.querySelector("video");
    if (!video) return;

    switch (request.action) {
      case "togglePlayPause":
        if (video.paused) video.play();
        else video.pause();
        sendResponse({ videoExists: true, isPlaying: !video.paused });
        break;
      case "skipAhead":
        video.currentTime += 5;
        break;
      case "rewind":
        video.currentTime -= 5;
        break;
      case "checkVideoStatus":
        const videoExists = video != null;
        const isPlaying = videoExists && !video.paused;
        sendResponse({ videoExists: videoExists, isPlaying: isPlaying });
        break;
    }
    return true;
  });
}
function setupVideoListeners(msg) {
  // your existing setup code...
  const video = document.querySelector("video");
  if (!video) return;

  // Load the saved timestamp
  chrome.storage.local.get([window.location.href], function (result) {
    if (result[window.location.href]) {
      const data = result[window.location.href];
      video.currentTime = data.timestamp - 2; // Start 2 seconds earlier
      console.log(
        `Resuming video from ${data.timestamp}s, last played on ${data.lastPlayed}`
      );
    }
  });

  // Save timestamp when video is paused or page is unloaded
  function saveVideoTime() {
    console.log(`Saving video time!`);
    chrome.storage.local.set({
      [window.location.href]: {
        timestamp: video.currentTime,
        lastPlayed: new Date().toISOString(),
      },
    });
  }

  video.addEventListener("pause", saveVideoTime);
  window.addEventListener("beforeunload", saveVideoTime);
  window.addEventListener("message", function (event) {
    alert(`content ${event.data.action} 30s`);
    if (event.data.type === "video-control") {
      if (event.data.action === "forward") {
        video.currentTime += 30;
      } else if (event.data.action === "rewind") {
        video.currentTime -= 30;
      }
    }
  });
}

// Check if the script is running inside an iframe
if (inIframe()) {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      const addedNodes = mutation.addedNodes;

      for (const node of addedNodes) {
        if (node.tagName === "VIDEO") {
          setupVideoListeners(); // Pass the added video node directly
        }
      }
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
} else {
  handleIframeLoad();
  setupEpisodeNavigationListener();
}

setupVideoListeners();
handleRuntimeMessages();
setupVideoControlShortcuts();
// Include any additional code or initializations here
