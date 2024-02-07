document.addEventListener("DOMContentLoaded", function () {
  const checkButton = document.getElementById("checkVideoButton");
  checkButton.addEventListener("click", function () {
    checkVideoStatus();
  });

  document
    .getElementById("playPauseButton")
    .addEventListener("click", function () {
      sendMessageToContentScript({ action: "togglePlayPause" });
      checkVideoStatus();
    });

  document
    .getElementById("skipAheadButton")
    .addEventListener("click", function () {
      sendMessageToContentScript({ action: "skipAhead" });
    });

  document
    .getElementById("rewindButton")
    .addEventListener("click", function () {
      sendMessageToContentScript({ action: "rewind" });
    });

  // document
  //   .getElementById("nextEpisodeButton")
  //   .addEventListener("click", function () {
  //     sendMessageToContentScript({ action: "nextEpisodeClicked" });
  //   });

  // document
  //   .getElementById("previousEpisodeButton")
  //   .addEventListener("click", function () {
  //     sendMessageToContentScript({ action: "previousEpisodeClicked" });
  //   });

  document
    .getElementById("configureNextButton")
    .addEventListener("click", function () {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "startSelection",
          selectionType: "nextEpisode",
        });
      });
    });

  document
    .getElementById("configurePrevButton")
    .addEventListener("click", function () {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "startSelection",
          selectionType: "previousEpisode",
        });
      });
    });

  checkVideoStatus();
});

// Function to check video status
function checkVideoStatus() {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    chrome.tabs.sendMessage(
      tabs[0].id,
      { action: "checkVideoStatus" },
      function (response) {
        if (response && response.videoExists) {
          updatePopup(response);
        }
      }
    );
  });
}

function updatePopup(response) {
  const statusDiv = document.getElementById("status");

  if (response && response.videoExists) {
    let statusText = "Video is " + (response.isPlaying ? "playing" : "paused");
    statusDiv.textContent = statusText;

    // Update the class based on playing status
    if (response.isPlaying) {
      statusDiv.className = "status status-playing";
    } else {
      statusDiv.className = "status status-paused";
    }
  } else {
    statusDiv.className = "status status-inactive";
    statusDiv.textContent = "No videos found";
  }
}

// ... existing event listener for DOMContentLoaded ...

function sendMessageToContentScript(message) {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    chrome.tabs.sendMessage(tabs[0].id, message);
  });
}
