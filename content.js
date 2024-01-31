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

  // Use the saved CSS selector to click the 'next episode' button or link
  chrome.storage.sync.get("nextEpisodeSelector", function (data) {
    if (data.nextEpisodeSelector) {
      window.addEventListener("message", function (event) {
        if (event.data.action === "nextEpisodeClicked") {
          const nextEpisodeButton = document.querySelector(
            data.nextEpisodeSelector
            );
          if (nextEpisodeButton) nextEpisodeButton.click();
        }
      });
    }
  });
}

if (inIframe()) {
  window.addEventListener("message", (event) => {
    if (event.data.type && event.data.type === "setup-video-listener") {
      setupVideoListeners(); // your setup code here
    }
  });

  const video = document.querySelector("video");
  if (video) {
    // Create and style the "Next Episode" button
    const nextButton = document.createElement("button");
    nextButton.textContent = "Next Episode";
    nextButton.style.position = "absolute";
    nextButton.style.right = "100px";
    nextButton.style.bottom = "100px";
    nextButton.style.zIndex = "1000"; // Ensure it appears above other elements
    nextButton.style.padding = "10px";
    nextButton.style.backgroundColor = "#f8f9fa";
    nextButton.style.border = "none";
    nextButton.style.borderRadius = "5px";
    nextButton.style.cursor = "pointer";

    // Function to show the "Next Episode" button towards the end of the video
    function checkVideoEnd() {
      if (video.duration - video.currentTime < 30) {
        // Show button 30 seconds before video ends
        nextButton.style.display = "block";
      } else {
        nextButton.style.display = "none";
      }
    }

    // Add the button to the document
    document.body.appendChild(nextButton);

    // Hide the button initially
    nextButton.style.display = "none";

    // Check periodically if the video is about to end
    video.addEventListener("timeupdate", checkVideoEnd);

    // Event listener for the Next Episode button
    nextButton.addEventListener("click", function () {
      // Send a message to the parent page
      window.parent.postMessage({ action: "nextEpisodeClicked" }, "*");
    });
  }
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
      } else if (e.code === "KeyN") {
        window.parent.postMessage({ action: "nextEpisodeClicked" }, "*");
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

// ... existing code ...
const hoverStyle = document.createElement("style");
hoverStyle.innerHTML = "*:hover { outline: 2px solid blue !important; }";

// Function to start element selection
function startElementSelection() {
  document.body.style.cursor = "crosshair";
  document.head.appendChild(hoverStyle);

  document.addEventListener("mouseover", handleMouseOver);
  document.addEventListener("click", handleClick, true);
}

// Handle mouse over to highlight elements
function handleMouseOver(e) {
  e.stopPropagation();
  e.preventDefault();
}

window.addEventListener("message", (event) => {
  // Ensure you check the origin for security purposes in a real implementation
  if (event.data.action === "resetSelectionStyles") {
      resetSelectionStyles();
  }
});

function resetSelectionStyles() {
  document.body.style.cursor = "default";
  if (document.head.contains(hoverStyle)) {
      document.head.removeChild(hoverStyle);
  }
  document.removeEventListener("mouseover", handleMouseOver);
  document.removeEventListener("click", handleClick, true);
}

// Handle click to select the element
function handleClick(e) {
  e.stopPropagation();
  e.preventDefault();

  const cssSelector = generateSelector(e.target);
  chrome.storage.sync.set({ nextEpisodeSelector: cssSelector }, function () {
    console.log("Next episode selector saved:", cssSelector);
    // Send a message to the iframe to reset selection styles
    const iframe = document.querySelector('iframe');
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ action: "resetSelectionStyles" }, "*");
    }
  });

  // Cleanup
  resetSelectionStyles()
}

// Function to generate CSS selector (this is a simple version)
function getCssSelector(element) {
  if (element.id) {
    return "#" + element.id;
  } else {
    // Implement more complex logic to generate a CSS selector
    // or use a library like `css-selector-generator`
    return element.tagName.toLowerCase();
  }
}

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.action === "startSelection") {
    startElementSelection();
  }
});

function generateSelector(el) {
  if (!el || !el.tagName) return '';

  // Function to get unique identifier for element
  const id = el.id ? `#${el.id}` : '';
  if (id) return id; // If the element has an id, that's usually enough

  const classNames = el.className ? `.${el.className.split(/\s+/).join('.')}` : '';
  const tagName = el.tagName.toLowerCase();
  const nthChild = getNthChild(el);
  const selector = `${tagName}${classNames}${nthChild}`;

  // If the generated selector uniquely identifies the element, use it
  if (document.querySelectorAll(selector).length === 1) {
      return selector;
  }

  // Otherwise, try to prefix with parent's selector
  if (el.parentElement) {
      const parentSelector = generateSelector(el.parentElement);
      return `${parentSelector} > ${selector}`;
  }

  return selector; // Fallback to less specific selector
}

// Function to get the nth-child selector
function getNthChild(element) {
  let childNumber = 0;
  for (let child = element; child !== null; child = child.previousElementSibling) {
      childNumber++;
  }
  return `:nth-child(${childNumber})`;
}


// get index for nth of type element
function getIndex(node) {
  let i = 1;
  let tagName = node.tagName;

  while (node.previousSibling) {
    node = node.previousSibling;
    if (
      node.nodeType === 1 &&
      tagName.toLowerCase() == node.tagName.toLowerCase()
    ) {
      i++;
    }
  }
  return i;
}