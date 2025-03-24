/**
 * Video Preloader Module
 * Handles preloading video segments ahead of current playback position
 * to improve skipping performance
 */

// Create a namespace for the video preloader
window.VideoPreloader = window.VideoPreloader || {};

// Global variables to track preloading state
let preloadingActive = false;
let preloadingDistance = 90; // Default: preload 90 seconds ahead
let bufferThreshold = 60;    // Trigger preloading when less than 60 seconds buffer remains
let preloadCheckInterval = null;
let preloadAttempts = 0;     // Track preload attempts for debugging

/**
 * Enhanced logging function that logs to both console and visual logger if available
 */
function logDebug(message, type = 'debug') {
  // Check if we're in an iframe
  const isIframe = window.self !== window.top;
  
  // Add a prefix for iframe logs
  const prefix = isIframe ? '[IFRAME] ' : '';
  
  // Log to console
  console.log(`[DEBUG] ${prefix}${message}`);
  
  // Log to visual logger if available
  if (window.VisualLogger && typeof window.VisualLogger.log === 'function') {
    window.VisualLogger.log(`${message}`, type);
  }
}

/**
 * Configure the HTML5 video element for better preloading behavior
 * @param {HTMLVideoElement} video - The video element to configure
 */
function configureVideoForPreloading(video) {
  if (!video) return;
  
  // Set preload attribute to 'auto' to enable preloading
  video.preload = 'auto';
  
  // If the browser supports it, increase the buffer size
  if ('bufferingRate' in window.MediaSource) {
    window.MediaSource.bufferingRate = 3.0; // Increase buffering rate
  }
  
  logDebug("Video preloading attributes configured");
}

/**
 * Start periodic checks for preloading video content
 * @param {HTMLVideoElement} video - The video element to preload
 */
function startPreloading(video) {
  if (!video || preloadingActive) return;
  
  preloadingActive = true;
  preloadAttempts = 0;
  logDebug("Starting video preloading checks");
  
  // Check preloading every 5 seconds
  preloadCheckInterval = setInterval(() => checkAndPreload(video), 5000);
  
  // Also check immediately
  checkAndPreload(video);
}

/**
 * Stop preloading checks
 */
function stopPreloading() {
  if (preloadCheckInterval) {
    clearInterval(preloadCheckInterval);
    preloadCheckInterval = null;
  }
  preloadingActive = false;
  logDebug("Video preloading stopped");
}

/**
 * Clean up event listeners for a video element
 * @param {HTMLVideoElement} video - The video element to clean up
 */
function cleanupVideoPreloading(video) {
  if (!video) return;
  
  // Stop any active preloading
  stopPreloading();
  
  // Remove the keyboard event handler if it exists
  if (video._keyboardPreloadHandler) {
    document.removeEventListener('keydown', video._keyboardPreloadHandler);
    delete video._keyboardPreloadHandler;
  }
  
  // Remove timeupdate handler
  if (video._timeUpdateHandler) {
    video.removeEventListener('timeupdate', video._timeUpdateHandler);
    delete video._timeUpdateHandler;
  }
  
  // Remove progress handler
  if (video._progressHandler) {
    video.removeEventListener('progress', video._progressHandler);
    delete video._progressHandler;
  }
  
  // Reset preload status
  preloadingActive = false;
  logDebug("Video preloading cleaned up");
}

/**
 * Log buffer information for debugging
 * @param {HTMLVideoElement} video - The video element to check
 */
function logBufferInfo(video) {
  if (!video) return;
  
  const buffered = video.buffered;
  const currentTime = video.currentTime;
  let bufferInfoText = `Current time: ${currentTime.toFixed(1)}s | Buffer ranges: `;
  
  if (buffered.length === 0) {
    bufferInfoText += "No buffer ranges found";
  } else {
    for (let i = 0; i < buffered.length; i++) {
      const start = buffered.start(i);
      const end = buffered.end(i);
      bufferInfoText += `[${start.toFixed(1)}-${end.toFixed(1)}]`;
      
      if (i < buffered.length - 1) {
        bufferInfoText += ", ";
      }
    }
  }
  
  logDebug(bufferInfoText);
}

/**
 * Check if preloading is needed and perform preloading
 * @param {HTMLVideoElement} video - The video element to preload
 */
function checkAndPreload(video) {
  if (!video || video.paused || !preloadingActive) return;
  
  // Get current time and loaded ranges
  const currentTime = video.currentTime;
  const buffered = video.buffered;
  
  // Calculate target preload time
  const targetTime = currentTime + preloadingDistance;
  
  // Log the video source for debugging
  logDebug(`Video source: ${video.src.substring(0, 50)}...`);
  
  // Log current buffer state
  logBufferInfo(video);
  
  // First check how much buffer we have ahead
  let bufferedAheadSeconds = 0;
  let needsPreloading = true;
  
  for (let i = 0; i < buffered.length; i++) {
    // Check if this buffer range contains our current position
    if (buffered.start(i) <= currentTime && buffered.end(i) > currentTime) {
      // Calculate how many seconds are buffered ahead
      bufferedAheadSeconds = buffered.end(i) - currentTime;
      logDebug(`${bufferedAheadSeconds.toFixed(1)}s buffered ahead of current position`);
      
      // If we have more than our threshold buffered, no need to preload yet
      if (bufferedAheadSeconds > bufferThreshold) {
        needsPreloading = false;
        logDebug(`Buffer ahead (${bufferedAheadSeconds.toFixed(1)}s) exceeds threshold (${bufferThreshold}s), no preloading needed yet`);
      }
      break;
    }
  }
  
  // If we have less than our threshold buffered ahead, or if we've already buffered to our target,
  // decide whether to trigger preloading
  if (!needsPreloading) {
    // Check if we've already buffered up to our target time anyway
    let alreadyBufferedToTarget = false;
    for (let i = 0; i < buffered.length; i++) {
      if (buffered.start(i) <= targetTime && buffered.end(i) >= targetTime) {
        alreadyBufferedToTarget = true;
        logDebug(`Content already buffered up to target ${targetTime.toFixed(1)}s`);
        break;
      }
    }
    
    // If we haven't buffered to target yet, and we're below threshold, preload
    if (!alreadyBufferedToTarget && bufferedAheadSeconds <= bufferThreshold) {
      logDebug(`Buffer ahead (${bufferedAheadSeconds.toFixed(1)}s) below threshold (${bufferThreshold}s), triggering preload to ${targetTime.toFixed(1)}s`);
      triggerPreload(video, targetTime);
    }
  } else {
    // We need preloading based on our threshold check
    logDebug(`Only ${bufferedAheadSeconds.toFixed(1)}s buffered ahead, triggering preload to ${targetTime.toFixed(1)}s`);
    triggerPreload(video, targetTime);
  }
}

/**
 * Trigger preloading to a specific time point without interrupting playback
 * @param {HTMLVideoElement} video - The video element
 * @param {number} targetTime - The target time to preload up to
 */
function triggerPreload(video, targetTime) {
  preloadAttempts++;
  logDebug(`Preload attempt #${preloadAttempts} - Target: ${targetTime.toFixed(1)}s`);
  
  // First approach: Use the Media Source Extensions API if available
  if (window.MediaSource && video.src.includes('blob:')) {
    logDebug(`Requesting MSE buffer extension to ${targetTime}s`);
    // This is a hint to the MSE implementation, may not work on all browsers
    const event = new CustomEvent('requestbuffer', { 
      detail: { targetTime: targetTime } 
    });
    video.dispatchEvent(event);
    
    // Schedule a check to see if buffering was successful
    setTimeout(() => {
      checkBufferingResult(video, targetTime);
    }, 3000);
    
    return;
  }
  
  // Second approach: Create a secondary, hidden video element with the same source
  // that can load ahead without affecting the main playback
  logDebug(`Creating shadow video element to preload to ${targetTime}s`);
  
  // Create a hidden video element
  const shadowVideo = document.createElement('video');
  shadowVideo.style.display = 'none';
  shadowVideo.preload = 'auto';
  shadowVideo.muted = true;
  shadowVideo.src = video.src;
  shadowVideo.crossOrigin = video.crossOrigin;
  
  // Add necessary event listeners
  shadowVideo.addEventListener('loadedmetadata', () => {
    // Once metadata is loaded, seek to target time
    shadowVideo.currentTime = targetTime;
    logDebug(`Shadow video seeked to ${targetTime}s`);
    
    // Listen for when we've buffered enough
    shadowVideo.addEventListener('progress', checkProgress);
    shadowVideo.addEventListener('error', (e) => {
      logDebug(`Shadow video error: ${e.message || 'Unknown error'}`, 'error');
      cleanupShadow();
    });
    
    // Start loading
    shadowVideo.play().then(() => {
      logDebug(`Shadow video playback started, will pause once buffered`);
      shadowVideo.pause(); // Immediately pause to just load data
    }).catch((error) => {
      logDebug(`Shadow video play failed: ${error.message || 'Unknown error'}`, 'error');
      cleanupShadow();
    });
  });
  
  // Function to check if we've buffered enough
  function checkProgress() {
    const buffered = shadowVideo.buffered;
    
    // Check if we've buffered up to our target
    for (let i = 0; i < buffered.length; i++) {
      if (buffered.start(i) <= targetTime && buffered.end(i) >= targetTime) {
        logDebug(`Successfully preloaded up to ${targetTime}s`);
        cleanupShadow();
        return;
      }
    }
  }
  
  // Cleanup function
  function cleanupShadow() {
    shadowVideo.removeEventListener('progress', checkProgress);
    shadowVideo.src = '';
    if (shadowVideo.parentNode) {
      shadowVideo.parentNode.removeChild(shadowVideo);
    }
    logDebug(`Shadow video element removed`);
  }
  
  // Add to DOM temporarily
  document.body.appendChild(shadowVideo);
  
  // Set a timeout to clean up the shadow video after 30 seconds if it hasn't completed
  setTimeout(() => {
    logDebug(`Shadow video cleanup timeout reached`);
    cleanupShadow();
  }, 30000);
  
  // Schedule a check to see if buffering was successful
  setTimeout(() => {
    checkBufferingResult(video, targetTime);
  }, 5000);
}

/**
 * Check if buffering was successful after a delay
 * @param {HTMLVideoElement} video - The video element
 * @param {number} targetTime - The target time that was requested
 */
function checkBufferingResult(video, targetTime) {
  if (!video) return;
  
  const buffered = video.buffered;
  let success = false;
  
  for (let i = 0; i < buffered.length; i++) {
    if (buffered.start(i) <= targetTime && buffered.end(i) >= targetTime) {
      success = true;
      logDebug(`✓ Buffering successful: Target ${targetTime.toFixed(1)}s is now buffered`, 'info');
      break;
    }
  }
  
  if (!success) {
    logDebug(`⚠ Buffering check: Target ${targetTime.toFixed(1)}s not yet fully buffered`, 'warn');
    // Log current buffer state
    logBufferInfo(video);
  }
}

/**
 * Simple throttle function to limit how often a function can be called
 * @param {Function} func - The function to throttle
 * @param {number} limit - The time limit in milliseconds
 */
function throttle(func, limit) {
  let lastFunc;
  let lastRan;
  return function() {
    const context = this;
    const args = arguments;
    if (!lastRan) {
      func.apply(context, args);
      lastRan = Date.now();
    } else {
      clearTimeout(lastFunc);
      lastFunc = setTimeout(function() {
        if ((Date.now() - lastRan) >= limit) {
          func.apply(context, args);
          lastRan = Date.now();
        }
      }, limit - (Date.now() - lastRan));
    }
  };
}

/**
 * Set up preloading for a video element
 * @param {HTMLVideoElement} video - The video element to enable preloading for
 */
function setupVideoPreloading(video) {
  if (!video) return;
  
  // Configure the video element
  configureVideoForPreloading(video);
  
  // Initialize last check time
  video._lastCheckTime = video.currentTime;
  // Initialize time change threshold
  const timeChangeThreshold = 5; // seconds
  
  // Listen for play events to start preloading
  video.addEventListener('play', () => {
    logDebug(`Video playback started - activating preloader`);
    startPreloading(video);
  });
  
  // Listen for pause events to stop preloading
  video.addEventListener('pause', () => {
    logDebug(`Video playback paused - deactivating preloader`);
    stopPreloading();
  });
  
  // Listen for seeking to trigger immediate preloading at new position
  video.addEventListener('seeking', () => {
    logDebug(`Video seeking to ${video.currentTime.toFixed(1)}s`);
    if (preloadingActive) {
      checkAndPreload(video);
    }
  });
  
  // Create a throttled handler for timeupdate to avoid excessive calls
  const handleTimeUpdate = throttle(() => {
    // Get current time
    const currentTime = video.currentTime;
    
    // Calculate time difference since last check
    const timeDiff = Math.abs(video._lastCheckTime - currentTime);
    
    // If the time difference is significant, it might be from keyboard navigation
    if (timeDiff > timeChangeThreshold && preloadingActive) {
      logDebug(`Large time change detected (${timeDiff.toFixed(1)}s) - likely keyboard navigation`);
      checkAndPreload(video);
    }
    
    // Update last check time
    video._lastCheckTime = currentTime;
  }, 1000); // Throttle to once per second maximum
  
  // Listen for timeupdate events to monitor playback position changes
  video.addEventListener('timeupdate', handleTimeUpdate);
  
  // Store the handler for potential cleanup
  video._timeUpdateHandler = handleTimeUpdate;
  
  // Listen for progress events to log buffering activity (also throttled)
  const handleProgress = throttle(() => {
    if (preloadingActive) {
      logBufferInfo(video);
    }
  }, 2000); // Throttle to once every 2 seconds
  
  video.addEventListener('progress', handleProgress);
  video._progressHandler = handleProgress;
  
  // Add a document-level keyboard event listener to detect arrow key navigation
  const keyHandler = function(e) {
    // Only handle if this video is currently playing
    if (video.paused) return;
    
    // Check for arrow keys that might be used for navigation
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      logDebug(`Arrow key (${e.key}) pressed - checking buffer status`);
      // Small delay to allow video position to update
      setTimeout(() => {
        if (preloadingActive) {
          logDebug(`Triggering preload check after arrow key navigation`);
          checkAndPreload(video);
        }
      }, 500);
    }
  };
  
  // Store the handler reference to video object for potential cleanup
  video._keyboardPreloadHandler = keyHandler;
  document.addEventListener('keydown', keyHandler);
  
  logDebug("Video preloading listeners set up");
  
  // If the video is already playing, start preloading
  if (!video.paused) {
    startPreloading(video);
  }
}

/**
 * Initialize preloading for all videos on the page
 */
function initVideoPreloader() {
  logDebug("Initializing video preloader");
  
  // Initialize visual logger if available
  if (window.VisualLogger && typeof window.VisualLogger.init === 'function') {
    window.VisualLogger.init();
    logDebug("Visual logger initialized for preloader debugging");
  }
  
  // Find all videos on the page
  const videos = document.querySelectorAll("video");
  
  if (videos.length > 0) {
    videos.forEach(video => {
      setupVideoPreloading(video);
    });
    logDebug(`Set up preloading for ${videos.length} video(s)`);
  } else {
    logDebug(`No videos found on page, waiting for dynamic video elements`);
  }
  
  // Watch for new video elements
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        // If a video element is added
        if (node.tagName === "VIDEO") {
          setupVideoPreloading(node);
          logDebug(`Set up preloading for newly added video`);
        }
        
        // Check for videos inside the added node
        if (node.querySelectorAll) {
          const nestedVideos = node.querySelectorAll("video");
          if (nestedVideos.length > 0) {
            nestedVideos.forEach(video => {
              setupVideoPreloading(video);
            });
            logDebug(`Set up preloading for ${nestedVideos.length} nested video(s)`);
          }
        }
      });
    });
  });
  
  // Start observing the DOM
  observer.observe(document.body, { childList: true, subtree: true });
}

// Export functions to the window object
window.VideoPreloader = {
  setup: initVideoPreloader,
  preloadVideo: setupVideoPreloading,
  configure: configureVideoForPreloading,
  startPreloading: startPreloading,
  stopPreloading: stopPreloading,
  cleanup: cleanupVideoPreloading,
  checkBuffer: logBufferInfo
}; 