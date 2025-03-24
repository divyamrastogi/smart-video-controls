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
let maxLogEntries = 100;
let isInitialized = false;
let originalConsoleLog = console.log;
let originalConsoleError = console.error;
let originalConsoleWarn = console.warn;
let originalConsoleInfo = console.info;
let originalConsoleDebug = console.debug;

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
  
  // Add title
  const title = document.createElement('div');
  title.textContent = 'Smart Video Debug Logs';
  title.style.cssText = `
    font-weight: bold;
    user-select: none;
  `;
  
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
  controls.appendChild(toggleBtn);
  
  header.appendChild(title);
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
  
  // Limit log entries
  while (logContent.children.length > maxLogEntries) {
    logContent.removeChild(logContent.firstChild);
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
        }
      }
    });
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

// Expose methods to global namespace
window.VisualLogger = {
  init: initVisualLogger,
  log: addLogEntry,
  clear: clearLogs,
  copy: copyLogs,
  toggle: toggleMinimize,
  isInIframe: isInIframe
}; 