/**
 * Functions for handling videos that are inside iframes
 */

// IMPORTANT: Global variable to ensure we only initialize once
let iframeHandlerInitialized = false;
// Global variable to store keyboard handler reference
let keyboardHandlerInstalled = false;

/**
 * Sets up video listeners for a video inside an iframe
 * Handles saving and resuming video position for iframe videos
 */
function setupIframeVideoListeners() {
  const videos = document.querySelectorAll("video");
  if (!videos || videos.length === 0) {
    console.log("[DEBUG] [IframeVideoHandler] No videos found in iframe");
    return;
  }

  console.log(`[DEBUG] [IframeVideoHandler] Setting up ${videos.length} iframe video listener(s)`);

  // Process all videos in the iframe
  videos.forEach(video => {
    console.log("[DEBUG] [IframeVideoHandler] Setting up iframe video listener");
    
    // Use the VideoPositionManager to handle saving/loading positions if available
    if (window.VideoPositionManager) {
      console.log("[DEBUG] [IframeVideoHandler] VideoPositionManager detected, using it for playback position");
      window.VideoPositionManager.trackVideo(video);
      console.log("[DEBUG] [IframeVideoHandler] Using VideoPositionManager for iframe video position tracking");
    } else {
      console.warn("[DEBUG] [IframeVideoHandler] VideoPositionManager not available, using fallback method");
      console.warn("[DEBUG] [IframeVideoHandler] This is likely why resume isn't working as expected");
      // For iframe videos, use a combination of iframe src and video selector as key
      // This helps differentiate between multiple videos in different iframes
      const iframeSrc = window.location.href;
      const videoKey = iframeSrc + '_' + generateSelector(video);
      
      console.log(`[DEBUG] [IframeVideoHandler] Using fallback key: ${videoKey}`);
      
      // Load the saved timestamp
      chrome.storage.local.get([videoKey], function (result) {
        if (result[videoKey]) {
          const data = result[videoKey];
          video.currentTime = data.timestamp - 2; // Start 2 seconds earlier
          console.log(
            `[DEBUG] [IframeVideoHandler] Resuming iframe video from ${data.timestamp}s, last played on ${data.lastPlayed}`
          );
        } else {
          console.log(`[DEBUG] [IframeVideoHandler] No saved position found for key: ${videoKey}`);
        }
      });

      // Save timestamp when video is paused or iframe is unloaded
      function saveVideoTime() {
        console.log(`[DEBUG] [IframeVideoHandler] Saving iframe video time: ${video.currentTime}s`);
        const videoKey = iframeSrc + '_' + generateSelector(video);
        chrome.storage.local.set({
          [videoKey]: {
            timestamp: video.currentTime,
            lastPlayed: new Date().toISOString(),
          },
        });
      }

      video.addEventListener("pause", saveVideoTime);
      
      // Remove existing event listener to prevent duplicates
      const existingEventListener = video._saveTimeListener;
      if (existingEventListener) {
        window.removeEventListener("beforeunload", existingEventListener);
      }
      
      // Store reference to the event listener
      video._saveTimeListener = saveVideoTime;
      window.addEventListener("beforeunload", saveVideoTime);
    }
    
    // Set up preloading for this video if VideoPreloader is available
    if (window.VideoPreloader) {
      window.VideoPreloader.preloadVideo(video);
    }
  });
}

/**
 * COMPLETELY REWRITTEN: Single source of truth for keyboard handling in iframes
 * Using a simpler approach with a single handler
 */
function setupIframeKeyboardShortcuts() {
  // Only set up once to prevent duplicate handlers
  if (keyboardHandlerInstalled) {
    console.log("[DEBUG] Keyboard handler already installed, skipping");
    return;
  }

  // Add a global flag to mark installation
  keyboardHandlerInstalled = true;
  
  console.log("[DEBUG] Installing iframe keyboard handler");
  
  // CRITICAL: Remove any existing handlers with the same name if possible
  if (window._existingKeyHandler) {
    document.removeEventListener("keydown", window._existingKeyHandler, true);
    document.removeEventListener("keydown", window._existingKeyHandler, false);
  }
  
  // New single handler that will be installed at capture phase
  const keyHandler = function(e) {
    // Only handle Alt key combinations
    if (!e.altKey) return;
    
    const videos = document.querySelectorAll("video");
    if (!videos || videos.length === 0) return;
    
    // Use the playing video if available, otherwise use the first one
    const video = Array.from(videos).find(v => !v.paused) || videos[0];
    
    // Handle the keyboard shortcuts
    if (e.code === "ArrowRight") {
      // Using a fixed value rather than incrementing the current time
      // to avoid any possible race conditions
      const newTime = video.currentTime + 30;
      video.currentTime = newTime;
      console.log(`[DEBUG] SINGLE HANDLER: Video jumped to ${newTime}`);
      
      // Aggressive event cancellation
      e.stopImmediatePropagation();
      e.stopPropagation();
      e.preventDefault();
      return false;
    } 
    else if (e.code === "ArrowLeft") {
      const newTime = Math.max(0, video.currentTime - 30);
      video.currentTime = newTime;
      console.log(`[DEBUG] SINGLE HANDLER: Video rewound to ${newTime}`);
      
      // Aggressive event cancellation
      e.stopImmediatePropagation();
      e.stopPropagation();
      e.preventDefault();
      return false;
    }
    else if (e.code === "ArrowUp") {
      video.volume = Math.min(1, video.volume + 0.1);
      e.stopImmediatePropagation();
      e.stopPropagation();
      e.preventDefault();
    } 
    else if (e.code === "ArrowDown") {
      video.volume = Math.max(0, video.volume - 0.1);
      e.stopImmediatePropagation();
      e.stopPropagation();
      e.preventDefault();
    }
    else if (e.code === "KeyP") {
      if (video.paused) video.play();
      else video.pause();
      e.stopImmediatePropagation();
      e.stopPropagation();
      e.preventDefault();
    }
    else if (e.code === "KeyN") {
      window.parent.postMessage({ type: "navigation", action: "nextEpisode" }, "*");
      e.stopImmediatePropagation();
      e.stopPropagation();
      e.preventDefault();
    }
  };
  
  // Store reference to allow removal if needed
  window._existingKeyHandler = keyHandler;
  
  // Only use capture phase to ensure we get first priority
  document.addEventListener("keydown", keyHandler, true);
  
  console.log("[DEBUG] Iframe keyboard handler installed successfully");
}

/**
 * Handle messages from the parent page
 */
function setupIframeMessageHandler() {
  window.addEventListener("message", function (event) {
    // Security check: validate origin if needed
    // if (event.origin !== "https://trusted-domain.com") return;
    
    const videos = document.querySelectorAll("video");
    if (!videos || videos.length === 0) return;
    
    // Use the playing video if available, otherwise use the first one
    const video = Array.from(videos).find(v => !v.paused) || videos[0];
    
    // Skip if no video found (safety check)
    if (!video) {
      console.error("[DEBUG] No video found in iframe to control!");
      return;
    }
    
    if (event.data.type === "video-control") {
      console.log("[DEBUG] Iframe received control command:", event.data.action);
      
      if (event.data.action === "forward") {
        video.currentTime += (event.data.seconds || 30);
        console.log("[DEBUG] Iframe video forward: new position =", video.currentTime);
      } 
      else if (event.data.action === "rewind") {
        video.currentTime -= (event.data.seconds || 30);
        console.log("[DEBUG] Iframe video rewind: new position =", video.currentTime);
      } 
      else if (event.data.action === "togglePlayPause") {
        if (video.paused) {
          console.log("[DEBUG] Iframe video play command received");
          // Use promise to handle asynchronous play
          const playPromise = video.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => console.log("[DEBUG] Iframe video successfully played"))
              .catch(error => console.error("[DEBUG] Iframe video play failed:", error));
          }
        } else {
          console.log("[DEBUG] Iframe video pause command received");
          video.pause();
          console.log("[DEBUG] Iframe video successfully paused");
        }
      } 
      else if (event.data.action === "skipAhead") {
        video.currentTime += (event.data.seconds || 30);
        console.log("[DEBUG] Iframe video skipAhead: new position =", video.currentTime);
      }
      else if (event.data.action === "setPlaybackRate") {
        video.playbackRate = event.data.rate || 1.0;
        console.log("[DEBUG] Iframe video playback rate set to:", video.playbackRate);
      }
      
      // Send acknowledgment back to parent
      if (window.parent !== window) {
        window.parent.postMessage({
          type: "video-control-ack",
          action: event.data.action,
          currentTime: video.currentTime,
          isPaused: video.paused,
          playbackRate: video.playbackRate
        }, "*");
      }
    } else if (event.data.type === "setup-video-listener") {
      setupIframeVideoListeners();
      
      // Send acknowledgment with video info
      if (window.parent !== window) {
        window.parent.postMessage({
          type: "video-info",
          exists: true,
          count: videos.length,
          currentTime: video.currentTime,
          duration: video.duration,
          isPaused: video.paused
        }, "*");
      }
    }
  });
  
  console.log("[DEBUG] Iframe message handler set up");
}

/**
 * Initialize iframe video handling
 */
function initIframeVideoHandler() {
  // Only run if we're in an iframe AND haven't initialized yet
  if (inIframe() && !iframeHandlerInitialized) {
    console.log("[DEBUG] Initializing iframe video handler (first time)");
    
    // Set global flag to prevent multiple initializations
    iframeHandlerInitialized = true;
    
    // Set up components
    setupIframeVideoListeners();
    setupIframeMessageHandler();
    setupIframeKeyboardShortcuts();
    
    // Set up mutation observer to watch for dynamically added videos in the iframe
    const observer = new MutationObserver((mutations) => {
      let newVideoAdded = false;
      
      mutations.forEach((mutation) => {
        const addedNodes = mutation.addedNodes;
        for (const node of addedNodes) {
          if (node.tagName === "VIDEO" || 
              (node.querySelectorAll && node.querySelectorAll('video').length > 0)) {
            newVideoAdded = true;
          }
        }
      });
      
      if (newVideoAdded) {
        setupIframeVideoListeners();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  } else if (inIframe()) {
    console.log("[DEBUG] Iframe handler already initialized, skipping");
  }
}

// Export functions for use in other modules
window.IframeVideoHandler = {
  setup: initIframeVideoHandler
}; 