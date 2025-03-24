/**
 * Direct Video Handler Module
 * Handles videos that are directly embedded in the page (not in iframes)
 */

// Global variable to ensure we only initialize once
let directHandlerInitialized = false;

/**
 * Set up video listeners for direct videos in the page
 */
function setupDirectVideoListeners() {
  const videos = document.querySelectorAll("video");
  if (!videos || videos.length === 0) {
    console.log("[DEBUG] [DirectVideoHandler] No videos found on page");
    return;
  }

  console.log(`[DEBUG] [DirectVideoHandler] Setting up ${videos.length} direct video listener(s)`);

  // Process all videos on the page
  videos.forEach(video => {
    console.log("[DEBUG] [DirectVideoHandler] Setting up direct video listener");
    
    // Use the VideoPositionManager to handle saving/loading positions if available
    if (window.VideoPositionManager) {
      console.log("[DEBUG] [DirectVideoHandler] VideoPositionManager detected, using it for playback position");
      window.VideoPositionManager.trackVideo(video);
      console.log("[DEBUG] [DirectVideoHandler] Using VideoPositionManager for direct video position tracking");
    } else {
      console.warn("[DEBUG] [DirectVideoHandler] VideoPositionManager not available, using fallback method");
      console.warn("[DEBUG] [DirectVideoHandler] This is likely why resume isn't working as expected");
      
      // For direct videos, use the page URL as key
      const pageUrl = window.location.href;
      console.log(`[DEBUG] [DirectVideoHandler] Using fallback key: ${pageUrl}`);
      
      // Load the saved timestamp
      chrome.storage.local.get([pageUrl], function (result) {
        if (result[pageUrl]) {
          const data = result[pageUrl];
          video.currentTime = data.timestamp - 2; // Start 2 seconds earlier
          console.log(
            `[DEBUG] [DirectVideoHandler] Resuming direct video from ${data.timestamp}s, last played on ${data.lastPlayed}`
          );
        } else {
          console.log(`[DEBUG] [DirectVideoHandler] No saved position found for key: ${pageUrl}`);
        }
      });

      // Save timestamp when video is paused or page is unloaded
      function saveVideoTime() {
        console.log(`[DEBUG] [DirectVideoHandler] Saving direct video time: ${video.currentTime}s`);
        chrome.storage.local.set({
          [pageUrl]: {
            timestamp: video.currentTime,
            duration: video.duration,
            lastPlayed: new Date().toISOString(),
          },
        });
      }

      video.addEventListener("pause", saveVideoTime);
      
      // Remove existing unload listener to prevent duplicates
      const existingUnloadListener = video._saveTimeListener;
      if (existingUnloadListener) {
        window.removeEventListener("beforeunload", existingUnloadListener);
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
 * Control a direct video with the given action
 */
function controlDirectVideo(action, options = {}) {
  const videos = document.querySelectorAll("video");
  if (!videos || videos.length === 0) {
    console.log("[DEBUG] [DirectVideoHandler] No videos found to control");
    return { success: false, reason: "No direct videos found" };
  }
  
  // Use the playing video if available, otherwise use the first one
  const video = Array.from(videos).find(v => !v.paused) || videos[0];
  
  console.log(`[DEBUG] [DirectVideoHandler] Controlling direct video with action: ${action}`);
  
  try {
    switch(action) {
      case "togglePlayPause":
        if (video.paused) {
          console.log("[DEBUG] [DirectVideoHandler] Playing video");
          video.play();
        } else {
          console.log("[DEBUG] [DirectVideoHandler] Pausing video");
          video.pause();
        }
        return { 
          success: true, 
          isPlaying: !video.paused, 
          currentTime: video.currentTime,
          duration: video.duration
        };
        
      case "skipAhead":
      case "forward":
        const forwardSeconds = options.seconds || 30;
        console.log(`[DEBUG] [DirectVideoHandler] Skipping ahead ${forwardSeconds}s`);
        video.currentTime += forwardSeconds;
        return { 
          success: true, 
          currentTime: video.currentTime,
          duration: video.duration
        };
        
      case "rewind":
        const rewindSeconds = options.seconds || 30;
        console.log(`[DEBUG] [DirectVideoHandler] Rewinding ${rewindSeconds}s`);
        video.currentTime = Math.max(0, video.currentTime - rewindSeconds);
        return { 
          success: true, 
          currentTime: video.currentTime,
          duration: video.duration
        };
        
      case "speedUp":
        console.log("[DEBUG] [DirectVideoHandler] Increasing playback rate");
        video.playbackRate += 0.25;
        return { 
          success: true, 
          playbackRate: video.playbackRate 
        };
        
      case "speedDown":
        console.log("[DEBUG] [DirectVideoHandler] Decreasing playback rate");
        video.playbackRate = Math.max(0.25, video.playbackRate - 0.25);
        return { 
          success: true, 
          playbackRate: video.playbackRate 
        };
        
      default:
        console.warn(`[DEBUG] [DirectVideoHandler] Unknown action: ${action}`);
        return { 
          success: false, 
          reason: `Unknown action: ${action}` 
        };
    }
  } catch (error) {
    console.error(`[DEBUG] [DirectVideoHandler] Error controlling video: ${error}`);
    return { 
      success: false, 
      reason: `Error: ${error.message}` 
    };
  }
}

/**
 * Initialize direct video handler
 */
function initDirectVideoHandler() {
  if (directHandlerInitialized) {
    console.log("[DEBUG] [DirectVideoHandler] Already initialized, skipping");
    return;
  }
  
  directHandlerInitialized = true;
  console.log("[DEBUG] [DirectVideoHandler] Initializing direct video handler");
  
  // Set up video listeners
  setupDirectVideoListeners();
  
  // Watch for dynamically added videos
  const observer = new MutationObserver((mutations) => {
    let newVideoAdded = false;
    
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        // Check if the added node is a video
        if (node.tagName === "VIDEO") {
          newVideoAdded = true;
        }
        
        // Check if the added node contains videos
        if (node.querySelectorAll) {
          const nestedVideos = node.querySelectorAll('video');
          if (nestedVideos.length > 0) {
            newVideoAdded = true;
          }
        }
      });
    });
    
    if (newVideoAdded) {
      console.log("[DEBUG] [DirectVideoHandler] New video detected, setting up listeners");
      setupDirectVideoListeners();
    }
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
  console.log("[DEBUG] [DirectVideoHandler] Initialization complete");
}

// Export functions to the window object
window.DirectVideoHandler = {
  setup: initDirectVideoHandler,
  control: controlDirectVideo
}; 