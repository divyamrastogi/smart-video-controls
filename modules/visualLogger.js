/**
 * Visual Logger Module
 * Creates a visual debug panel on the page to show logs
 * without requiring access to browser console
 */

// Create a namespace for the visual logger
window.VisualLogger = window.VisualLogger || {};

// Global variables
let logContainer = null;
let isMinimized = false;
let maxLogEntries = 1000;
let isInitialized = false;
let originalConsoleLog = console.log;
let originalConsoleError = console.error;
let originalConsoleWarn = console.warn;
let originalConsoleInfo = console.info;
let originalConsoleDebug = console.debug;
let logEjectionNotified = false;

/**
 * Check if the current script is running in an iframe
 * @returns {boolean} True if in iframe, false otherwise
 */
function isInIframe() {
  try {
    return window.self !== window.top;
  } catch (e) {
    // If we can't access top, we're in a cross-origin iframe
    return true;
  }
}

/**
 * Create the logger container on the page, but only in the parent window
 */
function createLoggerUI() {
  // If we're in an iframe, don't create the UI
  if (isInIframe()) {
    console.log("[DEBUG] Visual logger UI not created in iframe");
    return;
  }
  
  // Create container only if it doesn't exist
  if (document.getElementById('smart-video-log-container')) {
    logContainer = document.getElementById('smart-video-log-container');
    return;
  }
  
  // Create container div
  logContainer = document.createElement('div');
  logContainer.id = 'smart-video-log-container';
  logContainer.style.cssText = `
    position: fixed;
    bottom: 10px;
    right: 10px;
    width: 400px;
    max-height: 300px;
    background: rgba(0, 0, 0, 0.8);
    color: #00ff00;
    font-family: monospace;
    font-size: 12px;
    border-radius: 5px;
    z-index: 9999999;
    overflow: hidden;
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
    transition: height 0.3s ease;
  `;
  
  // Create header with controls
  const header = document.createElement('div');
  header.style.cssText = `
    padding: 5px 10px;
    background: #333;
    cursor: move;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #555;
  `;
  
  // Add title with log count indicator
  const titleWrapper = document.createElement('div');
  titleWrapper.style.cssText = `
    display: flex;
    align-items: center;
    gap: 10px;
  `;
  
  const title = document.createElement('div');
  title.textContent = 'Smart Video Debug Logs';
  title.style.cssText = `
    font-weight: bold;
    user-select: none;
  `;
  
  // Add log count indicator
  const logCount = document.createElement('div');
  logCount.id = 'log-entry-count';
  logCount.textContent = '0 entries';
  logCount.style.cssText = `
    font-size: 10px;
    color: #999;
    padding: 1px 5px;
    border-radius: 10px;
    background: #222;
  `;
  
  titleWrapper.appendChild(title);
  titleWrapper.appendChild(logCount);
  
  // Add controls
  const controls = document.createElement('div');
  
  // Clear button
  const clearBtn = document.createElement('button');
  clearBtn.textContent = 'Clear';
  clearBtn.style.cssText = `
    margin-right: 5px;
    background: #444;
    color: white;
    border: none;
    border-radius: 3px;
    padding: 2px 5px;
    cursor: pointer;
  `;
  clearBtn.onclick = clearLogs;
  
  // Copy button
  const copyBtn = document.createElement('button');
  copyBtn.textContent = 'Copy';
  copyBtn.style.cssText = `
    margin-right: 5px;
    background: #444;
    color: white;
    border: none;
    border-radius: 3px;
    padding: 2px 5px;
    cursor: pointer;
  `;
  copyBtn.onclick = copyLogs;
  
  // Trim button
  const trimBtn = document.createElement('button');
  trimBtn.textContent = 'Trim';
  trimBtn.style.cssText = `
    margin-right: 5px;
    background: #444;
    color: white;
    border: none;
    border-radius: 3px;
    padding: 2px 5px;
    cursor: pointer;
  `;
  trimBtn.onclick = trimLogs;
  trimBtn.title = "Reduce logs to 20% of capacity to save memory";
  
  // Toggle button
  const toggleBtn = document.createElement('button');
  toggleBtn.textContent = '−';
  toggleBtn.style.cssText = `
    background: #444;
    color: white;
    border: none;
    border-radius: 3px;
    padding: 2px 5px;
    cursor: pointer;
  `;
  toggleBtn.onclick = toggleMinimize;
  
  controls.appendChild(clearBtn);
  controls.appendChild(copyBtn);
  controls.appendChild(trimBtn);
  controls.appendChild(toggleBtn);
  
  header.appendChild(titleWrapper);
  header.appendChild(controls);
  
  // Create log content area
  const logContent = document.createElement('div');
  logContent.id = 'smart-video-log-content';
  logContent.style.cssText = `
    max-height: 250px;
    overflow-y: auto;
    padding: 5px 10px;
  `;
  
  // Assemble the container
  logContainer.appendChild(header);
  logContainer.appendChild(logContent);
  
  // Make draggable
  makeDraggable(logContainer, header);
  
  // Add to the DOM
  document.body.appendChild(logContainer);
  
  // Initial log entry
  addLogEntry('Visual Logger initialized', 'info');
}

/**
 * Make an element draggable by dragging its header
 */
function makeDraggable(element, handle) {
  // Store element's initial position
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  
  // Move the element with the mouse
  handle.onmousedown = dragMouseDown;
  
  function dragMouseDown(e) {
    e = e || window.event;
    e.preventDefault();
    
    // Get the mouse cursor position at startup
    pos3 = e.clientX;
    pos4 = e.clientY;
    
    // Set position to fixed if it's not already
    if (getComputedStyle(element).position !== 'fixed') {
      // Calculate current position relative to viewport
      const rect = element.getBoundingClientRect();
      element.style.top = rect.top + 'px';
      element.style.left = rect.left + 'px';
      element.style.right = 'auto';
      element.style.bottom = 'auto';
      element.style.position = 'fixed';
    }
    
    // Call functions on mouse move and mouse up
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }
  
  function elementDrag(e) {
    e = e || window.event;
    e.preventDefault();
    
    // Calculate the new cursor position
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    
    // Get current position
    const currentTop = parseInt(element.style.top) || 0;
    const currentLeft = parseInt(element.style.left) || 0;
    
    // Calculate new position
    let newTop = currentTop - pos2;
    let newLeft = currentLeft - pos1;
    
    // Simple boundary checking
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const elementRect = element.getBoundingClientRect();
    
    // Keep at least 30px on screen
    newTop = Math.min(Math.max(newTop, -elementRect.height + 30), windowHeight - 30);
    newLeft = Math.min(Math.max(newLeft, -elementRect.width + 30), windowWidth - 30);
    
    // Set the element's new position
    element.style.top = newTop + 'px';
    element.style.left = newLeft + 'px';
    
    // Reset any transform
    element.style.transform = 'none';
  }
  
  function closeDragElement() {
    // Stop movement when mouse button is released
    document.onmouseup = null;
    document.onmousemove = null;
  }
}

/**
 * Toggle between minimized and normal state
 */
function toggleMinimize() {
  if (!logContainer) return;
  
  const logContent = document.getElementById('smart-video-log-content');
  const toggleBtn = logContainer.querySelector('button:last-child');
  
  if (isMinimized) {
    logContent.style.display = 'block';
    logContainer.style.maxHeight = '300px';
    toggleBtn.textContent = '−';
  } else {
    logContent.style.display = 'none';
    logContainer.style.maxHeight = '30px';
    toggleBtn.textContent = '+';
  }
  
  isMinimized = !isMinimized;
}

/**
 * Clear all logs
 */
function clearLogs() {
  const logContent = document.getElementById('smart-video-log-content');
  if (logContent) {
    logContent.innerHTML = '';
    addLogEntry('Logs cleared', 'info');
    
    // Reset log ejection notification flag
    logEjectionNotified = false;
    
    // Update log count
    updateLogCount(1); // Just the "Logs cleared" entry
  }
}

/**
 * Add a log entry to the visual display
 */
function addLogEntry(message, type = 'debug') {
  // If we're in an iframe, send the log to the parent window
  if (isInIframe()) {
    try {
      window.parent.postMessage({
        type: 'visual-logger',
        message: message,
        logType: type,
        source: 'iframe',
        url: window.location.href
      }, '*');
    } catch (e) {
      // If we can't communicate with the parent, fallback to console
      console.error('[VISUAL-LOGGER] Failed to send log to parent:', e);
    }
    return;
  }
  
  if (!logContainer) return;
  
  const logContent = document.getElementById('smart-video-log-content');
  if (!logContent) return;
  
  // Create log entry
  const entry = document.createElement('div');
  
  // Format timestamp
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');
  const ms = now.getMilliseconds().toString().padStart(3, '0');
  const timestamp = `${hours}:${minutes}:${seconds}.${ms}`;
  
  // Set style based on type
  let color = '#00ff00'; // Default green for debug
  
  switch(type) {
    case 'error':
      color = '#ff5555';
      break;
    case 'warn':
      color = '#ffff00';
      break;
    case 'info':
      color = '#5555ff';
      break;
  }
  
  entry.style.cssText = `
    margin: 2px 0;
    border-bottom: 1px dotted #333;
    word-wrap: break-word;
    color: ${color};
  `;
  
  entry.innerHTML = `<span style="color: #999;">[${timestamp}]</span> ${message}`;
  
  // Add to log container
  logContent.appendChild(entry);
  
  // Auto-scroll to bottom
  logContent.scrollTop = logContent.scrollHeight;
  
  // Update log count indicator
  updateLogCount(logContent.children.length);
  
  // Efficient log entry limiting
  const currentCount = logContent.children.length;
  
  if (currentCount > maxLogEntries) {
    // Implement batch removal for better performance - remove 10% when limit is reached
    const entriesToRemove = Math.ceil(maxLogEntries * 0.1); // Remove oldest 10% 
    
    // Remove the oldest entries in a batch
    for (let i = 0; i < entriesToRemove; i++) {
      if (logContent.firstChild) {
        logContent.removeChild(logContent.firstChild);
      }
    }
    
    // Update log count after removal
    updateLogCount(logContent.children.length);
    
    // Show notification about log ejection (only once)
    if (!logEjectionNotified) {
      const notificationEntry = document.createElement('div');
      notificationEntry.style.cssText = `
        margin: 2px 0;
        border-bottom: 1px dotted #333;
        word-wrap: break-word;
        color: #ff9900;
        font-style: italic;
      `;
      notificationEntry.innerHTML = `<span style="color: #999;">[${timestamp}]</span> Removed ${entriesToRemove} oldest log entries to prevent memory issues`;
      logContent.appendChild(notificationEntry);
      logEjectionNotified = true;
      
      // Reset notification flag after some time
      setTimeout(() => { logEjectionNotified = false; }, 60000); // Reset after 1 minute
      
      // Update counter again after adding notification
      updateLogCount(logContent.children.length);
    }
  }
}

/**
 * Update the log entry count display
 * @param {number} count - Current number of log entries
 */
function updateLogCount(count) {
  const countElement = document.getElementById('log-entry-count');
  if (countElement) {
    // Format the count and add a warning color if getting close to limit
    countElement.textContent = `${count} / ${maxLogEntries} entries`;
    
    // Change color based on how full the log is
    if (count > maxLogEntries * 0.9) {
      // Over 90% - red
      countElement.style.color = '#ff5555';
    } else if (count > maxLogEntries * 0.7) {
      // Over 70% - yellow
      countElement.style.color = '#ffff00';
    } else {
      // Normal - gray
      countElement.style.color = '#999';
    }
  }
}

/**
 * Listen for log messages from iframes
 */
function setupIframeLogListener() {
  // Only setup in parent window
  if (isInIframe()) return;
  
  window.addEventListener('message', function(event) {
    // Verify this is a visual logger message
    if (event.data && event.data.type === 'visual-logger') {
      const prefix = event.data.source === 'iframe' ? 
        `[IFRAME ${new URL(event.data.url).hostname}] ` : '';
      
      addLogEntry(prefix + event.data.message, event.data.logType);
    }
  });
}

/**
 * Override console methods to intercept and display logs
 */
function overrideConsoleMethods() {
  // Log method
  console.log = function() {
    // Call original console method
    originalConsoleLog.apply(console, arguments);
    
    // Convert arguments to string
    const args = Array.from(arguments);
    const message = args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch(e) {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');
    
    // Only log preloading related messages to avoid noise
    if (message.includes('[DEBUG]') && 
        (message.includes('preload') || 
         message.includes('buffer') || 
         message.includes('video'))) {
      addLogEntry(message, 'debug');
    }
  };
  
  // Error method
  console.error = function() {
    originalConsoleError.apply(console, arguments);
    const args = Array.from(arguments);
    const message = args.join(' ');
    addLogEntry(message, 'error');
  };
  
  // Warning method
  console.warn = function() {
    originalConsoleWarn.apply(console, arguments);
    const args = Array.from(arguments);
    const message = args.join(' ');
    if (message.includes('[DEBUG]') || message.includes('video')) {
      addLogEntry(message, 'warn');
    }
  };
  
  // Info method
  console.info = function() {
    originalConsoleInfo.apply(console, arguments);
    const args = Array.from(arguments);
    const message = args.join(' ');
    if (message.includes('[DEBUG]') || message.includes('video')) {
      addLogEntry(message, 'info');
    }
  };
}

/**
 * Show the visual logger
 */
function showLogger() {
  if (isInIframe()) return; // Don't show in iframe
  
  if (logContainer) {
    logContainer.style.display = 'block';
    addLogEntry('Visual logger shown', 'info');
  } else {
    // If container doesn't exist yet, create it and then show it
    createLoggerUI();
  }
}

/**
 * Hide the visual logger but keep collecting logs
 */
function hideLogger() {
  if (isInIframe()) return; // Already not showing in iframe
  
  if (logContainer) {
    logContainer.style.display = 'none';
    // Still log the action, even though it won't be visible
    console.log('[DEBUG] Visual logger hidden (logs still being collected)');
  }
}

/**
 * Check if logs are consuming too much memory and trim if needed
 * This runs periodically to prevent memory leaks
 */
function checkMemoryUsage() {
  const logContent = document.getElementById('smart-video-log-content');
  if (!logContent) return;
  
  const currentCount = logContent.children.length;
  
  // If we're approaching the limit (90%), consider trimming
  if (currentCount > maxLogEntries * 0.9) {
    // Check approximate memory usage of logs
    const avgEntrySize = estimateLogEntrySize(logContent);
    const totalSize = avgEntrySize * currentCount;
    
    // If total size is over 5MB, trim logs
    const MEMORY_THRESHOLD = 5 * 1024 * 1024; // 5MB
    if (totalSize > MEMORY_THRESHOLD) {
      trimLogs();
    }
  }
}

/**
 * Estimate the size of log entries in bytes
 * @param {HTMLElement} logContent - The log content element
 * @returns {number} - Estimated average size per entry in bytes
 */
function estimateLogEntrySize(logContent) {
  // Sample up to 10 entries to get an average size
  const sampleSize = Math.min(10, logContent.children.length);
  let totalLength = 0;
  
  if (sampleSize === 0) return 0;
  
  for (let i = 0; i < sampleSize; i++) {
    // Get a random entry to sample
    const index = Math.floor(Math.random() * logContent.children.length);
    const entry = logContent.children[index];
    // Estimate size based on innerHTML length (2 bytes per character for UTF-16)
    totalLength += entry.innerHTML.length * 2;
  }
  
  // Return average size per entry in bytes
  return totalLength / sampleSize;
}

/**
 * Initialize the visual logger
 */
function initVisualLogger() {
  if (isInitialized) return;
  
  // Store original console methods
  originalConsoleLog = console.log;
  originalConsoleError = console.error;
  originalConsoleWarn = console.warn;
  originalConsoleInfo = console.info;
  originalConsoleDebug = console.debug;
  
  // Create UI (only in parent window)
  createLoggerUI();
  
  // Set up messaging for iframe logs
  setupIframeLogListener();
  
  // Override console methods in both parent and iframe
  overrideConsoleMethods();
  
  // Add keyboard shortcut to toggle visibility (only in parent window)
  if (!isInIframe()) {
    document.addEventListener('keydown', function(event) {
      // Alt+L to toggle logger
      if (event.altKey && event.key === 'l') {
        const container = document.getElementById('smart-video-log-container');
        if (container) {
          container.style.display = container.style.display === 'none' ? 'block' : 'none';
          
          // Save visibility state to storage
          if (chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ 
              visualLoggerVisible: container.style.display !== 'none' 
            });
          }
        }
      }
    });
    
    // Check initial visibility state from storage
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['visualLoggerVisible'], function(result) {
        const shouldBeVisible = result.visualLoggerVisible === true;
        if (logContainer) {
          logContainer.style.display = shouldBeVisible ? 'block' : 'none';
        }
      });
    }
    
    // Set up periodic memory check (every 30 seconds)
    setInterval(checkMemoryUsage, 30000);
  }
  
  isInitialized = true;
  
  if (isInIframe()) {
    console.log('[DEBUG] Visual logger initialized in iframe mode - sending logs to parent');
  } else {
    console.log('[DEBUG] Visual logger initialized in parent mode. Press Alt+L to toggle visibility');
  }
}

/**
 * Copy all logs to clipboard
 */
function copyLogs() {
  const logContent = document.getElementById('smart-video-log-content');
  if (!logContent) return;
  
  // Gather all log entries
  const logEntries = Array.from(logContent.children)
    .map(entry => entry.textContent.trim())
    .join('\n');
  
  // Create a textarea element to perform the copy
  const textarea = document.createElement('textarea');
  textarea.value = logEntries;
  textarea.style.position = 'fixed';  // Prevent scrolling to bottom
  document.body.appendChild(textarea);
  textarea.select();
  
  try {
    // Execute copy command
    const successful = document.execCommand('copy');
    if (successful) {
      addLogEntry('Logs copied to clipboard', 'info');
    } else {
      addLogEntry('Failed to copy logs', 'error');
    }
  } catch (err) {
    addLogEntry('Error copying logs: ' + err, 'error');
    
    // Alternative method for modern browsers
    try {
      navigator.clipboard.writeText(logEntries).then(
        function() {
          addLogEntry('Logs copied to clipboard (using clipboard API)', 'info');
        }, 
        function(err) {
          addLogEntry('Failed to copy logs via clipboard API: ' + err, 'error');
        }
      );
    } catch (clipboardErr) {
      addLogEntry('Clipboard API not available: ' + clipboardErr, 'error');
    }
  }
  
  // Remove the temporary textarea
  document.body.removeChild(textarea);
}

/**
 * Trim logs to a safer size when memory concerns arise
 * Reduces the number of logs to 20% of maximum capacity
 */
function trimLogs() {
  const logContent = document.getElementById('smart-video-log-content');
  if (!logContent) return;
  
  const currentCount = logContent.children.length;
  const targetCount = Math.floor(maxLogEntries * 0.2); // Reduce to 20% capacity
  
  if (currentCount <= targetCount) return; // Already below target
  
  const entriesToRemove = currentCount - targetCount;
  
  // Add a notification at the top about trimming
  const now = new Date();
  const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
  
  // Remove the oldest entries in a batch
  for (let i = 0; i < entriesToRemove; i++) {
    if (logContent.firstChild) {
      logContent.removeChild(logContent.firstChild);
    }
  }
  
  // Add notification about major trim
  const notificationEntry = document.createElement('div');
  notificationEntry.style.cssText = `
    margin: 2px 0;
    border-bottom: 1px dotted #333;
    word-wrap: break-word;
    color: #ff5555;
    font-weight: bold;
    background-color: rgba(255, 0, 0, 0.1);
    padding: 3px;
  `;
  notificationEntry.innerHTML = `<span style="color: #999;">[${timestamp}]</span> MEMORY OPTIMIZATION: Removed ${entriesToRemove} log entries to free up memory`;
  logContent.appendChild(notificationEntry);
  
  // Update log count after massive trim
  updateLogCount(logContent.children.length);
  
  return entriesToRemove;
}

// Expose methods to global namespace
window.VisualLogger = {
  init: initVisualLogger,
  log: addLogEntry,
  clear: clearLogs,
  copy: copyLogs,
  toggle: toggleMinimize,
  isInIframe: isInIframe,
  show: showLogger,
  hide: hideLogger,
  trim: trimLogs
}; 