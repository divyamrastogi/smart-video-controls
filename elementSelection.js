// elementSelection.js

// Global variable to store the type of episode action being configured
let selectionType;

// Style element for highlighting selected elements
const hoverStyle = document.createElement("style");
hoverStyle.innerHTML = "*:hover { outline: 2px solid blue !important; }";

/**
 * Starts the element selection process, allowing the user to click on an element to select it.
 */
function startElementSelection() {
  document.body.style.cursor = "crosshair";
  document.head.appendChild(hoverStyle);
  document.addEventListener("mouseover", handleMouseOver);
  document.addEventListener("click", handleClick, true);
}

/**
 * Resets the selection styles and event listeners after selection is complete.
 */
function resetSelectionStyles() {
  document.body.style.cursor = "default";
  if (document.head.contains(hoverStyle)) {
    document.head.removeChild(hoverStyle);
  }
  document.removeEventListener("mouseover", handleMouseOver);
  document.removeEventListener("click", handleClick, true);
}

/**
 * Handles the mouseover event to highlight elements.
 */
function handleMouseOver(e) {
  e.stopPropagation();
  e.preventDefault();
}

/**
 * Handles the click event on an element, generating and saving its selector.
 */
function handleClick(e) {
  e.stopPropagation();
  e.preventDefault();

  // Save the selector based on the selection type
  const key = `${selectionType}EpisodeSelector`;
  const cssSelector = generateSelector(e.target);
  chrome.storage.sync.set({ [key]: cssSelector }, function () {
    console.log(`${selectionType} episode selector saved:`, cssSelector);
  });

  resetSelectionStyles();
}

// Listeners for messages to start or reset element selection
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.action === "startSelection") {
    selectionType = request.selectionType; // 'nextEpisode' or 'previousEpisode'
    startElementSelection();
  } else if (request.action === "resetSelectionStyles") {
    resetSelectionStyles();
  }
});
