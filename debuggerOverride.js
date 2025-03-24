/**
 * Anti-debugger detection script
 * This script attempts to prevent websites from detecting developer tools
 * and redirecting users when they try to inspect elements.
 */

(function() {
  console.log("[DEBUG] Initializing anti-debugger protection...");
  
  // Store original methods we'll be overriding
  const originalDefineProperty = Object.defineProperty;
  const originalDefineProperties = Object.defineProperties;
  const originalGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
  const originalAlert = window.alert;
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  const originalConsoleInfo = console.info;
  const originalConsoleDebug = console.debug;
  const originalSetTimeout = window.setTimeout;
  
  // Safe logging functions
  const safeLog = function(message) {
    originalConsoleLog.call(console, "[ANTI-DEBUGGER] " + message);
  };
  
  const safeError = function(message) {
    originalConsoleError.call(console, "[ANTI-DEBUGGER] " + message);
  };
  
  // Override console methods to prevent them from being tampered with
  function secureConsole() {
    console.log = function() {
      return originalConsoleLog.apply(console, arguments);
    };
    console.error = function() {
      return originalConsoleError.apply(console, arguments);
    };
    console.warn = function() {
      return originalConsoleWarn.apply(console, arguments);
    };
    console.info = function() {
      return originalConsoleInfo.apply(console, arguments);
    };
    console.debug = function() {
      return originalConsoleDebug.apply(console, arguments);
    };
    
    // Make console methods non-configurable and non-writable
    Object.defineProperties(console, {
      log: { configurable: false, writable: false, value: console.log },
      error: { configurable: false, writable: false, value: console.error },
      warn: { configurable: false, writable: false, value: console.warn },
      info: { configurable: false, writable: false, value: console.info },
      debug: { configurable: false, writable: false, value: console.debug }
    });
  }
  
  // Protection from fingerprinting techniques
  function overrideFingerprinting() {
    // Override properties used for debugger detection
    const protectedProps = [
      'debugger', 'devtools', 'devtoolsOpen', 'firebug', 
      '__REACT_DEVTOOLS_GLOBAL_HOOK__', '__REACT_DEVTOOLS_APPEND_COMPONENT_STACK__',
      'webpackHotUpdate', '_REACT_DEVTOOLS_ATTACH__', 'isChrome', 'webpackJsonp'
    ];
    
    // Override defineProperty to prevent debugger detection properties from being set
    Object.defineProperty = function(obj, prop, descriptor) {
      // Check if this is a protected property
      if (protectedProps.includes(prop)) {
        safeLog("Blocked attempt to define debugger detection property: " + prop);
        return obj;
      }
      
      // Override window.devtools property
      if (obj === window && prop === 'devtools') {
        safeLog("Blocked attempt to define window.devtools");
        return obj;
      }
      
      return originalDefineProperty(obj, prop, descriptor);
    };
    
    // Override defineProperties as well for bulk property definitions
    Object.defineProperties = function(obj, props) {
      // Filter out debugger detection properties
      for (const prop in props) {
        if (protectedProps.includes(prop)) {
          safeLog("Blocked attempt to define debugger detection property: " + prop);
          delete props[prop];
        }
      }
      return originalDefineProperties(obj, props);
    };
    
    // Return false for debugger checks
    originalDefineProperty(navigator, 'webdriver', {
      get: function() { return false; }
    });
  }
  
  // Override functions that might be used for redirection
  function overrideRedirectionMethods() {
    // Store original methods
    const originalAssign = window.location.assign;
    const originalReplace = window.location.replace;
    const originalHref = Object.getOwnPropertyDescriptor(window.location, 'href');
    
    // Override location.assign
    Object.defineProperty(window.location, 'assign', {
      value: function(url) {
        if (document.hidden) {
          safeLog("Blocked location.assign redirection while devtools open: " + url);
          return;
        }
        return originalAssign.call(this, url);
      }
    });
    
    // Override location.replace
    Object.defineProperty(window.location, 'replace', {
      value: function(url) {
        if (document.hidden) {
          safeLog("Blocked location.replace redirection while devtools open: " + url);
          return;
        }
        return originalReplace.call(this, url);
      }
    });
    
    // Override location.href
    Object.defineProperty(window.location, 'href', {
      get: function() {
        return originalHref.get.call(this);
      },
      set: function(url) {
        if (document.hidden) {
          safeLog("Blocked location.href redirection while devtools open: " + url);
          return;
        }
        return originalHref.set.call(this, url);
      }
    });
    
    // Catch and block window.open
    const originalWindowOpen = window.open;
    window.open = function(url, target, features) {
      if (document.hidden) {
        safeLog("Blocked window.open redirection while devtools open: " + url);
        return null;
      }
      return originalWindowOpen.call(this, url, target, features);
    };
  }
  
  // Handle timing-based detection
  function handleTimingAttacks() {
    // Override setTimeout to catch debugging detection
    window.setTimeout = function(callback, timeout) {
      // Look for very short timeouts which might be debugger detection
      if (timeout <= 1 && typeof callback === 'function') {
        const callbackStr = callback.toString();
        if (callbackStr.includes('debugger') ||
            callbackStr.includes('console.') ||
            callbackStr.includes('devtools')) {
          safeLog("Blocked suspicious setTimeout with possible debugger detection");
          // Replace with harmless function
          callback = function() {};
        }
      }
      return originalSetTimeout.call(this, callback, timeout);
    };
    
    // Override performance methods used for timing attacks
    if (window.performance && window.performance.now) {
      const originalNow = window.performance.now;
      window.performance.now = function() {
        return originalNow.call(window.performance);
      };
    }
  }
  
  // Attempt to disable common debugger detection techniques
  try {
    // Secure console first
    secureConsole();
    
    // Override debugging detection properties
    overrideFingerprinting();
    
    // Override redirection methods
    overrideRedirectionMethods();
    
    // Handle timing-based detection
    handleTimingAttacks();
    
    // Override window.alert for debugger notifications
    window.alert = function(msg) {
      if (msg && typeof msg === 'string' && 
          (msg.includes('debugger') || msg.includes('DevTools'))) {
        safeLog("Blocked debugger alert: " + msg);
        return;
      }
      return originalAlert.apply(this, arguments);
    };
      
    // Neutralize common detection event listeners
    const noop = function() { return false; };
    window.addEventListener('devtoolschange', noop);
    
    safeLog("Anti-debugger protection initialized");
  } catch (e) {
    safeError("Error in anti-debugger script: " + e.message);
  }
})(); 