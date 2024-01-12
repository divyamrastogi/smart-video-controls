document.addEventListener("keydown", function (e) {
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
