let isPickingMode = false;
let highlightedElement = null;
let overlay = null;

// Apply blocked elements on page load
applyBlockedElements();

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "togglePickMode") {
    togglePickMode();
    sendResponse({ success: true });
  } else if (request.action === "blockElement") {
    blockElementBySelector(request.selector);
    sendResponse({ success: true });
  } else if (request.action === "getBlockedCount") {
    getBlockedCount().then(count => {
      sendResponse({ count: count });
    });
    return true; // Keep message channel open for async response
  }
});

function togglePickMode() {
  isPickingMode = !isPickingMode;
  
  if (isPickingMode) {
    document.addEventListener('mouseover', highlightElement);
    document.addEventListener('click', selectElement);
    document.body.style.cursor = 'crosshair';
    showPickModeOverlay();
  } else {
    document.removeEventListener('mouseover', highlightElement);
    document.removeEventListener('click', selectElement);
    document.body.style.cursor = '';
    removeHighlight();
    hidePickModeOverlay();
  }
}

function highlightElement(e) {
  if (!isPickingMode) return;
  
  removeHighlight();
  highlightedElement = e.target;
  
  const rect = e.target.getBoundingClientRect();
  const highlight = document.createElement('div');
  highlight.id = 'g-element-highlight';
  highlight.style.cssText = `
    position: fixed;
    top: ${rect.top}px;
    left: ${rect.left}px;
    width: ${rect.width}px;
    height: ${rect.height}px;
    border: 2px solid #00ff88;
    background: rgba(0, 255, 136, 0.1);
    pointer-events: none;
    z-index: 999999;
    box-shadow: 0 0 10px rgba(0, 255, 136, 0.5);
  `;
  document.body.appendChild(highlight);
}

function removeHighlight() {
  const existing = document.getElementById('g-element-highlight');
  if (existing) existing.remove();
}

function selectElement(e) {
  if (!isPickingMode) return;
  
  e.preventDefault();
  e.stopPropagation();
  
  const element = e.target;
  const selector = generateSelector(element);
  
  // Block immediately
  blockElementBySelector(selector);
  togglePickMode();
}

function generateSelector(element) {
  // Find the most specific parent that makes sense to block
  let targetElement = element;
  
  // Traverse up to find a meaningful container
  // Skip very generic containers but find semantic ones
  while (targetElement && targetElement !== document.body) {
    // If element has a meaningful ID, use it
    if (targetElement.id && !isGenericId(targetElement.id)) {
      return `#${CSS.escape(targetElement.id)}`;
    }
    
    // ENHANCED: Try to generate compound class selector
    if (targetElement.className && typeof targetElement.className === 'string') {
      const compoundSelector = generateCompoundClassSelector(targetElement);
      if (compoundSelector) {
        return compoundSelector;
      }
    }
    
    // Check if this looks like a component container
    if (isLikelyComponentContainer(targetElement)) {
      break;
    }
    
    targetElement = targetElement.parentElement;
  }
  
  // Fallback: generate selector for the final target element
  return generateFallbackSelector(targetElement);
}

function generateCompoundClassSelector(element) {
  const classes = element.className.split(' ')
    .map(c => c.trim())
    .filter(c => c && !isGenericClass(c));
  
  if (classes.length === 0) return null;
  
  // Get element tag for specificity
  const tagName = element.tagName.toLowerCase();
  
  // Strategy 1: Use tag + ALL meaningful classes for maximum specificity
  if (classes.length >= 1) {
    const classSelector = classes.map(c => CSS.escape(c)).join('.');
    const compoundSelector = `${tagName}.${classSelector}`;
    
    // Test if this compound selector is valid
    try {
      const matchingElements = document.querySelectorAll(compoundSelector);
      console.log(`G Element Blocker: Element-specific selector "${compoundSelector}" matches ${matchingElements.length} elements`);
      return compoundSelector;
    } catch (error) {
      console.warn('Invalid compound selector:', compoundSelector);
    }
  }
  
  return null;
}

function isGenericId(id) {
  const genericPatterns = ['content', 'main', 'wrapper', 'container', 'page'];
  return genericPatterns.some(pattern => id.toLowerCase().includes(pattern));
}

function isGenericClass(className) {
  const genericPatterns = [
    // Layout classes
    'content', 'main', 'wrapper', 'container', 'row', 'col', 'grid',
    'flex', 'block', 'inline', 'section', 'div', 'span',
    
    // Size/position classes
    'small', 'medium', 'large', 'big', 'tiny', 'full', 'half', 'quarter',
    'left', 'right', 'center', 'top', 'bottom', 'middle',
    'w-', 'h-', 'p-', 'm-', 'pt-', 'pb-', 'pl-', 'pr-',
    
    // State classes
    'active', 'inactive', 'visible', 'hidden', 'show', 'hide',
    'open', 'closed', 'expanded', 'collapsed',
    
    // Generic utility classes
    'clearfix', 'clear', 'float', 'relative', 'absolute', 'fixed',
    'text-', 'bg-', 'border-', 'rounded', 'shadow'
  ];
  
  const lowerClass = className.toLowerCase();
  return genericPatterns.some(pattern => {
    if (pattern.endsWith('-')) {
      return lowerClass.startsWith(pattern);
    }
    return lowerClass.includes(pattern);
  });
}

function isLikelyComponentContainer(element) {
  // Check for common component indicators
  const hasDataAttribs = element.hasAttribute('data-testid') || 
                         element.hasAttribute('data-component') ||
                         element.hasAttribute('data-module');
  
  const hasRoleAttrib = element.hasAttribute('role');
  
  const hasSemanticTag = ['article', 'section', 'aside', 'nav', 'header', 'footer']
    .includes(element.tagName.toLowerCase());
  
  return hasDataAttribs || hasRoleAttrib || hasSemanticTag;
}

function generateFallbackSelector(element) {
  // If element has ID, use it
  if (element.id) {
    return `#${CSS.escape(element.id)}`;
  }
  
  // ENHANCED: Try element-specific compound class selector for fallback too
  if (element.className && typeof element.className === 'string') {
    const compoundSelector = generateCompoundClassSelector(element);
    if (compoundSelector) {
      return compoundSelector;
    }
  }
  
  // Use tag with attributes as final fallback
  let selector = element.tagName.toLowerCase();
  
  // Add important attributes
  ['data-testid', 'data-id', 'data-component', 'role'].forEach(attr => {
    const value = element.getAttribute(attr);
    if (value) {
      selector += `[${attr}="${CSS.escape(value)}"]`;
      return selector; // Return early with first meaningful attribute
    }
  });
  
  return selector;
}

function blockElementBySelector(selector) {
  try {
    const elements = document.querySelectorAll(selector);
    let blockedCount = 0;
    
    elements.forEach(el => {
      if (el && el.style.display !== 'none') {
        el.style.setProperty('display', 'none', 'important');
        blockedCount++;
      }
    });
    
    if (blockedCount > 0) {
      // Save to storage
      saveBlockedElement(selector);
      console.log(`G Element Blocker: Blocked ${blockedCount} elements with selector: ${selector}`);
      
      // Update badge
      updateBadge();
    }
  } catch (error) {
    console.error('G Element Blocker: Invalid selector:', selector, error);
  }
}

function saveBlockedElement(selector) {
  chrome.runtime.sendMessage({ action: "getHostname" }, (response) => {
    if (response && response.hostname) {
      chrome.storage.local.get([response.hostname], (result) => {
        const siteData = result[response.hostname] || [];
        if (!siteData.includes(selector)) {
          siteData.push(selector);
          chrome.storage.local.set({ [response.hostname]: siteData }, () => {
            updateBadge();
          });
        }
      });
    }
  });
}

function applyBlockedElements() {
  chrome.runtime.sendMessage({ action: "getHostname" }, (response) => {
    if (response && response.hostname) {
      chrome.storage.local.get([response.hostname], (result) => {
        const siteData = result[response.hostname] || [];
        let totalBlocked = 0;
        
        siteData.forEach(selector => {
          try {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
              if (el && el.style.display !== 'none') {
                el.style.setProperty('display', 'none', 'important');
                totalBlocked++;
              }
            });
          } catch (error) {
            console.error('G Element Blocker: Invalid selector:', selector, error);
          }
        });
        
        if (totalBlocked > 0) {
          console.log(`G Element Blocker: Applied ${totalBlocked} blocks on ${response.hostname}`);
        }
        
        updateBadge();
      });
    }
  });
}

async function getBlockedCount() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "getHostname" }, (response) => {
      if (response && response.hostname) {
        chrome.storage.local.get([response.hostname], (result) => {
          const siteData = result[response.hostname] || [];
          resolve(siteData.length);
        });
      } else {
        resolve(0);
      }
    });
  });
}

function updateBadge() {
  getBlockedCount().then(count => {
    chrome.runtime.sendMessage({
      action: "updateBadge",
      count: count
    });
  });
}

function showPickModeOverlay() {
  overlay = document.createElement('div');
  overlay.innerHTML = `
    <div style="
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #1a1a2e, #16213e);
      color: white;
      padding: 15px 20px;
      border-radius: 10px;
      z-index: 1000000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.1);
    ">
      🎯 Click any element to block it<br>
      <small style="opacity: 0.8;">Press ESC to cancel</small>
    </div>
  `;
  document.body.appendChild(overlay);
  
  // ESC to cancel
  document.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape' && isPickingMode) {
      togglePickMode();
      document.removeEventListener('keydown', escHandler);
    }
  });
}

function hidePickModeOverlay() {
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
}

// Reapply blocks when page content changes (for SPAs)
const observer = new MutationObserver((mutations) => {
  let shouldReapply = false;
  mutations.forEach((mutation) => {
    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
      shouldReapply = true;
    }
  });
  
  if (shouldReapply) {
    // Debounce reapplication
    clearTimeout(observer.reapplyTimeout);
    observer.reapplyTimeout = setTimeout(() => {
      applyBlockedElements();
    }, 1000);
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

// Update badge when page loads
document.addEventListener('DOMContentLoaded', updateBadge);
window.addEventListener('load', updateBadge);