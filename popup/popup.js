document.addEventListener('DOMContentLoaded', function() {
  loadCurrentSite();
  loadBlockedElements();
  
  document.getElementById('pickElement').addEventListener('click', togglePickMode);
  document.getElementById('blockManual').addEventListener('click', blockManualElement);
  document.getElementById('openOptions').addEventListener('click', openOptions);
});

async function loadCurrentSite() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    const url = new URL(tab.url);
    document.getElementById('currentSite').textContent = url.hostname;
  }
}

async function togglePickMode() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    chrome.tabs.sendMessage(tab.id, { action: "togglePickMode" });
    window.close();
  }
}

async function blockManualElement() {
  let input = document.getElementById('selectorInput').value.trim();
  if (!input) return;

  let selector = input;

  // Check if input looks like HTML (starts with < and ends with >)
  if (input.startsWith('<') && input.includes('>')) {
    selector = parseHtmlToSelector(input);
    if (!selector) {
      alert('Could not parse HTML element. Please provide a valid CSS selector or HTML element.');
      return;
    }
  }

  // Validate selector
  try {
    document.querySelector(selector); // Test if selector is valid
  } catch (error) {
    alert('Invalid CSS selector. Please check your syntax.');
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    const url = new URL(tab.url);
    const hostname = url.hostname;

    // Save to storage
    const result = await chrome.storage.local.get([hostname]);
    const siteData = result[hostname] || [];
    if (!siteData.includes(selector)) {
      siteData.push(selector);
      await chrome.storage.local.set({ [hostname]: siteData });
    }

    // Block on page
    chrome.tabs.sendMessage(tab.id, { action: "blockElement", selector: selector }, (response) => {
      if (chrome.runtime.lastError) {
        console.log('Could not send message to content script:', chrome.runtime.lastError);
        // Still show in popup even if content script isn't available
      }
    });
    
    // Clear input and refresh list
    document.getElementById('selectorInput').value = '';
    
    // Show what selector was generated if HTML was parsed
    if (input !== selector) {
      // Briefly show the generated selector in the input field
      document.getElementById('selectorInput').placeholder = `Generated: ${selector}`;
      setTimeout(() => {
        document.getElementById('selectorInput').placeholder = "CSS selector or paste HTML element here";
      }, 3000);
    }
    
    loadBlockedElements();
  }
}

async function loadBlockedElements() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  const url = new URL(tab.url);
  const hostname = url.hostname;
  const result = await chrome.storage.local.get([hostname]);
  const siteData = result[hostname] || [];

  const listContainer = document.getElementById('blockedList');
  
  if (siteData.length === 0) {
    listContainer.innerHTML = '<div class="text-muted">No blocked elements</div>';
    return;
  }

  listContainer.innerHTML = siteData.map((selector, index) => `
    <div class="blocked-item fade-in">
      <code>${escapeHtml(selector)}</code>
      <button class="remove-btn" data-hostname="${escapeHtml(hostname)}" data-index="${index}">
        🗑️
      </button>
    </div>
  `).join('');

  // Add event listeners to the dynamically created remove buttons
  document.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const hostname = e.target.getAttribute('data-hostname');
      const index = parseInt(e.target.getAttribute('data-index'));
      removeElement(hostname, index);
    });
  });
}

async function removeElement(hostname, index) {
  try {
    const result = await chrome.storage.local.get([hostname]);
    const siteData = result[hostname] || [];
    
    // Remove by index instead of value to handle duplicates
    siteData.splice(index, 1);
    
    if (siteData.length === 0) {
      await chrome.storage.local.remove([hostname]);
    } else {
      await chrome.storage.local.set({ [hostname]: siteData });
    }
    
    loadBlockedElements();
    
    // Update badge
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.tabs.sendMessage(tab.id, { action: "getBlockedCount" }, (response) => {
        if (response && !chrome.runtime.lastError) {
          chrome.runtime.sendMessage({
            action: "updateBadge",
            count: response.count
          });
        }
      });
    }
  } catch (error) {
    console.error('Error removing element:', error);
  }
}

function openOptions() {
  chrome.runtime.openOptionsPage();
  window.close();
}

function parseHtmlToSelector(htmlString) {
  try {
    // Create a temporary DOM element to parse the HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlString;
    
    // Get the first child element (the outermost element from the HTML)
    const element = tempDiv.firstElementChild;
    if (!element) return null;
    
    // Generate selector for this element, prioritizing ID
    if (element.id) {
      return `#${CSS.escape(element.id)}`;
    }
    
    // If no ID, use classes
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.split(' ').filter(c => c.trim());
      if (classes.length > 0) {
        return `.${CSS.escape(classes[0])}`;
      }
    }
    
    // Fallback to tag name with attributes
    let selector = element.tagName.toLowerCase();
    
    // Add important attributes
    ['data-testid', 'data-id', 'data-component', 'role'].forEach(attr => {
      const value = element.getAttribute(attr);
      if (value) {
        selector += `[${attr}="${CSS.escape(value)}"]`;
        return selector;
      }
    });
    
    return selector;
    
  } catch (error) {
    console.error('Error parsing HTML:', error);
    return null;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}