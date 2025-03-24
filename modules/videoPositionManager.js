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
 * Generate a unique key for the video, including parent page URL
 * @param {HTMLVideoElement} video - The video element
 * @returns {Promise<string>} Promise that resolves to the unique key
 */
async function generateVideoKey(video) {
  // Get a selector to uniquely identify this video among others on the page
  const videoSelector = generateSelector(video);
  logDebug(`Generated video selector: ${videoSelector}`, 'debug');
  
  // Get the parent page URL (works in both iframe and direct contexts)
  const parentUrl = await getParentPageUrl();
  
  // Extract important parts of the URL for the key
  try {
    const url = new URL(parentUrl);
    
    // Check if we have a meaningful path (not just /)
    const hasPath = url.pathname && url.pathname !== '/';
    
    // If we have a path, use the full URL (domain + path)
    // Otherwise, just use the domain
    let stableUrl;
    if (hasPath) {
      // Clean the URL by removing any hash fragments but keeping the path and important query params
      stableUrl = `${url.origin}${url.pathname}`;
      
      // Add important query parameters related to video identification
      const params = new URLSearchParams(url.search);
      const importantParams = [];
      
      ['v', 'id', 'video', 'vid', 'movie', 'episode'].forEach(param => {
        if (params.has(param)) {
          importantParams.push(`${param}=${params.get(param)}`);
        }
      });
      
      if (importantParams.length > 0) {
        stableUrl += '?' + importantParams.join('&');
      }
      
      logDebug(`Using full URL with path for key: ${stableUrl}`, 'info');
    } else {
      // No meaningful path, just use the domain
      stableUrl = url.origin;
      logDebug(`URL has no path, using origin: ${stableUrl}`, 'warn');
    }
    
    // Create a key using the stable URL representation and video selector
    const key = `${stableUrl}#${videoSelector}`;
    logDebug(`Generated video position key: ${key}`, 'info');
    
    return key;
  } catch (e) {
    // Fallback to using the full URL if parsing fails
    logDebug(`Error parsing URL, using full URL as key: ${e}`, 'warn');
    const key = `${parentUrl}#${videoSelector}`;
    logDebug(`Generated fallback video position key: ${key}`, 'info');
    return key;
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
 * Save the current playback position of a video
 * @param {HTMLVideoElement} video - The video element
 */
async function saveVideoPosition(video) {
  if (!video) {
    logDebug('No video element provided to saveVideoPosition', 'warn');
    return;
  }
  
  try {
    // Generate the key asynchronously
    const videoKey = await generateVideoKey(video);
    const currentTime = video.currentTime;
    
    // Only save if we have a valid time (not 0, not NaN)
    if (currentTime > 0 && !isNaN(currentTime)) {
      logDebug(`Saving video position: ${currentTime.toFixed(1)}s for key: ${videoKey}`, 'info');
      
      const dataToStore = {
        timestamp: currentTime,
        duration: video.duration,
        lastPlayed: new Date().toISOString(),
      };
      
      // Store in Chrome storage
      chrome.storage.local.set({
        [videoKey]: dataToStore
      }, function() {
        if (chrome.runtime.lastError) {
          logDebug(`Storage error: ${chrome.runtime.lastError.message}`, 'error');
        } else {
          logDebug(`Successfully saved position ${currentTime.toFixed(1)}s to storage`, 'debug');
        }
      });
    } else {
      logDebug(`Not saving invalid position: ${currentTime}`, 'warn');
    }
  } catch (error) {
    logDebug(`Error saving video position: ${error}`, 'error');
  }
}

/**
 * Load the saved playback position for a video
 * @param {HTMLVideoElement} video - The video element
 */
async function loadVideoPosition(video) {
  if (!video) {
    logDebug('No video element provided to loadVideoPosition', 'warn');
    return;
  }
  
  try {
    // Generate the key asynchronously
    const videoKey = await generateVideoKey(video);
    logDebug(`Looking up saved position for key: ${videoKey}`, 'info');
    
    // Retrieve from Chrome storage
    chrome.storage.local.get([videoKey], async function (result) {
      if (chrome.runtime.lastError) {
        logDebug(`Storage retrieval error: ${chrome.runtime.lastError.message}`, 'error');
        return;
      }
      
      if (result[videoKey]) {
        const data = result[videoKey];
        logDebug(`Found saved data: ${JSON.stringify(data)}`, 'info');
        
        // Only resume if we have a valid saved position
        if (data.timestamp > 0 && !isNaN(data.timestamp)) {
          // Start 2 seconds earlier for context
          const resumeTime = Math.max(0, data.timestamp - 2);
          
          // Don't resume if we're near the end of the video
          if (data.duration && data.timestamp > data.duration - 10) {
            logDebug(`Video was near the end (${data.timestamp.toFixed(1)}/${data.duration.toFixed(1)}), starting from beginning`, 'info');
            return;
          }
          
          // Set the time
          logDebug(`Setting video.currentTime to ${resumeTime.toFixed(1)}s (saved pos: ${data.timestamp.toFixed(1)}s)`, 'debug');
          video.currentTime = resumeTime;
          logDebug(
            `Resumed video from ${resumeTime.toFixed(1)}s (saved: ${data.timestamp.toFixed(1)}s), last played on ${data.lastPlayed}`,
            'info'
          );
        } else {
          logDebug(`Saved position ${data.timestamp} is invalid, not resuming`, 'warn');
        }
      } else {
        logDebug(`No saved position found for key: ${videoKey}`, 'info');
        
        // Try to migrate from old key format
        const migrated = await migrateOldPositions(videoKey);
        if (migrated) {
          logDebug(`Migrated from old key format, reloading position`, 'info');
          // Reload with the migrated position
          loadVideoPosition(video);
        } else {
          logDebug(`No migration performed or needed`, 'debug');
        }
      }
    });
  } catch (error) {
    logDebug(`Error loading video position: ${error}`, 'error');
  }
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
 * @param {string} videoKey - The new format key
 * @returns {Promise<boolean>} Whether migration was successful
 */
async function migrateOldPositions(videoKey) {
  return new Promise((resolve) => {
    try {
      // Parse the new key to get components
      const [url, videoSelector] = videoKey.split('#');
      const parsedUrl = new URL(url);
      
      // Create the old style key (domain only)
      const oldKey = `${parsedUrl.origin}#${videoSelector}`;
      
      // Only try migration if old and new keys are different
      if (oldKey === videoKey) {
        resolve(false);
        return;
      }
      
      logDebug(`Attempting to migrate from old key: ${oldKey} to new key: ${videoKey}`, 'info');
      
      // Check if we have data under the old key
      chrome.storage.local.get([oldKey], function(result) {
        if (chrome.runtime.lastError) {
          logDebug(`Error checking old key: ${chrome.runtime.lastError.message}`, 'error');
          resolve(false);
          return;
        }
        
        if (result[oldKey]) {
          const data = result[oldKey];
          logDebug(`Found position under old key: ${JSON.stringify(data)}`, 'info');
          
          // Store under the new key
          chrome.storage.local.set({
            [videoKey]: data
          }, function() {
            if (chrome.runtime.lastError) {
              logDebug(`Error migrating position: ${chrome.runtime.lastError.message}`, 'error');
              resolve(false);
            } else {
              logDebug(`Successfully migrated position to new key format`, 'info');
              
              // Remove the old key
              chrome.storage.local.remove([oldKey], function() {
                if (chrome.runtime.lastError) {
                  logDebug(`Error removing old key: ${chrome.runtime.lastError.message}`, 'warn');
                }
                resolve(true);
              });
            }
          });
        } else {
          logDebug(`No data found under old key, nothing to migrate`, 'debug');
          resolve(false);
        }
      });
    } catch (e) {
      logDebug(`Error in migration attempt: ${e}`, 'error');
      resolve(false);
    }
  });
}

// Export functions to the window object
window.VideoPositionManager = {
  setup: initVideoPositionManager,
  savePosition: saveVideoPosition,
  loadPosition: loadVideoPosition,
  trackVideo: setupVideoPositionTracking,
  getParentPageUrl: getParentPageUrl,
  debugListPositions: debugListAllPositions,
  migratePositions: migrateOldPositions,
  setupParentMessaging: setupParentUrlMessaging
}; 