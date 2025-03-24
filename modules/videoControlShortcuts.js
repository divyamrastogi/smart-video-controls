/**
 * Keyboard shortcut handler that routes actions to the appropriate handler
 * based on whether we're in an iframe or on a direct page
 */

// Global flag to ensure we only initialize once
let parentShortcutsInitialized = false;

/**
 * Sets up keyboard shortcuts for video control.
 * Routes actions to the appropriate handler based on context.
 */
function setupVideoControlShortcuts() {
  // IMPORTANT: This handler should ONLY run for parent page, NEVER for iframes
  // Iframe keyboard events are handled exclusively by iframeVideoHandler.js
  if (inIframe()) {
    console.log("[DEBUG] Refusing to setup videoControlShortcuts in iframe context");
    return; // Exit early if we're in an iframe
  }
  
  // Only initialize once
  if (parentShortcutsInitialized) {
    console.log("[DEBUG] Parent shortcuts already initialized, skipping");
    return;
  }
  
  parentShortcutsInitialized = true;
  
  console.log("[DEBUG] Setting up video control shortcuts for parent page");
  
  document.addEventListener("keydown", function (e) {
    // Only handle Alt + key combinations
    if (!e.altKey) return;
    
    // Triple-check we're not in an iframe (paranoia check)
    if (inIframe()) {
      console.log("[DEBUG] Refusing to handle keyboard event in iframe");
      return;
    }
    
    // First check if we have direct videos on the page
    const hasDirectVideo = document.querySelector("video") !== null;
    
    if (hasDirectVideo) {
      // Handle direct video controls
      if (e.code === "ArrowRight") {
        window.DirectVideoHandler.control("skipAhead", 30);
        console.log("[DEBUG] Parent page video skipped ahead 30s");
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      } else if (e.code === "ArrowLeft") {
        window.DirectVideoHandler.control("rewind", 30);
        console.log("[DEBUG] Parent page video rewound 30s");
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      } else if (e.code === "ArrowUp") {
        const video = document.querySelector("video");
        if (video) {
          video.volume = Math.min(1, video.volume + 0.1);
        }
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      } else if (e.code === "ArrowDown") {
        const video = document.querySelector("video");
        if (video) {
          video.volume = Math.max(0, video.volume - 0.1);
        }
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      } else if (e.code === "KeyP") {
        window.DirectVideoHandler.control("togglePlayPause");
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      } else if (e.code === "KeyN") {
        navigateEpisode("next");
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      } else if (e.code === "KeyB") { // Changed from KeyP to avoid conflict
        navigateEpisode("previous");
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    } else {
      // Check for videos in iframes
      const iframes = findVideoIframes();
      
      if (iframes.length > 0) {
        // Send commands to iframes
        if (e.code === "ArrowRight") {
          window.ParentPageHandler.controlIframeVideos("forward", { seconds: 30 });
          console.log("[DEBUG] Parent page sending forward command to iframes");
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
        } else if (e.code === "ArrowLeft") {
          window.ParentPageHandler.controlIframeVideos("rewind", { seconds: 30 });
          console.log("[DEBUG] Parent page sending rewind command to iframes");
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
        } else if (e.code === "KeyP") {
          window.ParentPageHandler.controlIframeVideos("togglePlayPause");
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
        } else if (e.code === "KeyN") {
          navigateEpisode("next");
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
        } else if (e.code === "KeyB") { // Changed from KeyP to avoid conflict
          navigateEpisode("previous");
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
        }
      }
    }
  }, true); // Using capture phase to get priority
}

// Export function for use in other modules
window.VideoControlShortcuts = {
  setup: setupVideoControlShortcuts
}; 