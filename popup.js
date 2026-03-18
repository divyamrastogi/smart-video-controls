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

  document.getElementById("speedUp").addEventListener("click", function () {
    sendMessageToContentScript({ action: "speedUp" });
  });

  document.getElementById("speedDown").addEventListener("click", function () {
    sendMessageToContentScript({ action: "speedDown" });
  });

  // Query current debug state and initialize button label
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    chrome.tabs.sendMessage(tabs[0].id, { action: "getDebugState" }, function(response) {
      updateDebugButton(response && response.debugEnabled);
    });
  });

  // Toggle debug logger button
  document.getElementById("toggleLoggerButton").addEventListener("click", function() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, { action: "toggleVisualLogger" }, function(response) {
        updateDebugButton(response && response.debugEnabled);
      });
    });
  });

  // Clear logs button
  document.getElementById("clearLogsButton").addEventListener("click", function() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, { action: "clearVisualLogs" });
    });
  });

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
        if (response) {
          updatePopup(response);
        } else {
          // Handle missing response case
          const statusDiv = document.getElementById("status");
          statusDiv.className = "status status-error";
          statusDiv.textContent = "Could not connect to video controller";
        }
      }
    );
  });
}

function updatePopup(response) {
  const statusDiv = document.getElementById("status");

  if (response && response.videoExists) {
    let statusText;
    
    if (response.source === "iframe") {
      statusText = "Video in iframe is " + (response.isPlaying ? "playing" : "paused");
    } else {
      statusText = "Video is " + (response.isPlaying ? "playing" : "paused");
    }
    
    statusDiv.textContent = statusText;

    // Update the class based on playing status
    if (response.isPlaying) {
      statusDiv.className = "status status-playing";
    } else {
      statusDiv.className = "status status-paused";
    }
  } else if (response && response.commandSent) {
    // For iframe commands that return only a "commandSent" status
    statusDiv.textContent = "Command sent to video";
    statusDiv.className = "status status-pending";
    
    // Check status again after a short delay to see if command worked
    setTimeout(checkVideoStatus, 500);
  } else {
    statusDiv.className = "status status-inactive";
    statusDiv.textContent = response ? response.reason || "No videos found" : "No videos found";
  }
}

// ... existing event listener for DOMContentLoaded ...

function updateDebugButton(isEnabled) {
  const btn = document.getElementById("toggleLoggerButton");
  if (!btn) return;
  btn.textContent = isEnabled ? "Disable Debug Logger" : "Enable Debug Logger";
  btn.style.backgroundColor = isEnabled ? "#d9534f" : "#4CAF50";
  btn.style.borderColor = isEnabled ? "#d9534f" : "#4CAF50";
}

function sendMessageToContentScript(message) {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    console.log("Sending command to tab:", message.action);
    chrome.tabs.sendMessage(tabs[0].id, message, function(response) {
      if (response) {
        console.log("Command response:", response);
        // Update UI with the response
        updatePopup(response);
      }
    });
  });
}
