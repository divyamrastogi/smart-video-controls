/**
 * Functions for handling parent page responsibilities and iframe communication
 */

/**
 * Finds all iframes on the page that potentially contain videos
 * @returns {Array} Array of iframe elements
 */
function findVideoIframes() {
  const allIframes = document.querySelectorAll('iframe');
  const potentialVideoIframes = Array.from(allIframes).filter(iframe => {
    const src = iframe.src.toLowerCase();
    // Common video embedding domains
    return src.includes('youtube.com') || 
           src.includes('vimeo.com') ||
           src.includes('dailymotion.com') ||
           src.includes('player') ||
           src.includes('embed') ||
           src.includes('video');
  });
  
  return potentialVideoIframes.length > 0 ? potentialVideoIframes : allIframes;
}

/**
 * Establishes communication with video iframes
 */
function setupIframeCommunication() {
  const iframes = findVideoIframes();
  
  iframes.forEach(iframe => {
    // Wait for iframe to load
    if (iframe.contentWindow) {
      try {
        // Setup communication
        iframe.addEventListener('load', function() {
          iframe.contentWindow.postMessage({ type: "setup-video-listener" }, "*");
          console.log("Sent setup message to iframe:", iframe.src);
        });
        
        // If already loaded
        if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
          iframe.contentWindow.postMessage({ type: "setup-video-listener" }, "*");
          console.log("Sent setup message to already loaded iframe:", iframe.src);
        }
      } catch (e) {
        console.error("Error communicating with iframe:", e);
      }
    }
  });
  
  // Listen for messages from iframes
  window.addEventListener('message', function(event) {
    // Security check: validate origin if needed
    // if (!trustedOrigins.includes(event.origin)) return;
    
    const data = event.data;
    
    if (data.type === "video-info") {
      // Got video info from iframe
      console.log("Received video info from iframe:", data);
      
      // You can store this information if needed for the UI
      // For example, to show video progress in the extension popup
    } else if (data.type === "video-control-ack") {
      // Acknowledgment of a control action
      console.log("Video control acknowledged:", data);
    } else if (data.type === "navigation") {
      // Handle navigation requests from the iframe
      if (data.action === "nextEpisode") {
        navigateEpisode("next");
      } else if (data.action === "previousEpisode") {
        navigateEpisode("previous");
      }
    }
  });
}

/**
 * Sends control commands to video iframes
 * @param {string} action - The action to take: forward, rewind, togglePlayPause, etc.
 * @param {Object} options - Additional options for the action
 */
function controlIframeVideos(action, options = {}) {
  const iframes = findVideoIframes();
  
  if (iframes.length === 0) {
    console.log("[DEBUG] No video iframes found to control");
    return false;
  }
  
  console.log(`[DEBUG] Sending ${action} command to ${iframes.length} iframe(s)`);
  
  // Map the extension action to the iframe action if needed
  let iframeAction = action;
  if (action === "skipAhead") {
    iframeAction = "forward";
  } else if (action === "speedUp" || action === "speedDown") {
    iframeAction = "setPlaybackRate";
    
    // Calculate new playback rate
    // We'd need to know the current rate, which we don't have
    // So just use a default adjustment
    options.rate = action === "speedUp" ? 1.5 : 0.75;
  }
  
  // Track successful sends
  let successCount = 0;
  
  iframes.forEach((iframe, index) => {
    try {
      if (iframe.contentWindow) {
        // Create the message to send
        const message = {
          type: "video-control",
          action: iframeAction,
          seconds: options.seconds || 30,
          rate: options.rate || 1.0
        };
        
        // Send the message
        iframe.contentWindow.postMessage(message, "*");
        console.log(`[DEBUG] Sent ${iframeAction} command to iframe ${index+1}:`, iframe.src);
        successCount++;
      }
    } catch (e) {
      console.error(`[DEBUG] Error sending control to iframe ${index+1}:`, e);
    }
  });
  
  return successCount > 0;
}

/**
 * Initialize parent page handling
 */
function initParentPageHandler() {
  // Only run if we're the top-level page
  if (!inIframe()) {
    setupIframeCommunication();
    
    // Watch for dynamically added iframes
    const observer = new MutationObserver((mutations) => {
      let newIframeAdded = false;
      
      mutations.forEach((mutation) => {
        const addedNodes = mutation.addedNodes;
        for (const node of addedNodes) {
          if (node.tagName === "IFRAME" || 
              (node.querySelectorAll && node.querySelectorAll('iframe').length > 0)) {
            newIframeAdded = true;
          }
        }
      });
      
      if (newIframeAdded) {
        setupIframeCommunication();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }
}

// Export functions for use in other modules
window.ParentPageHandler = {
  setup: initParentPageHandler,
  controlIframeVideos: controlIframeVideos
}; 