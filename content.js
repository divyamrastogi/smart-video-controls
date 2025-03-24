// content.js
function handleRuntimeMessages() {
  chrome.runtime.onMessage.addListener(function (
    request,
    sender,
    sendResponse
  ) {
    const video = document.querySelector("video");
    
    // Handle visual logger commands that don't need a video
    if (request.action === "toggleVisualLogger") {
      if (window.VisualLogger) {
        if (request.visible) {
          // Make logger visible
          window.VisualLogger.show();
        } else {
          // Hide logger but keep collecting logs
          window.VisualLogger.hide();
        }
        sendResponse({ success: true, visible: request.visible });
      } else {
        sendResponse({ success: false, reason: "Visual logger not available" });
      }
      return true;
    }
    
    if (request.action === "clearVisualLogs") {
      if (window.VisualLogger) {
        window.VisualLogger.clear();
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, reason: "Visual logger not available" });
      }
      return true;
    }
    
    // Handle video-specific commands
    if (!video && request.action !== "checkVideoStatus") {
      sendResponse({ success: false, reason: "No video found" });
      return true;
    }

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
      case "speedDown":
        video.defaultPlaybackRate -= 0.1;
        video.play();
        break;
      case "speedUp":
        video.defaultPlaybackRate += 0.1;
        video.play();
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
  if (!video) {
    console.log("[DEBUG] [content.js] No video found on page");
    return;
  }

  console.log("[DEBUG] [content.js] Setting up video listeners for direct video");

  // Use the VideoPositionManager to handle saving/loading positions if available
  if (window.VideoPositionManager) {
    console.log("[DEBUG] [content.js] VideoPositionManager detected, using it for playback position");
    try {
      window.VideoPositionManager.trackVideo(video);
      console.log("[DEBUG] [content.js] Using VideoPositionManager for direct video position tracking");
    } catch (error) {
      console.error(`[DEBUG] [content.js] Error using VideoPositionManager: ${error}`);
      useFallbackMethod();
    }
  } else {
    console.warn("[DEBUG] [content.js] VideoPositionManager not available, using fallback method");
    useFallbackMethod();
  }

  function useFallbackMethod() {
    // Load the saved timestamp
    console.log(`[DEBUG] [content.js] Using fallback key: ${window.location.href}`);
    chrome.storage.local.get([window.location.href], function (result) {
      if (result[window.location.href]) {
        const data = result[window.location.href];
        video.currentTime = data.timestamp - 2; // Start 2 seconds earlier
        console.log(
          `[DEBUG] [content.js] Resuming video from ${data.timestamp}s, last played on ${data.lastPlayed}`
        );
      } else {
        console.log(`[DEBUG] [content.js] No saved position found for key: ${window.location.href}`);
      }
    });

    // Save timestamp when video is paused or page is unloaded
    function saveVideoTime() {
      console.log(`[DEBUG] [content.js] Saving video time: ${video.currentTime}s`);
      chrome.storage.local.set({
        [window.location.href]: {
          timestamp: video.currentTime,
          duration: video.duration,
          lastPlayed: new Date().toISOString(),
        },
      });
    }

    video.addEventListener("pause", saveVideoTime);
    window.addEventListener("beforeunload", saveVideoTime);
  }

  // Listen for messages from parent page
  window.addEventListener("message", function (event) {
    if (event.data.type === "video-control") {
      console.log(`[DEBUG] [content.js] Received video control message: ${event.data.action}`);
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
