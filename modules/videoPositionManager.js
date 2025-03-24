/**
 * Video Position Manager Module
 * Provides centralized handling of video playback positions
 * Uses parent page URL for storage regardless of iframe status
 */

// Create a namespace for the video position manager
window.VideoPositionManager = window.VideoPositionManager || {};

// Debugging flag
const DEBUG_VERBOSE = true;

/**
 * Log a debug message specifically for VideoPositionManager
 * @param {string} message - The message to log
 * @param {string} type - The type of log (debug, info, warn, error)
 */
function logDebug(message, type = 'debug') {
  const prefix = '[VideoPositionManager]';
  const fullMessage = `${prefix} ${message}`;
  
  // Console logging
  switch(type) {
    case 'error':
      console.error(fullMessage);
      break;
    case 'warn':
      console.warn(fullMessage);
      break;
    case 'info':
      console.info(fullMessage);
      break;
    default:
      console.log(fullMessage);
  }
  
  // Visual logger if available
  if (window.VisualLogger && window.VisualLogger.log) {
    window.VisualLogger.log(fullMessage, type);
  }
}

/**
 * Get the parent page URL, even when inside an iframe
 * @returns {Promise<string>} Promise that resolves to the URL of the parent page
 */
async function getParentPageUrl() {
  return new Promise((resolve) => {
    try {
      // Check if we're in an iframe
      const isInIframeContext = window.self !== window.top;
      logDebug(`Getting parent URL (in iframe: ${isInIframeContext})`, 'info');
      
      if (isInIframeContext) {
        // First attempt: Try using the referrer
        if (document.referrer) {
          const referrerUrl = document.referrer;
          // Check if referrer contains a path (not just domain)
          const referrerPath = new URL(referrerUrl).pathname;
          if (referrerPath && referrerPath !== '/') {
            logDebug(`Using complete referrer URL with path: ${referrerUrl}`, 'info');
            resolve(referrerUrl);
            return;
          } else {
            logDebug(`Referrer lacks path info: ${referrerUrl}, trying messaging`, 'warn');
          }
        } else {
          logDebug(`No referrer available, relying on parent messaging`, 'warn');
        }
        
        // Second attempt: Use postMessage to get parent URL
        // Set up a timeout to ensure we don't hang
        const timeoutId = setTimeout(() => {
          // If we have a referrer but communication failed, use the referrer as fallback
          if (document.referrer) {
            logDebug(`Messaging timed out, using referrer as fallback: ${document.referrer}`, 'warn');
            resolve(document.referrer);
          } else {
            logDebug(`Messaging timed out, falling back to current URL`, 'error');
            resolve(window.location.href);
          }
        }, 1000); // Longer timeout to allow for response
        
        // Track if we received a response
        let receivedResponse = false;
        
        // Set up a one-time message handler to receive the URL
        const handler = function(event) {
          logDebug(`Received message event from ${event.origin}`, 'debug');
          if (event.data && event.data.type === 'parent-url-response') {
            clearTimeout(timeoutId);
            receivedResponse = true;
            
            // Validate the URL
            try {
              const url = new URL(event.data.url);
              const fullUrl = url.href;
              
              logDebug(`Validated parent URL via message: ${fullUrl}`, 'info');
              window.removeEventListener('message', handler);
              resolve(fullUrl);
            } catch (err) {
              logDebug(`Invalid URL from parent: ${event.data.url}, error: ${err}`, 'error');
              if (document.referrer) {
                resolve(document.referrer);
              } else {
                resolve(window.location.href);
              }
            }
          }
        };
        
        window.addEventListener('message', handler);
        
        // Request the URL from parent
        logDebug(`Sending parent URL request via postMessage`, 'info');
        window.parent.postMessage({
          type: 'get-parent-url',
          from: window.location.href,
          timestamp: Date.now()
        }, '*');
        
        // Send a few more requests in case the first one is missed
        setTimeout(() => {
          if (!receivedResponse) {
            logDebug(`Retrying parent URL request`, 'debug');
            window.parent.postMessage({
              type: 'get-parent-url',
              from: window.location.href,
              timestamp: Date.now(),
              retry: true
            }, '*');
          }
        }, 300);
      } else {
        // If we're not in an iframe, just return the current URL
        logDebug(`Using current page URL (not in iframe): ${window.location.href}`, 'info');
        resolve(window.location.href);
      }
    } catch (e) {
      logDebug(`Error getting parent URL: ${e}`, 'error');
      // Fallback to current URL
      resolve(window.location.href);
    }
  });
}

/**
 * Generate a unique key for storing the video position
 * @param {HTMLVideoElement} videoElement - The video element
 * @returns {string} The generated key
 */
function generateVideoKey(videoElement) {
  try {
    // Check if we're in an iframe
    const isIframe = window !== window.top;
    
    // Get parent page URL (either from top window or current window)
    let parentUrl;
    
    if (isIframe) {
      try {
        // Try to access parent URL (may fail due to cross-origin)
        parentUrl = window.parent.location.href;
      } catch (e) {
        // Fallback to referrer or document URL if parent URL access fails
        parentUrl = document.referrer || window.location.href;
        logDebug(`Using referrer as parent URL: ${parentUrl}`, 'debug');
      }
    } else {
      // We're in the top window
      parentUrl = window.location.href;
    }
    
    // Clean the URL by removing any hash fragments
    const url = new URL(parentUrl);
    url.hash = '';
    const cleanUrl = url.toString();
    
    logDebug(`Generated video position key: ${cleanUrl}`, 'info');
    return cleanUrl;
  } catch (e) {
    // Fall back to document URL if anything fails
    logDebug(`Error generating key: ${e.message}, falling back to document URL`, 'error');
    return window.location.href;
  }
}

/**
 * Generate a CSS selector that uniquely identifies the video element
 * @param {HTMLVideoElement} video - The video element
 * @returns {string} A unique selector for the video
 */
function generateSelector(video) {
  // If the video has an ID, use it
  if (video.id) {
    return `#${video.id}`;
  }
  
  // If the video has a source with src, use it
  const source = video.querySelector('source[src]');
  if (source && source.src) {
    return `video-src-${hashString(source.src)}`;
  }
  
  // If the video itself has a src, use it
  if (video.src) {
    return `video-src-${hashString(video.src)}`;
  }
  
  // As a last resort, use the video's position in the DOM
  const videos = document.querySelectorAll('video');
  for (let i = 0; i < videos.length; i++) {
    if (videos[i] === video) {
      return `video-${i}`;
    }
  }
  
  // Fallback if all else fails
  return `video-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create a simple hash of a string
 * @param {string} str - The string to hash
 * @returns {string} A hash of the input string
 */
function hashString(str) {
  let hash = 0;
  if (str.length === 0) return hash.toString();
  
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  return Math.abs(hash).toString(36).substring(0, 8);
}

/**
 * Save the current video position to storage
 * @param {HTMLVideoElement} videoElement - The video element
 * @returns {Promise<void>}
 */
async function saveVideoPosition(videoElement) {
  // Don't save if the video is at the beginning or near the end
  if (!videoElement || 
      !videoElement.currentTime || 
      videoElement.currentTime < 5 || 
      (videoElement.duration && videoElement.currentTime > videoElement.duration - 10)) {
    logDebug('Not saving position: video is at beginning or end', 'debug');
    return;
  }
  
  // Generate the key for this video
  const videoKey = generateVideoKey(videoElement);
  
  // Save the video position data
  const positionData = {
    currentTime: videoElement.currentTime,
    duration: videoElement.duration || 0,
    lastPlayed: new Date().toISOString()
  };
  
  logDebug(`Saving position: ${videoKey} - Time: ${positionData.currentTime}/${positionData.duration}`, 'info');
  
  return new Promise((resolve) => {
    chrome.storage.local.set({
      [videoKey]: positionData
    }, function() {
      if (chrome.runtime.lastError) {
        logDebug(`Error saving position: ${chrome.runtime.lastError.message}`, 'error');
      } else {
        logDebug(`Position saved successfully`, 'debug');
      }
      resolve();
    });
  });
}

/**
 * Load the saved video position from storage
 * @param {HTMLVideoElement} videoElement - The video element
 * @returns {Promise<boolean>} Whether position was loaded successfully
 */
async function loadVideoPosition(videoElement) {
  if (!videoElement) {
    logDebug('Cannot load position: No video element provided', 'error');
    return false;
  }
  
  // Generate the key for this video
  const videoKey = generateVideoKey(videoElement);
  
  return new Promise((resolve) => {
    chrome.storage.local.get([videoKey], async function(result) {
      if (chrome.runtime.lastError) {
        logDebug(`Error loading position: ${chrome.runtime.lastError.message}`, 'error');
        resolve(false);
        return;
      }
      
      // Check if we have a saved position
      const savedPosition = result[videoKey];
      
      if (savedPosition) {
        logDebug(`Found saved position: ${JSON.stringify(savedPosition)}`, 'info');
        
        // Only restore if the video isn't already playing
        // and if we have valid time data
        if (savedPosition.currentTime > 0 && 
            (!videoElement.currentTime || videoElement.currentTime < 5)) {
          // Set the current time
          videoElement.currentTime = savedPosition.currentTime;
          logDebug(`Restored video to position: ${savedPosition.currentTime}`, 'info');
          resolve(true);
        } else {
          logDebug(`Video already has position (${videoElement.currentTime}), not restoring`, 'debug');
          resolve(false);
        }
      } else {
        // No saved position found with new key, try to migrate from old format
        const migrated = await migrateOldPositions(videoKey);
        
        if (migrated) {
          // Retry loading with the migrated data
          return loadVideoPosition(videoElement).then(resolve);
        } else {
          logDebug('No saved position found', 'debug');
          resolve(false);
        }
      }
    });
  });
}

/**
 * Set up event listeners for a video to save its position
 * @param {HTMLVideoElement} video - The video element to set up
 */
function setupVideoPositionTracking(video) {
  if (!video) {
    logDebug('No video element provided to setupVideoPositionTracking', 'warn');
    return;
  }
  
  logDebug('Setting up video position tracking', 'info');
  
  // Load saved position
  loadVideoPosition(video);
  
  // Save position on pause
  video.addEventListener('pause', () => {
    logDebug('Video paused - saving position', 'debug');
    saveVideoPosition(video);
  });
  
  // Remove existing unload listener to prevent duplicates
  const existingUnloadListener = video._posManagerUnloadListener;
  if (existingUnloadListener) {
    logDebug('Removing existing unload listener', 'debug');
    window.removeEventListener('beforeunload', existingUnloadListener);
  }
  
  // Create and store new unload listener
  const unloadListener = () => {
    logDebug('Page unloading - saving final position', 'debug');
    saveVideoPosition(video);
  };
  video._posManagerUnloadListener = unloadListener;
  
  // Save on page unload
  window.addEventListener('beforeunload', unloadListener);
  
  // Periodically save position while playing (every 30 seconds)
  let saveInterval = null;
  
  video.addEventListener('play', () => {
    logDebug('Video started playing - setting up periodic save', 'debug');
    if (!saveInterval) {
      saveInterval = setInterval(() => {
        if (!video.paused) {
          logDebug('Periodic save while playing', 'debug');
          saveVideoPosition(video);
        }
      }, 30000); // Save every 30 seconds
    }
  });
  
  video.addEventListener('pause', () => {
    if (saveInterval) {
      logDebug('Video paused - clearing periodic save interval', 'debug');
      clearInterval(saveInterval);
      saveInterval = null;
    }
  });
  
  // Make sure we clean up the interval
  video.addEventListener('ended', () => {
    if (saveInterval) {
      logDebug('Video ended - clearing periodic save interval', 'debug');
      clearInterval(saveInterval);
      saveInterval = null;
    }
    saveVideoPosition(video);
  });
  
  logDebug('Video position tracking setup complete', 'info');
}

/**
 * Handle parent page URL requests from iframes
 */
function setupParentUrlMessaging() {
  // Only set up the handler in the parent window
  if (window.self === window.top) {
    logDebug('Setting up parent URL messaging handler', 'info');
    
    // Remove any existing listener to prevent duplicates
    if (window._parentUrlMessageHandler) {
      window.removeEventListener('message', window._parentUrlMessageHandler);
      logDebug('Removed existing message handler', 'debug');
    }
    
    // Create and store the handler
    const messageHandler = (event) => {
      // Process get-parent-url requests
      if (event.data && event.data.type === 'get-parent-url') {
        const iframeOrigin = event.origin;
        const requestFrom = event.data.from || 'unknown';
        const isRetry = event.data.retry || false;
        
        logDebug(`Received URL request from iframe [${iframeOrigin}] from ${requestFrom}${isRetry ? ' (retry)' : ''}`, 'info');
        
        try {
          // Get the full current URL with path and all query parameters
          const fullUrl = window.location.href;
          
          // Send the complete URL back to the iframe
          event.source.postMessage({
            type: 'parent-url-response',
            url: fullUrl,
            timestamp: Date.now(),
            responseToRequest: event.data.timestamp
          }, '*'); // Using * for compatibility with different iframe origins
          
          logDebug(`Sent full URL response to iframe: ${fullUrl}`, 'info');
        } catch (error) {
          logDebug(`Error sending URL to iframe: ${error}`, 'error');
        }
      }
    };
    
    // Store the handler for potential cleanup later
    window._parentUrlMessageHandler = messageHandler;
    
    // Add the event listener
    window.addEventListener('message', messageHandler);
    
    // Debug current page info
    logDebug(`Parent page ready at: ${window.location.href}`, 'info');
  } else {
    logDebug('Not in parent window, skipping URL messaging setup', 'debug');
  }
}

/**
 * List all video positions in storage (for debugging)
 */
function debugListAllPositions() {
  logDebug('Listing all stored video positions', 'info');
  chrome.storage.local.get(null, function(items) {
    if (chrome.runtime.lastError) {
      logDebug(`Error retrieving all items: ${chrome.runtime.lastError.message}`, 'error');
      return;
    }
    
    const videoItems = Object.keys(items).filter(key => key.includes('#video-'));
    logDebug(`Found ${videoItems.length} video position entries`, 'info');
    
    videoItems.forEach(key => {
      const data = items[key];
      logDebug(`[STORED] ${key}: ${data.timestamp.toFixed(1)}s / ${data.lastPlayed}`, 'info');
    });
  });
}

/**
 * Initialize the module and handle parent URL responses
 */
function initVideoPositionManager() {
  logDebug('Initializing video position manager', 'info');
  
  // Set up parent URL messaging handler
  setupParentUrlMessaging();
  
  // Debug: list all stored positions
  if (DEBUG_VERBOSE) {
    debugListAllPositions();
  }
  
  // Find all videos on the page
  const videos = document.querySelectorAll('video');
  
  if (videos.length > 0) {
    logDebug(`Found ${videos.length} video element(s) on page`, 'info');
    videos.forEach(video => {
      setupVideoPositionTracking(video);
    });
    logDebug(`Set up position tracking for ${videos.length} video(s)`, 'info');
  } else {
    logDebug('No video elements found on initial page load', 'info');
  }
  
  // Watch for new video elements
  logDebug('Setting up MutationObserver to watch for new video elements', 'debug');
  const observer = new MutationObserver((mutations) => {
    let newVideosFound = false;
    
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        // If a video element is added
        if (node.tagName === "VIDEO") {
          newVideosFound = true;
          setupVideoPositionTracking(node);
          logDebug(`Set up position tracking for newly added video element`, 'info');
        }
        
        // Check for videos inside the added node
        if (node.querySelectorAll) {
          const nestedVideos = node.querySelectorAll('video');
          if (nestedVideos.length > 0) {
            newVideosFound = true;
            nestedVideos.forEach(video => {
              setupVideoPositionTracking(video);
            });
            logDebug(`Set up position tracking for ${nestedVideos.length} nested video(s)`, 'info');
          }
        }
      });
    });
    
    if (newVideosFound) {
      logDebug('New video elements were detected and set up for tracking', 'info');
    }
  });
  
  // Start observing the DOM
  observer.observe(document.body, { childList: true, subtree: true });
  logDebug('Video position manager initialization complete', 'info');
}

/**
 * Try to migrate old position keys to new format
 * @param {string} newKey - The new format key
 * @returns {Promise<boolean>} Whether migration was successful
 */
async function migrateOldPositions(newKey) {
  return new Promise((resolve) => {
    try {
      // Parse the URL from the new key
      const url = new URL(newKey);
      
      // Create potential old style keys to check
      const possibleOldKeys = [];
      
      // Check for old keys with hash video selectors
      chrome.storage.local.get(null, function(items) {
        if (chrome.runtime.lastError) {
          logDebug(`Error checking old keys: ${chrome.runtime.lastError.message}`, 'error');
          resolve(false);
          return;
        }
        
        // Find keys that start with our base URL
        const baseUrl = url.origin + url.pathname;
        const matchingKeys = Object.keys(items).filter(key => 
          key.startsWith(baseUrl + '#') || // Same URL with hash
          key.startsWith(url.origin + '#') // Just domain with hash
        );
        
        if (matchingKeys.length === 0) {
          logDebug(`No old format keys found to migrate`, 'debug');
          resolve(false);
          return;
        }
        
        logDebug(`Found ${matchingKeys.length} potential old format key(s) to migrate`, 'info');
        
        // Get the most recent old key to migrate
        let mostRecentKey = matchingKeys[0];
        let mostRecentTime = new Date(items[mostRecentKey].lastPlayed || 0);
        
        for (let i = 1; i < matchingKeys.length; i++) {
          const key = matchingKeys[i];
          const time = new Date(items[key].lastPlayed || 0);
          if (time > mostRecentTime) {
            mostRecentKey = key;
            mostRecentTime = time;
          }
        }
        
        // Migrate the most recent position
        const data = items[mostRecentKey];
        logDebug(`Migrating position from key: ${mostRecentKey} to ${newKey}`, 'info');
        
        // Store under the new key
        chrome.storage.local.set({
          [newKey]: data
        }, function() {
          if (chrome.runtime.lastError) {
            logDebug(`Error migrating position: ${chrome.runtime.lastError.message}`, 'error');
            resolve(false);
          } else {
            logDebug(`Successfully migrated position from old key to new format`, 'info');
            resolve(true);
          }
        });
      });
    } catch (e) {
      logDebug(`Error in migration attempt: ${e}`, 'error');
      resolve(false);
    }
  });
}

// Export the VideoPositionManager functionalities
const VideoPositionManager = {
  setup: function(video) {
    return setupVideoPositionTracking(video);
  },
  save: function(video) {
    return saveVideoPosition(video);
  },
  load: function(video) {
    return loadVideoPosition(video);
  },
  getKey: function(video) {
    return generateVideoKey(video);
  },
  debug: {
    // Debug functions
    getStoredPositions: async function() {
      return new Promise((resolve) => {
        chrome.storage.local.get(null, function(items) {
          if (chrome.runtime.lastError) {
            logDebug(`Error retrieving positions: ${chrome.runtime.lastError.message}`, 'error');
            resolve({});
            return;
          }
          
          // Filter for keys that look like URLs
          const positions = {};
          for (const key in items) {
            if (key.startsWith('http')) {
              positions[key] = items[key];
            }
          }
          
          resolve(positions);
        });
      });
    },
    clearAllPositions: async function() {
      return new Promise((resolve) => {
        chrome.storage.local.get(null, function(items) {
          if (chrome.runtime.lastError) {
            logDebug(`Error retrieving positions: ${chrome.runtime.lastError.message}`, 'error');
            resolve(false);
            return;
          }
          
          // Filter for keys that look like URLs
          const keys = Object.keys(items).filter(key => key.startsWith('http'));
          
          if (keys.length === 0) {
            logDebug('No video positions to clear', 'info');
            resolve(false);
            return;
          }
          
          chrome.storage.local.remove(keys, function() {
            if (chrome.runtime.lastError) {
              logDebug(`Error clearing positions: ${chrome.runtime.lastError.message}`, 'error');
              resolve(false);
            } else {
              logDebug(`Cleared ${keys.length} video positions`, 'info');
              resolve(true);
            }
          });
        });
      });
    }
  }
};

// Export to window for debugging
if (typeof window !== 'undefined') {
  window.VideoPositionManager = VideoPositionManager;
}

export default VideoPositionManager; 