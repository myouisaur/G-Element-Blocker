document.addEventListener('DOMContentLoaded', function() {
  loadAllSites();
  
  document.getElementById('searchInput').addEventListener('input', filterSites);
  document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('exportBtn').addEventListener('click', exportSettings);
  document.getElementById('clearAllBtn').addEventListener('click', clearAllSettings);
  document.getElementById('importFile').addEventListener('change', importSettings);
});

let allSitesData = {};

async function loadAllSites() {
  const result = await chrome.storage.local.get(null);
  allSitesData = result;
  renderSites(allSitesData);
  updateStats(); // Call updateStats AFTER loading data
}

function renderSites(sitesData) {
  const container = document.getElementById('sitesList');
  const sites = Object.keys(sitesData);
  
  if (sites.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🌐</div>
        <h3>No blocked elements yet</h3>
        <p>Start blocking elements on websites to see them here.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = sites.map(hostname => {
    const elements = sitesData[hostname];
    const count = elements.length;
    return `
      <div class="site-card fade-in" data-hostname="${hostname}">
        <div class="site-header">
          <div class="site-name">🌐 ${hostname}</div>
          <div class="site-actions">
            <div class="site-count">${count} ${count === 1 ? 'rule' : 'rules'}</div>
            <button class="btn btn-danger site-clear-btn" data-hostname="${hostname}">
              🗑️ Clear Site
            </button>
          </div>
        </div>
        <div class="elements-list">
          ${elements.map((selector, index) => `
            <div class="element-item">
              <code class="element-selector">${escapeHtml(selector)}</code>
              <div class="element-actions">
                <button class="action-btn danger element-remove-btn" 
                        data-hostname="${hostname}" 
                        data-selector="${escapeHtml(selector)}">
                  🗑️ Remove
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');

  // Add event listeners to the dynamically created buttons
  document.querySelectorAll('.site-clear-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const hostname = e.target.getAttribute('data-hostname');
      clearSite(hostname);
    });
  });

  document.querySelectorAll('.element-remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const hostname = e.target.getAttribute('data-hostname');
      const selector = e.target.getAttribute('data-selector');
      removeElement(hostname, selector);
    });
  });
}

function filterSites() {
  const searchTerm = document.getElementById('searchInput').value.toLowerCase();
  const filteredData = {};
  
  Object.keys(allSitesData).forEach(hostname => {
    if (hostname.toLowerCase().includes(searchTerm)) {
      filteredData[hostname] = allSitesData[hostname];
    }
  });
  
  renderSites(filteredData);
}

function updateStats() {
  const sites = Object.keys(allSitesData);
  const totalElements = sites.reduce((sum, site) => sum + allSitesData[site].length, 0);
  
  document.getElementById('totalSites').textContent = sites.length;
  document.getElementById('totalElements').textContent = totalElements;
}

async function removeElement(hostname, selector) {
  try {
    const result = await chrome.storage.local.get([hostname]);
    const siteData = result[hostname] || [];
    const newData = siteData.filter(s => s !== selector);
    
    if (newData.length === 0) {
      await chrome.storage.local.remove([hostname]);
      delete allSitesData[hostname];
    } else {
      await chrome.storage.local.set({ [hostname]: newData });
      allSitesData[hostname] = newData;
    }
    
    renderSites(allSitesData);
    updateStats();
    showNotification('Element removed successfully!', 'success');
  } catch (error) {
    console.error('Error removing element:', error);
    showNotification('Error removing element', 'error');
  }
}

async function clearSite(hostname) {
  if (confirm(`Clear all blocked elements for ${hostname}?`)) {
    try {
      await chrome.storage.local.remove([hostname]);
      delete allSitesData[hostname];
      renderSites(allSitesData);
      updateStats();
      showNotification(`All rules cleared for ${hostname}`, 'success');
    } catch (error) {
      console.error('Error clearing site:', error);
      showNotification('Error clearing site', 'error');
    }
  }
}

async function clearAllSettings() {
  if (confirm('Clear all blocked elements from all websites? This cannot be undone.')) {
    try {
      await chrome.storage.local.clear();
      allSitesData = {};
      renderSites(allSitesData);
      updateStats();
      showNotification('All settings cleared successfully!', 'success');
    } catch (error) {
      console.error('Error clearing all settings:', error);
      showNotification('Error clearing settings', 'error');
    }
  }
}

function exportSettings() {
  const dataStr = JSON.stringify(allSitesData, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  
  const link = document.createElement('a');
  link.href = URL.createObjectURL(dataBlob);
  link.download = `g-element-blocker-settings-${new Date().toISOString().split('T')[0]}.json`;
  link.click();
  
  showNotification('Settings exported successfully!', 'success');
}

function importSettings(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const importedData = JSON.parse(e.target.result);
      
      // Validate data structure
      for (const [hostname, selectors] of Object.entries(importedData)) {
        if (!Array.isArray(selectors)) {
          throw new Error('Invalid data format');
        }
      }
      
      // Merge with existing data
      const existingData = await chrome.storage.local.get(null);
      const mergedData = { ...existingData };
      
      for (const [hostname, selectors] of Object.entries(importedData)) {
        if (mergedData[hostname]) {
          // Merge and remove duplicates
          mergedData[hostname] = [...new Set([...mergedData[hostname], ...selectors])];
        } else {
          mergedData[hostname] = selectors;
        }
      }
      
      await chrome.storage.local.clear();
      await chrome.storage.local.set(mergedData);
      
      allSitesData = mergedData;
      renderSites(allSitesData);
      updateStats();
      
      // Show success message
      showNotification('Settings imported successfully!', 'success');
      
    } catch (error) {
      console.error('Import error:', error);
      showNotification('Error importing settings. Please check the file format.', 'error');
    }
  };
  
  reader.readAsText(file);
  event.target.value = ''; // Reset file input
}

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === 'success' ? 'var(--primary)' : type === 'error' ? '#ff4757' : '#666'};
    color: ${type === 'success' ? 'var(--bg-primary)' : 'white'};
    padding: 16px 24px;
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    z-index: 1000;
    font-weight: 500;
    animation: slideInNotification 0.3s ease;
    max-width: 300px;
  `;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOutNotification 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Add CSS for notification animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideInNotification {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  
  @keyframes slideOutNotification {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(100%);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);