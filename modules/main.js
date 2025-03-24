/**
 * Main initialization module for Smart Video Controls
 * Manages initialization order and component loading
 */

// Global flag to track initialization state
let smartVideoControlsInitialized = false;

/**
 * Initialize all required handlers based on context
 * Using flags to ensure we don't initialize multiple times
 */
function initializeSmartVideoControls() {
  // Safety check to prevent double initialization
  if (smartVideoControlsInitialized) {
    console.log("[DEBUG] Smart Video Controls already initialized, skipping");
    return;
  }
  
  // Set the initialization flag
  smartVideoControlsInitialized = true;
  
  console.log("[DEBUG] Initializing Smart Video Controls...");
  
  // Check if we're in an iframe or main page
  const isIframe = inIframe();
  
  // Initialize VideoPositionManager in both contexts - this handles iframe<->parent coordination
  if (window.VideoPositionManager) {
    // First, explicitly set up the parent URL messaging for reliable cross-window communication
    if (typeof window.VideoPositionManager.setupParentMessaging === 'function') {
      window.VideoPositionManager.setupParentMessaging();
      console.log("[DEBUG] VideoPositionManager parent URL messaging initialized explicitly");
    }
    
    // Then initialize the full VideoPositionManager
    window.VideoPositionManager.setup();
    console.log("[DEBUG] VideoPositionManager initialized");
  } else {
    console.warn("[DEBUG] WARNING: VideoPositionManager not found!");
  }
  
  if (isIframe) {
    console.log("[DEBUG] Running in iframe context - ONLY enabling iframe handlers");
    
    // For iframes, we only need iframe-specific handling
    if (window.IframeVideoHandler) {
      window.IframeVideoHandler.setup();
      console.log("[DEBUG] IframeVideoHandler initialized");
    } else {
      console.error("[DEBUG] ERROR: IframeVideoHandler not found!");
    }
    
    // CRITICAL: DO NOT initialize other handlers in iframe context
    if (window.VideoControlShortcuts) {
      console.log("[DEBUG] VideoControlShortcuts available but NOT initialized in iframe");
    }
    
    if (window.DirectVideoHandler) {
      console.log("[DEBUG] DirectVideoHandler available but NOT initialized in iframe");
    }
    
    // Initialize video preloader in iframe context
    if (window.VideoPreloader) {
      window.VideoPreloader.setup();
      console.log("[DEBUG] VideoPreloader initialized for iframe");
    } else {
      console.warn("[DEBUG] WARNING: VideoPreloader not found for iframe!");
    }
  } else {
    console.log("[DEBUG] Running in parent page context - enabling parent page handlers");
    
    // For parent pages, we need to initialize both direct video and parent page handlers
    if (window.DirectVideoHandler) {
      window.DirectVideoHandler.setup();
      console.log("[DEBUG] DirectVideoHandler initialized for parent page");
    } else {
      console.warn("[DEBUG] WARNING: DirectVideoHandler not found!");
    }
    
    if (window.ParentPageHandler) {
      window.ParentPageHandler.setup();
      console.log("[DEBUG] ParentPageHandler initialized for parent page");
    } else {
      console.warn("[DEBUG] WARNING: ParentPageHandler not found!");
    }
    
    // Video shortcuts should ONLY run in parent context
    if (window.VideoControlShortcuts) {
      window.VideoControlShortcuts.setup();
      console.log("[DEBUG] VideoControlShortcuts initialized for parent page");
    } else {
      console.warn("[DEBUG] WARNING: VideoControlShortcuts not found!");
    }
    
    // Never initialize IframeVideoHandler in parent context
    if (window.IframeVideoHandler) {
      console.log("[DEBUG] IframeVideoHandler available but NOT initialized in parent page");
    }
    
    // Initialize video preloader in parent context
    if (window.VideoPreloader) {
      window.VideoPreloader.setup();
      console.log("[DEBUG] VideoPreloader initialized for parent page");
    } else {
      console.warn("[DEBUG] WARNING: VideoPreloader not found for parent page!");
    }
  }
  
  // Set up message listener for extension communications
  setupMessageListener();
  
  console.log("[DEBUG] Smart Video Controls initialization complete");
}

/**
 * Set up listeners for messages from the extension popup or background script
 */
function setupMessageListener() {
  // We only want to attach this listener once
  if (window._messageListenerAttached) {
    console.log("[DEBUG] Extension message listener already attached, skipping");
    return;
  }
  
  window._messageListenerAttached = true;
  
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === "checkVideoStatus") {
      handleCheckVideoStatus(sendResponse);
      return true; // Indicate async response
    } else if (inIframe()) {
      handleIframeCommands(request, sendResponse);
      return true; // Indicate async response
    } else {
      handleParentPageCommands(request, sendResponse);
      return true; // Indicate async response
    }
  });
  
  console.log("[DEBUG] Extension message listener attached");
}

/**
 * Handle video status check requests
 */
function handleCheckVideoStatus(sendResponse) {
  // Find direct videos first
  const directVideo = document.querySelector("video");
  
  if (directVideo) {
    // Handle direct video status
    sendResponse({
      videoExists: true,
      isPlaying: !directVideo.paused,
      source: "direct",
      duration: directVideo.duration,
      currentTime: directVideo.currentTime
    });
  } else if (!inIframe()) {
    // Check for iframe videos from parent page
    const iframes = findVideoIframes();
    if (iframes.length > 0) {
      sendResponse({
        videoExists: true,
        isPlaying: null, // We don't know the state yet
        source: "iframe",
        iframeCount: iframes.length
      });
    } else {
      sendResponse({
        videoExists: false
      });
    }
  }
}

/**
 * Handle commands when in iframe context
 */
function handleIframeCommands(request, sendResponse) {
  const videos = document.querySelectorAll("video");
  if (!videos || videos.length === 0) return false;
  
  // Use the playing video if available, otherwise use the first one
  const video = Array.from(videos).find(v => !v.paused) || videos[0];
  
  switch (request.action) {
    case "togglePlayPause":
      if (video.paused) video.play();
      else video.pause();
      sendResponse({ videoExists: true, isPlaying: !video.paused });
      break;
    case "skipAhead":
      video.currentTime += (request.seconds || 30);
      sendResponse({ currentTime: video.currentTime });
      break;
    case "rewind":
      video.currentTime -= (request.seconds || 30);
      sendResponse({ currentTime: video.currentTime });
      break;
  }
}

/**
 * Handle commands when in parent page context
 */
function handleParentPageCommands(request, sendResponse) {
  console.log("[DEBUG] Parent page received command:", request.action);
  
  // First check if we have a direct video on the page
  const video = document.querySelector("video");
  
  if (video) {
    // Pass to direct video handler
    console.log("[DEBUG] Routing command to direct video handler");
    const result = window.DirectVideoHandler.control(request.action, request.seconds);
    if (result) {
      sendResponse(result);
    } else {
      sendResponse({ success: false, reason: "Direct video handler failed" });
    }
  } else {
    // No direct video, so try to pass command to iframe videos
    console.log("[DEBUG] No direct video found, checking for iframe videos");
    
    // Find video iframes
    const iframes = findVideoIframes();
    
    if (iframes && iframes.length > 0) {
      console.log(`[DEBUG] Found ${iframes.length} potential video iframe(s), forwarding command`);
      
      // Use the parent page handler to send the command to iframes
      const success = window.ParentPageHandler.controlIframeVideos(request.action, {
        seconds: request.seconds
      });
      
      // We don't know the actual response from the iframe since it's async,
      // so we just indicate we tried to send the command
      if (success) {
        // If it's a play/pause command, we need to guess the new state
        if (request.action === "togglePlayPause") {
          // Just assume it worked, the UI will update on next status check
          sendResponse({ 
            commandSent: true,
            videoExists: true,
            wasSuccessful: true,
            source: "iframe"
          });
        } else {
          sendResponse({ commandSent: true, wasSuccessful: true, source: "iframe" });
        }
      } else {
        sendResponse({ commandSent: false, wasSuccessful: false, reason: "No iframes received command" });
      }
    } else {
      console.log("[DEBUG] No videos or video iframes found on page");
      sendResponse({ videoExists: false });
    }
  }
}

// Function to run initialization once
function runInitialization() {
  // Only run once
  if (!smartVideoControlsInitialized) {
    initializeSmartVideoControls();
  }
}

// Run initialization as soon as possible, but only once
if (document.readyState === "complete" || document.readyState === "interactive") {
  runInitialization();
} else {
  document.addEventListener("DOMContentLoaded", runInitialization);
}

// Re-check after window load in case there are dynamically added elements
// Using setTimeout to ensure it runs after any other load handlers
window.addEventListener("load", function() {
  setTimeout(runInitialization, 100);
}); 