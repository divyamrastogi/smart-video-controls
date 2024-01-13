function inIframe() {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true;
  }
}

if (!inIframe()) {
  const iframe = document.getElementsByTagName("iframe")[0];
  if (iframe != null) {
    iframe.addEventListener("load", function () {
      iframe.contentWindow.postMessage({ type: "setup-video-listener" }, "*");
    });
  }
}

if (inIframe()) {
  window.addEventListener("message", (event) => {
    if (event.data.type && event.data.type === "setup-video-listener") {
      setupVideoListeners(); // your setup code here
    }
  });
}

function setupVideoListeners() {
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
}

document.addEventListener("keydown", function (e) {
  console.log("keydownnn");
  if (e.altKey) {
    let videos = document.querySelectorAll("video");
    videos.forEach((video) => {
      if (e.key === "ArrowRight") {
        // Right arrow key
        video.currentTime += 30;
      } else if (e.key === "ArrowLeft") {
        // Left arrow key
        video.currentTime -= 30;
      }
    });
  }
});
// ... existing event listener for keydown ...

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  const video = document.querySelector("video");
  if (!video) return;

  switch (request.action) {
    case "togglePlayPause":
      if (video.paused) video.play();
      else video.pause();

      // Send back the new playing status
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
  return true; // Keep the message channel open for asynchronous response
});
