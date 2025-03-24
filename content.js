// content.js

/**
 * Log a debug message
 * @param {string} message - The message to log
 * @param {string} level - Log level: 'debug', 'info', 'warn', 'error'
 */
function logDebug(message, level = 'debug') {
  // Get timestamp
  const now = new Date();
  const timestamp = now.toTimeString().split(' ')[0] + '.' + now.getMilliseconds().toString().padStart(3, '0');
  
  // Format message with timestamp and content script identifier
  const formattedMessage = `[${timestamp}] [content.js] ${message}`;
  
  // Log to visual logger if available
  if (window.VisualLogger) {
    try {
      window.VisualLogger.log(formattedMessage, level);
    } catch (e) {
      // Fallback to console if visual logger fails
      console[level](formattedMessage);
    }
  } else {
    // Fallback to console
    console[level](formattedMessage);
  }
}

function handleRuntimeMessages(request, sender, sendResponse) {
  logDebug(`Received message: ${request.action}`, 'info');
  
  // Handle visual logger actions
  if (request.action === 'toggleVisualLogger') {
    // Always show the visual logger regardless of request.visible value
    try {
      if (window.VisualLogger) {
        window.VisualLogger.show();
        sendResponse({ success: true, status: 'Visual logger is now visible' });
      } else {
        sendResponse({ success: false, error: 'Visual logger not available' });
      }
    } catch (error) {
      sendResponse({ success: false, error: `Error toggling visual logger: ${error.message}` });
    }
    return true;
  }
  
  if (request.action === 'clearVisualLogs') {
    try {
      if (window.VisualLogger) {
        window.VisualLogger.clear();
        sendResponse({ success: true, status: 'Visual logs cleared' });
      } else {
        sendResponse({ success: false, error: 'Visual logger not available' });
      }
    } catch (error) {
      sendResponse({ success: false, error: `Error clearing logs: ${error.message}` });
    }
    return true;
  }
  
  // Handle debugging actions
  if (request.action === 'checkVideoStatus') {
    logDebug('Checking video status', 'info');
    
    let videos = document.querySelectorAll('video');
    let iframes = document.querySelectorAll('iframe');
    let response = {
      success: true,
      directVideos: videos.length,
      iframes: iframes.length,
      details: []
    };
    
    // Get details of direct videos
    videos.forEach((video, index) => {
      let key = '';
      try {
        if (window.VideoPositionManager) {
          key = window.VideoPositionManager.getKey(video);
        }
      } catch (e) {
        logDebug(`Error getting video key: ${e}`, 'error');
      }
      
      response.details.push({
        type: 'direct',
        index: index,
        duration: video.duration || 0,
        currentTime: video.currentTime || 0,
        paused: video.paused,
        ended: video.ended,
        muted: video.muted,
        volume: video.volume,
        playbackRate: video.playbackRate,
        positionKey: key
      });
    });
    
    // Log iframe sources
    iframes.forEach((iframe, index) => {
      response.details.push({
        type: 'iframe',
        index: index,
        src: iframe.src
      });
    });
    
    logDebug(`Video status check complete: ${JSON.stringify(response)}`, 'info');
    sendResponse(response);
    return true;
  }
  
  // Handle video control actions
  if (request.action === 'playPause' || 
      request.action === 'skipAhead' || 
      request.action === 'rewind' || 
      request.action === 'speedUp' || 
      request.action === 'speedDown') {
    
    logDebug(`Processing video control action: ${request.action}`, 'info');
    
    // First try to control direct videos
    let directVideosControlled = false;
    
    try {
      const videos = document.querySelectorAll('video');
      if (videos && videos.length > 0) {
        directVideosControlled = true;
        
        videos.forEach((video, index) => {
          logDebug(`Controlling direct video #${index} with action: ${request.action}`, 'info');
          
          switch (request.action) {
            case 'playPause':
              if (video.paused) {
                video.play();
                logDebug(`Video #${index} played`, 'info');
              } else {
                video.pause();
                // Save position when pausing
                if (window.VideoPositionManager) {
                  window.VideoPositionManager.save(video);
                }
                logDebug(`Video #${index} paused`, 'info');
              }
              break;
              
            case 'skipAhead':
              video.currentTime += 30;
              logDebug(`Video #${index} skipped ahead to ${video.currentTime}`, 'info');
              break;
              
            case 'rewind':
              video.currentTime -= 10;
              logDebug(`Video #${index} rewound to ${video.currentTime}`, 'info');
              break;
              
            case 'speedUp':
              video.playbackRate = Math.min(3, video.playbackRate + 0.25);
              logDebug(`Video #${index} speed increased to ${video.playbackRate}x`, 'info');
              break;
              
            case 'speedDown':
              video.playbackRate = Math.max(0.25, video.playbackRate - 0.25);
              logDebug(`Video #${index} speed decreased to ${video.playbackRate}x`, 'info');
              break;
          }
        });
      }
    } catch (error) {
      logDebug(`Error controlling direct videos: ${error}`, 'error');
    }
    
    // Then try to send messages to videos in iframes
    try {
      const iframes = document.querySelectorAll('iframe');
      if (iframes && iframes.length > 0) {
        logDebug(`Sending ${request.action} to ${iframes.length} iframes`, 'info');
        
        iframes.forEach((iframe, index) => {
          try {
            iframe.contentWindow.postMessage({
              type: 'video-control',
              action: request.action
            }, '*');
            logDebug(`Sent ${request.action} to iframe #${index}`, 'debug');
          } catch (error) {
            logDebug(`Error sending message to iframe #${index}: ${error}`, 'error');
          }
        });
      }
    } catch (error) {
      logDebug(`Error sending messages to iframes: ${error}`, 'error');
    }
    
    sendResponse({ 
      success: true, 
      directVideosControlled: directVideosControlled
    });
    return true;
  }
}

function setupVideoListeners() {
  // Log when we start setting up listeners
  logDebug('Setting up video listeners in content script', 'info');
  
  // Find any videos on the page
  const videos = document.querySelectorAll('video');
  
  if (!videos || videos.length === 0) {
    logDebug('No videos found on page', 'info');
    return;
  }
  
  logDebug(`Found ${videos.length} videos on page`, 'info');
  
  // Check if we have VideoPositionManager available
  let videoPositionManager = null;
  try {
    if (typeof VideoPositionManager !== 'undefined') {
      videoPositionManager = VideoPositionManager;
      logDebug('VideoPositionManager detected, will use for position tracking', 'info');
    } else {
      logDebug('VideoPositionManager not available, will use fallback method', 'warn');
    }
  } catch (error) {
    logDebug(`Error checking for VideoPositionManager: ${error}`, 'error');
  }
  
  // Set up listeners for each video
  videos.forEach((video, index) => {
    logDebug(`Setting up listeners for video #${index}`, 'debug');
    
    // Track video position if available
    if (videoPositionManager) {
      try {
        // Set up position tracking
        videoPositionManager.setup(video);
        
        // Generate and log the key being used
        const key = videoPositionManager.getKey(video);
        logDebug(`Video position key: ${key}`, 'info');
        
        // Try to load saved position
        videoPositionManager.load(video)
          .then(loaded => {
            if (loaded) {
              logDebug(`Loaded saved position for video #${index}`, 'info');
            } else {
              logDebug(`No saved position found for video #${index}`, 'debug');
            }
          })
          .catch(err => {
            logDebug(`Error loading video position: ${err}`, 'error');
          });
      } catch (error) {
        logDebug(`Error setting up position tracking: ${error}`, 'error');
        
        // Fall back to using URL-based storage if position manager fails
        setupFallbackPositionTracking(video, index);
      }
    } else {
      // Use fallback position tracking if no manager available
      setupFallbackPositionTracking(video, index);
    }
    
    // Set up standard video event listeners
    setupVideoEventListeners(video, index);
  });
}

// Fallback method to track video position using local storage
function setupFallbackPositionTracking(video, index) {
  logDebug(`Using fallback position tracking for video #${index}`, 'info');
  
  // Generate a key using the current URL
  const storageKey = `video-position-${window.location.href}`;
  logDebug(`Fallback storage key: ${storageKey}`, 'debug');
  
  // Load saved position
  try {
    const savedPosition = localStorage.getItem(storageKey);
    if (savedPosition) {
      const position = JSON.parse(savedPosition);
      logDebug(`Found saved position: ${position.time}`, 'info');
      
      // If position is valid and we're not already playing, set it
      if (position.time > 0 && (!video.currentTime || video.currentTime < 3)) {
        video.currentTime = position.time;
        logDebug(`Restored video to position: ${position.time}`, 'info');
      }
    }
  } catch (error) {
    logDebug(`Error loading saved position: ${error}`, 'error');
  }
  
  // Save position periodically
  const saveInterval = setInterval(() => {
    if (video.currentTime > 0 && !video.paused) {
      try {
        localStorage.setItem(storageKey, JSON.stringify({
          time: video.currentTime,
          duration: video.duration,
          saved: new Date().toISOString()
        }));
        logDebug(`Saved current time (${video.currentTime}) to key: ${storageKey}`, 'debug');
      } catch (error) {
        logDebug(`Error saving position: ${error}`, 'error');
      }
    }
  }, 5000);
  
  // Clean up interval when video is removed
  video.addEventListener('remove', () => {
    clearInterval(saveInterval);
  });
}

// Set up standard video event listeners
function setupVideoEventListeners(video, index) {
  // Add standard video controls
  video.addEventListener('play', () => {
    logDebug(`Video #${index} started playing`, 'debug');
  });
  
  video.addEventListener('pause', () => {
    logDebug(`Video #${index} paused`, 'debug');
    
    // Save position on pause if VideoPositionManager is available
    if (typeof VideoPositionManager !== 'undefined') {
      try {
        VideoPositionManager.save(video);
      } catch (error) {
        logDebug(`Error saving position on pause: ${error}`, 'error');
      }
    }
  });
  
  video.addEventListener('ended', () => {
    logDebug(`Video #${index} ended`, 'debug');
  });
}

// Check if the script is running inside an iframe
if (inIframe()) {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      const addedNodes = mutation.addedNodes;

      for (const node of addedNodes) {
        if (node.tagName === "VIDEO") {
          setupVideoListeners(); // Pass the added video node directly
        }
      }
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
} else {
  handleIframeLoad();
  setupEpisodeNavigationListener();
}

setupVideoListeners();

// Initialize content script
(function() {
  logDebug('Content script initializing', 'info');
  
  // Set up message listener for extension communications
  chrome.runtime.onMessage.addListener(handleRuntimeMessages);
  
  // Set up video listeners for direct videos
  setupVideoListeners();
  
  // Handle window messages (for cross-frame communication)
  window.addEventListener('message', function(event) {
    // Validate message
    if (!event.data || event.data.type !== 'video-control') {
      return;
    }
    
    logDebug(`Received window message: ${JSON.stringify(event.data)}`, 'info');
    
    // Process video control message from iframe or parent
    if (event.data.action) {
      try {
        const videos = document.querySelectorAll('video');
        if (!videos || videos.length === 0) {
          logDebug('No videos to control from window message', 'info');
          return;
        }
        
        // Apply the action to all videos
        videos.forEach((video, index) => {
          logDebug(`Applying ${event.data.action} to video #${index} from window message`, 'debug');
          
          switch (event.data.action) {
            case 'playPause':
            case 'togglePlayPause': // Support old message format
              if (video.paused) {
                video.play();
              } else {
                video.pause();
                // Save position when pausing
                if (window.VideoPositionManager) {
                  window.VideoPositionManager.save(video);
                }
              }
              break;
              
            case 'forward':
            case 'skipAhead':
              video.currentTime += 30;
              break;
              
            case 'rewind':
              video.currentTime -= 10;
              break;
              
            case 'speedUp':
              video.playbackRate = Math.min(3, video.playbackRate + 0.25);
              break;
              
            case 'speedDown':
              video.playbackRate = Math.max(0.25, video.playbackRate - 0.25);
              break;
          }
        });
      } catch (error) {
        logDebug(`Error processing window message: ${error}`, 'error');
      }
    }
  });
  
  // Set up a mutation observer to detect dynamically added videos
  const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (mutation.addedNodes.length) {
        let newVideos = false;
        
        mutation.addedNodes.forEach(function(node) {
          // Check if node is a video
          if (node.nodeName && node.nodeName.toLowerCase() === 'video') {
            logDebug('New video element detected', 'info');
            newVideos = true;
          } 
          // Check if node contains videos
          else if (node.querySelectorAll) {
            const videos = node.querySelectorAll('video');
            if (videos.length > 0) {
              logDebug(`New node contains ${videos.length} videos`, 'info');
              newVideos = true;
            }
          }
        });
        
        if (newVideos) {
          logDebug('Setting up listeners for newly added videos', 'info');
          setupVideoListeners();
        }
      }
    });
  });
  
  // Start observing the document
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
  
  logDebug('Content script initialized successfully', 'info');
})();
