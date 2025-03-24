/**
 * Common utility functions used across multiple modules
 */

/**
 * Checks if the current script is running inside an iframe.
 * @returns {boolean} True if inside an iframe, false otherwise.
 */
function inIframe() {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true;
  }
}

/**
 * Debounces a function to limit how often it can be called.
 * @param {Function} func - The function to debounce.
 * @param {number} wait - The time to wait in milliseconds.
 * @returns {Function} The debounced function.
 */
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

/**
 * Creates a unique ID for identification purposes
 * @returns {string} A unique ID
 */
function generateUniqueId() {
  return 'vid_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Safe way to find elements that might not be available yet
 * @param {string} selector - CSS selector to find element
 * @param {number} maxAttempts - Maximum number of attempts
 * @param {number} interval - Interval between attempts in ms
 * @returns {Promise} Promise that resolves to the element or null
 */
function waitForElement(selector, maxAttempts = 10, interval = 200) {
  return new Promise((resolve) => {
    let attempts = 0;
    
    const checkElement = () => {
      attempts++;
      const element = document.querySelector(selector);
      
      if (element) {
        resolve(element);
        return;
      }
      
      if (attempts >= maxAttempts) {
        resolve(null);
        return;
      }
      
      setTimeout(checkElement, interval);
    };
    
    checkElement();
  });
}

/**
 * Log message with consistent formatting
 * @param {string} message - Message to log
 * @param {string} type - Type of log (info, warn, error)
 */
function logMessage(message, type = 'info') {
  const prefix = '[Smart Video Controls]';
  
  switch(type) {
    case 'error':
      console.error(`${prefix} Error: ${message}`);
      break;
    case 'warn':
      console.warn(`${prefix} Warning: ${message}`);
      break;
    default:
      console.log(`${prefix} ${message}`);
  }
}

// Export utilities to global scope
window.SmartVideoUtils = {
  inIframe,
  debounce,
  generateUniqueId,
  waitForElement,
  logMessage
}; 