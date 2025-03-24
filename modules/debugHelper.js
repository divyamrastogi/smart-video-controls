/**
 * Debug helper module for Smart Video Controls
 * Provides tools for diagnosing issues with video playback and controls
 */

/**
 * Checks the environment and reports details about videos and iframes
 * @returns {Object} Information about the environment
 */
function inspectEnvironment() {
  const info = {
    isIframe: inIframe(),
    videos: [],
    iframes: [],
    url: window.location.href,
    userAgent: navigator.userAgent
  };
  
  // Get video information
  const videos = document.querySelectorAll('video');
  videos.forEach((video, index) => {
    info.videos.push({
      index,
      src: video.src || 'No src attribute',
      currentTime: video.currentTime,
      duration: video.duration,
      paused: video.paused,
      muted: video.muted,
      volume: video.volume,
      playbackRate: video.playbackRate,
      readyState: video.readyState,
      networkState: video.networkState,
      selector: generateSelector(video)
    });
  });
  
  // Get iframe information if we're in parent context
  if (!inIframe()) {
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach((iframe, index) => {
      info.iframes.push({
        index,
        src: iframe.src,
        width: iframe.width,
        height: iframe.height,
        allowFullscreen: iframe.allowFullscreen
      });
    });
  }
  
  console.log('[Smart Video Controls Debug]', info);
  return info;
}

/**
 * Test keyboard shortcut handling by simulating key events
 */
function testKeyboardShortcuts() {
  console.log('[Smart Video Controls Debug] Testing keyboard shortcuts...');
  
  // Test Alt+Right (forward 30s)
  const forwardEvent = new KeyboardEvent('keydown', { 
    code: 'ArrowRight', 
    altKey: true,
    bubbles: true,
    cancelable: true
  });
  document.dispatchEvent(forwardEvent);
  console.log('[Smart Video Controls Debug] Simulated Alt+Right Arrow key');
  
  // Wait and test Alt+Left (rewind 30s)
  setTimeout(() => {
    const rewindEvent = new KeyboardEvent('keydown', { 
      code: 'ArrowLeft', 
      altKey: true,
      bubbles: true,
      cancelable: true
    });
    document.dispatchEvent(rewindEvent);
    console.log('[Smart Video Controls Debug] Simulated Alt+Left Arrow key');
  }, 1000);
  
  // Wait and test Alt+P (play/pause)
  setTimeout(() => {
    const playPauseEvent = new KeyboardEvent('keydown', { 
      code: 'KeyP', 
      altKey: true,
      bubbles: true,
      cancelable: true
    });
    document.dispatchEvent(playPauseEvent);
    console.log('[Smart Video Controls Debug] Simulated Alt+P key');
  }, 2000);
}

/**
 * Test video and iframe detection
 */
function testVideoDetection() {
  console.log('[Smart Video Controls Debug] Testing video detection...');
  
  // Check for direct videos
  const videos = document.querySelectorAll('video');
  console.log(`[Smart Video Controls Debug] Found ${videos.length} direct videos`);
  
  // If we're in parent context, check iframes
  if (!inIframe()) {
    const iframes = findVideoIframes();
    console.log(`[Smart Video Controls Debug] Found ${iframes.length} potential video iframes`);
  }
}

/**
 * Show all stored video positions
 */
function showVideoPositions() {
  console.log("Retrieving all stored video positions...");
  
  chrome.storage.local.get(null, function(items) {
    if (chrome.runtime.lastError) {
      console.error(`Error retrieving all items: ${chrome.runtime.lastError.message}`);
      return;
    }
    
    // Filter for likely video position keys
    const videoKeys = Object.keys(items).filter(key => 
      key.includes('video-') || 
      key.includes('#') || 
      (typeof items[key] === 'object' && items[key].timestamp !== undefined)
    );
    
    console.log(`Found ${videoKeys.length} video position entries:`);
    console.log("=".repeat(80));
    
    videoKeys.forEach(key => {
      const data = items[key];
      console.log(
        `KEY: ${key}\n` +
        `TIME: ${data.timestamp ? data.timestamp.toFixed(1) + 's' : 'N/A'}\n` +
        `DURATION: ${data.duration ? data.duration.toFixed(1) + 's' : 'N/A'}\n` +
        `LAST PLAYED: ${data.lastPlayed || 'N/A'}\n` +
        "-".repeat(80)
      );
    });
    
    if (videoKeys.length === 0) {
      console.log("No video position entries found in storage.");
    }
    
    console.log("=".repeat(80));
    console.log("To clear all stored positions, run: SmartVideoDebug.clearVideoPositions()");
  });
}

/**
 * Clear all stored video positions
 */
function clearVideoPositions() {
  console.log("Retrieving all stored video positions to clear...");
  
  chrome.storage.local.get(null, function(items) {
    if (chrome.runtime.lastError) {
      console.error(`Error retrieving all items: ${chrome.runtime.lastError.message}`);
      return;
    }
    
    // Filter for likely video position keys
    const videoKeys = Object.keys(items).filter(key => 
      key.includes('video-') || 
      key.includes('#') || 
      (typeof items[key] === 'object' && items[key].timestamp !== undefined)
    );
    
    if (videoKeys.length === 0) {
      console.log("No video position entries found to clear.");
      return;
    }
    
    console.log(`Clearing ${videoKeys.length} video position entries...`);
    
    // Create an object with null values for each key
    const keysToRemove = {};
    videoKeys.forEach(key => {
      keysToRemove[key] = null;
    });
    
    // Remove all the keys
    chrome.storage.local.remove(videoKeys, function() {
      if (chrome.runtime.lastError) {
        console.error(`Error clearing items: ${chrome.runtime.lastError.message}`);
      } else {
        console.log(`Successfully cleared ${videoKeys.length} video position entries.`);
      }
    });
  });
}

/**
 * Toggle logging level (minimal vs verbose)
 */
function toggleVerboseLogging() {
  if (window.VideoPositionManager && window.VideoPositionManager.toggleDebugLevel) {
    window.VideoPositionManager.toggleDebugLevel();
    console.log("Toggled verbose logging for VideoPositionManager");
  } else {
    console.warn("VideoPositionManager not available or doesn't support toggling debug level");
  }
}

// Export debug functions to global scope
window.DebugHelper = {
  inspectEnvironment,
  testKeyboardShortcuts,
  testVideoDetection,
  showVideoPositions,
  clearVideoPositions,
  toggleVerboseLogging
};

// Also export to SmartVideoDebug for easier access
window.SmartVideoDebug = {
  showVideoPositions,
  clearVideoPositions,
  toggleVerboseLogging,
  inspectEnvironment,
  testKeyboardShortcuts,
  testVideoDetection
}; 