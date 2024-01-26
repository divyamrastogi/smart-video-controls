document.addEventListener("DOMContentLoaded", function () {
  const checkButton = document.getElementById("checkVideoButton");
  checkButton.addEventListener("click", function () {
    checkVideoStatus();
  });

  // Perform an initial check when the popup is loaded
  checkVideoStatus();

  // Event listener for play/pause button
  document
    .getElementById("playPauseButton")
    .addEventListener("click", function () {
      togglePlayPauseIcon();
      sendMessageToContentScript({ action: "togglePlayPause" });
      checkVideoStatus();
    });
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
          setPlayPauseIcon(response.isPlaying);
        }
      }
    );
  });
}

function updatePopup(response) {
  const statusDiv = document.getElementById("status");
  const detailsDiv = document.getElementById("details");

  if (response && response.videoExists) {
    let statusText = "Video is " + (response.isPlaying ? "playing" : "paused");
    statusDiv.textContent = statusText;
    detailsDiv.textContent =
      `Alt + Right Arrow: Skip 30s forward\nAlt + Left Arrow: Skip 30s back`;

    // Update the class based on playing status
    if (response.isPlaying) {
      statusDiv.className = "status status-playing";
    } else {
      statusDiv.className = "status status-paused";
    }
  } else {
    statusDiv.className = "status status-inactive";
    statusDiv.textContent = "No videos found";
    detailsDiv.textContent = "";
  }
}

// Function to set the correct icon based on video playing status
function setPlayPauseIcon(isPlaying) {
  const playIcon = document.getElementById("playIcon");
  const pauseIcon = document.getElementById("pauseIcon");
  if (isPlaying) {
    playIcon.style.display = "none";
    pauseIcon.style.display = "";
  } else {
    playIcon.style.display = "";
    pauseIcon.style.display = "none";
  }
}

// Function to toggle play/pause icon
function togglePlayPauseIcon() {
  const playIcon = document.getElementById("playIcon");
  const pauseIcon = document.getElementById("pauseIcon");
  if (playIcon.style.display === "none") {
    playIcon.style.display = "";
    pauseIcon.style.display = "none";
  } else {
    playIcon.style.display = "none";
    pauseIcon.style.display = "";
  }
}

// ... existing event listener for DOMContentLoaded ...

function sendMessageToContentScript(message) {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    chrome.tabs.sendMessage(tabs[0].id, message);
  });
}

document
  .getElementById("skipAheadButton")
  .addEventListener("click", function () {
    sendMessageToContentScript({ action: "skipAhead" });
  });

document.getElementById("rewindButton").addEventListener("click", function () {
  sendMessageToContentScript({ action: "rewind" });
});

// ... existing checkVideoStatus function and event listeners ...

document.getElementById('configureButton').addEventListener('click', function() {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, { action: "startSelection" });
  });
});
