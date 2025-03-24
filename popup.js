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

  // Visual debugger toggle setup
  const debugToggle = document.getElementById("debugToggle");
  const debugStatus = document.getElementById("debugStatus");
  
  // Initialize toggle state from storage
  chrome.storage.local.get(["visualLoggerVisible"], function(result) {
    const isVisible = result.visualLoggerVisible === true;
    debugToggle.checked = isVisible;
    debugStatus.textContent = isVisible ? "On" : "Off";
  });
  
  // Handle toggle changes
  debugToggle.addEventListener("change", function() {
    const isVisible = debugToggle.checked;
    debugStatus.textContent = isVisible ? "On" : "Off";
    
    // Save state to storage
    chrome.storage.local.set({ visualLoggerVisible: isVisible });
    
    // Send message to content script to toggle logger visibility
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "toggleVisualLogger",
        visible: isVisible
      });
    });
  });
  
  // Clear logs button
  document.getElementById("clearLogsButton").addEventListener("click", function() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "clearVisualLogs"
      });
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
