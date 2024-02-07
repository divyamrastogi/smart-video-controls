// iframeHandler.js

/**
 * Sets up an event listener for when the iframe loads.
 * Posts a message to the iframe for further setup.
 */
function handleIframeLoad() {
  const iframe = document.getElementsByTagName("iframe")[0];
  if (iframe) {
    iframe.addEventListener("load", function () {
      iframe.contentWindow.postMessage({ type: "setup-video-listener" }, "*");
    });
  }
}

/**
 * Checks if the current script is running inside an iframe.
 * @returns {boolean} True if inside an iframe, false otherwise.
 */
function inIframe() {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true;
  }
}
