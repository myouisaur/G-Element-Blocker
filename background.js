chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "openOptions",
    title: "G Element Blocker Options",
    contexts: ["action"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "openOptions") {
    chrome.runtime.openOptionsPage();
  }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getHostname") {
    const url = new URL(sender.tab.url);
    sendResponse({ hostname: url.hostname });
  } else if (request.action === "updateBadge") {
    // Update badge with count
    const count = request.count || 0;
    const text = count > 0 ? count.toString() : '';
    const color = count > 0 ? '#00ff88' : '#666666';
    
    chrome.action.setBadgeText({
      text: text,
      tabId: sender.tab.id
    });
    
    chrome.action.setBadgeBackgroundColor({
      color: color,
      tabId: sender.tab.id
    });
  }
});

// Update badge when tab is activated or updated
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  updateBadgeForTab(activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    updateBadgeForTab(tabId);
  }
});

async function updateBadgeForTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
      // Clear badge for system pages
      chrome.action.setBadgeText({ text: '', tabId: tabId });
      return;
    }
    
    const url = new URL(tab.url);
    const hostname = url.hostname;
    
    const result = await chrome.storage.local.get([hostname]);
    const siteData = result[hostname] || [];
    const count = siteData.length;
    
    const text = count > 0 ? count.toString() : '';
    const color = count > 0 ? '#00ff88' : '#666666';
    
    chrome.action.setBadgeText({
      text: text,
      tabId: tabId
    });
    
    chrome.action.setBadgeBackgroundColor({
      color: color,
      tabId: tabId
    });
  } catch (error) {
    // Tab might be closed or system page, ignore error
    console.log('Could not update badge for tab:', tabId);
  }
}