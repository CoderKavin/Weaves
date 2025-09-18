document.addEventListener('DOMContentLoaded', async () => {
  await loadConnectionsData();
  setupEventListeners();
  startAutoRefresh();
});

// Global state
let currentConnections = [];
let pinnedConnections = [];
let isRefreshing = false;
let refreshInterval;
let currentView = 'main'; // 'main', 'pinned', 'detail'

function setupEventListeners() {
  // Don't set up static event listeners since we're using dynamic buttons
  // Navigation buttons for views
  document.getElementById('viewPinnedBtn')?.addEventListener('click', showPinnedView);
  document.getElementById('backBtn')?.addEventListener('click', showMainView);
  document.getElementById('detailBackBtn')?.addEventListener('click', () => {
    if (currentView === 'detail') {
      showMainView();
    }
  });
}

function startAutoRefresh() {
  refreshInterval = setInterval(() => {
    if (!isRefreshing && currentView === 'main') {
      loadConnectionsData(true);
    }
  }, 3000);
}

// View management
function showMainView() {
  document.getElementById('mainView').classList.remove('slide-out');
  document.getElementById('pinnedView').classList.remove('slide-in');
  document.getElementById('detailView').classList.remove('slide-in');
  currentView = 'main';
}

function showPinnedView() {
  document.getElementById('mainView').classList.add('slide-out');
  document.getElementById('pinnedView').classList.add('slide-in');
  currentView = 'pinned';
  displayPinnedConnections();
}

function showDetailView(connection) {
  document.getElementById('mainView').classList.add('slide-out');
  document.getElementById('detailView').classList.add('slide-in');
  currentView = 'detail';
  displayConnectionDetail(connection);
}

// Data loading with proper error handling and cache clearing
async function loadConnectionsData(silent = false) {
  if (isRefreshing && !silent) return;
  
  try {
    isRefreshing = true;
    if (!silent) document.body.classList.add('loading');
    
    const response = await chrome.runtime.sendMessage({type: 'GET_CONNECTIONS'});
    
    if (!response) {
      console.error('No response from background script');
      // Clear UI to prevent showing stale data
      currentConnections = [];
      pinnedConnections = [];
      displayConnections();
      updateControlsVisibility();
      return;
    }

    console.log('Loaded connections data:', response);

    // IMPORTANT: Only use connections that actually exist in the background
    // Filter out any connections that don't have proper IDs or are stale
    const validConnections = (response.connections || []).filter(connection => {
      // Must have required fields to be valid
      return connection.from && connection.to && connection.timestamp && 
             (connection.id || (connection.from && connection.to && connection.timestamp));
    });

    console.log('Valid connections after filtering:', validConnections.length);

    // Update global state with only valid connections
    currentConnections = validConnections;
    pinnedConnections = currentConnections.filter(c => c.pinned);

    // Update stats
    updateStats(response);
    
    // Update pinned header
    updatePinnedHeader();

    // Refresh current view and update controls
    if (currentView === 'main') {
      displayConnections();
    } else if (currentView === 'pinned') {
      displayPinnedConnections();
    }

  } catch (error) {
    console.error('Failed to load connections:', error);
    // Clear everything on error to prevent stale data issues
    currentConnections = [];
    pinnedConnections = [];
    displayError('Failed to load data - please refresh');
    updateControlsVisibility();
  } finally {
    isRefreshing = false;
    if (!silent) document.body.classList.remove('loading');
  }
}

function updateStats(response) {
  document.getElementById('pageCount').textContent = response.content?.length || 0;
  document.getElementById('insightCount').textContent = 
    currentConnections.filter(c => c.strength >= 0.7).length || 0;
}

function updatePinnedHeader() {
  const pinnedHeader = document.getElementById('pinnedHeader');
  const pinnedBtn = document.getElementById('viewPinnedBtn');
  
  if (pinnedConnections.length > 0) {
    pinnedHeader.classList.add('show');
    pinnedBtn.textContent = `View ${pinnedConnections.length} Pinned Connection${pinnedConnections.length > 1 ? 's' : ''}`;
  } else {
    pinnedHeader.classList.remove('show');
  }
}

// Display functions
function displayConnections() {
  const container = document.getElementById('connectionsList');
  if (!container) return;
  
  // Update controls visibility based on data
  updateControlsVisibility();
  
  if (currentConnections.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔗</div>
        <div>No connections discovered yet</div>
        <div style="font-size: 11px; margin-top: 6px; opacity: 0.6;">Browse different websites to find meaningful connections</div>
      </div>
    `;
    return;
  }

  // Show recent connections (limit to 12)
  const recentConnections = currentConnections.slice(0, 12);
  
  container.innerHTML = recentConnections.map(connection => 
    createConnectionHTML(connection, false)
  ).join('');

  attachConnectionEventListeners(container);
}

function updateControlsVisibility() {
  const controls = document.getElementById('controls');
  
  if (currentConnections.length === 0) {
    // Hide all buttons when no data - no point in visualizing nothing
    if (controls) {
      controls.innerHTML = '';
      controls.style.display = 'none';
    }
  } else {
    // Show both buttons when there's data
    if (controls) {
      controls.style.display = 'flex';
      controls.innerHTML = `
        <button id="visualizeBtn" class="btn btn-primary">Visualize</button>
        <button id="clearBtn" class="btn btn-secondary">Clear Data</button>
      `;
      // Re-attach event listeners for the new buttons
      document.getElementById('visualizeBtn')?.addEventListener('click', showVisualization);
      document.getElementById('clearBtn')?.addEventListener('click', clearAllData);
    }
  }
}

function displayPinnedConnections() {
  const container = document.getElementById('pinnedConnectionsList');
  if (!container) return;
  
  if (pinnedConnections.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📌</div>
        <div>No pinned connections yet</div>
        <div style="font-size: 11px; margin-top: 6px; opacity: 0.6;">Pin connections from the main view</div>
      </div>
    `;
    return;
  }

  container.innerHTML = pinnedConnections.map(connection => 
    createConnectionHTML(connection, true)
  ).join('');

  attachConnectionEventListeners(container);
}

function createConnectionHTML(connection, isPinned = false) {
  const itemClass = isPinned ? 'pinned-connection-item' : 'connection-item';
  const connectionId = connection.id || generateConnectionId(connection);
  
  // Fix the button logic
  let pinButton;
  if (isPinned || connection.pinned) {
    pinButton = `<button class="unpin-btn" data-connection-id="${connectionId}" data-action="unpin" title="Unpin">📌</button>`;
  } else {
    pinButton = `<button class="pin-btn" data-connection-id="${connectionId}" data-action="pin" title="Pin">📍</button>`;
  }

  return `
    <div class="${itemClass}" data-connection-id="${connectionId}">
      <div class="connection-header">
        <span class="connection-strength">${Math.round(connection.strength * 100)}%</span>
        <div class="connection-actions">
          ${pinButton}
          <button class="delete-btn" data-connection-id="${connectionId}" data-action="delete" title="Delete">×</button>
        </div>
      </div>
      <div class="connection-type">${getConnectionType(connection)}</div>
      <div class="connection-reason">${getImprovedSummary(connection)}</div>
      ${connection.platforms ? 
        `<div class="connection-platforms">${connection.platforms}</div>` : 
        `<div class="connection-platforms">${connection.fromTitle || 'Content'} → ${connection.toTitle || 'Content'}</div>`
    }
    </div>
  `;
}

function generateConnectionId(connection) {
  // Use the same ID generation logic as background.js storageManager
  if (connection.id) {
    return connection.id;
  }
  
  // Fallback to manual generation if no ID exists
  if (connection.from && connection.to && connection.timestamp) {
    return connection.from + '-' + connection.to + '-' + connection.timestamp;
  }
  
  // If connection is missing required fields, it's invalid
  console.warn('Invalid connection - missing required fields:', connection);
  return null;
}

function getConnectionType(connection) {
  // Determine connection type based on content
  if (connection.platforms && connection.platforms.includes('→')) {
    return 'Cross-Platform Insight';
  } else if (connection.strength >= 0.8) {
    return 'Strong Connection';
  } else if (connection.strength >= 0.6) {
    return 'Related Content';
  } else {
    return 'Weak Connection';
  }
}

function getImprovedSummary(connection) {
  // Use the actual AI-generated reason if it exists
  if (connection.reason && connection.reason.trim() && connection.reason !== 'Connection found') {
    return connection.reason;
  }
  
  // Only use fallback if no real reason exists
  const strength = connection.strength;
  if (strength >= 0.8) {
    return `Strong connection detected with ${Math.round(strength * 100)}% confidence`;
  } else if (strength >= 0.6) {
    return `Related content with ${Math.round(strength * 100)}% similarity`;
  } else {
    return `Weak connection with ${Math.round(strength * 100)}% confidence`;
  }
}

function displayConnectionDetail(connection) {
  const container = document.getElementById('detailContent');
  if (!container) return;

  // Update detail header
  document.getElementById('detailTitle').textContent = getConnectionType(connection);
  document.getElementById('detailSubtitle').textContent = `${Math.round(connection.strength * 100)}% Match`;

  container.innerHTML = `
    <div class="detail-section">
      <div class="detail-title">Summary</div>
      <div class="detail-text">${getDetailedAnalysis(connection)}</div>
    </div>

    <div class="detail-section">
      <div class="detail-title">Key Themes</div>
      <div class="detail-text">${getKeyThemes(connection)}</div>
    </div>

    <div class="detail-section">
      <div class="detail-title">Connection Strength</div>
      <div class="detail-text">
        ${getStrengthExplanation(connection.strength)} 
        This indicates ${connection.strength >= 0.8 ? 'very strong thematic alignment' : 
                        connection.strength >= 0.6 ? 'moderate conceptual overlap' : 
                        'basic topical similarity'}.
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-title">Related Content</div>
      <div class="detail-text">${getRelatedContent(connection)}</div>
    </div>

    <div class="detail-section">
      <div class="detail-title">Why This Matters</div>
      <div class="detail-text">${getWhyThisMatters(connection)}</div>
    </div>
  `;
}

// Add these helper functions if they don't exist
function getKeyThemes(connection) {
  const reason = connection.reason || '';
  const themes = [];
  
  if (reason.includes('methodology') || reason.includes('method')) themes.push('Research Methodology');
  if (reason.includes('framework') || reason.includes('theory')) themes.push('Theoretical Framework');
  if (reason.includes('evidence') || reason.includes('empirical')) themes.push('Empirical Evidence');
  if (reason.includes('cross-disciplinary') || reason.includes('interdisciplinary')) themes.push('Cross-Disciplinary Analysis');
  if (reason.includes('historical') || reason.includes('evolution')) themes.push('Historical Patterns');
  if (reason.includes('comparative') || reason.includes('contrast')) themes.push('Comparative Analysis');
  
  return themes.length > 0 ? themes.join(', ') : 'Conceptual relationships identified through content analysis';
}

function getRelatedContent(connection) {
  const fromTitle = connection.fromTitle || 'Source Content';
  const toTitle = connection.toTitle || 'Target Content';
  
  return `Connecting "${fromTitle}" with "${toTitle}" - both pieces contribute to understanding the same research domain or methodological approach.`;
}

function getWhyThisMatters(connection) {
  const strength = connection.strength;
  const reason = connection.reason || '';
  
  if (reason.includes('methodology')) {
    return `This connection reveals methodological approaches that could be applied across different research contexts, potentially strengthening your analytical toolkit.`;
  } else if (reason.includes('framework') || reason.includes('theory')) {
    return `This theoretical connection suggests ways to bridge different conceptual approaches, which could lead to more comprehensive analysis in your research.`;
  } else if (reason.includes('empirical') || reason.includes('evidence')) {
    return `This connection highlights complementary evidence sources that could strengthen arguments or reveal gaps in current understanding.`;
  } else if (strength >= 0.8) {
    return `This strong connection suggests a significant conceptual overlap that could inform how you approach similar topics in your research or studies.`;
  } else {
    return `This connection reveals subtle relationships between different domains that might not be immediately obvious but could enhance your understanding.`;
  }
}

function getKeyThemes(connection) {
  // Extract meaningful themes from the AI-generated reason
  const reason = connection.reason || '';
  const themes = [];
  
  // Look for methodological themes
  if (reason.includes('methodology') || reason.includes('method')) themes.push('Research Methodology');
  if (reason.includes('framework') || reason.includes('theory')) themes.push('Theoretical Framework');
  if (reason.includes('evidence') || reason.includes('empirical')) themes.push('Empirical Evidence');
  if (reason.includes('cross-disciplinary') || reason.includes('interdisciplinary')) themes.push('Cross-Disciplinary Analysis');
  if (reason.includes('historical') || reason.includes('evolution')) themes.push('Historical Patterns');
  if (reason.includes('comparative') || reason.includes('contrast')) themes.push('Comparative Analysis');
  
  return themes.length > 0 ? themes.join(', ') : 'Conceptual relationships identified through content analysis';
}

function getRelatedContent(connection) {
  // Use actual content titles if available
  const fromTitle = connection.fromTitle || 'Source Content';
  const toTitle = connection.toTitle || 'Target Content';
  
  return `Connecting "${fromTitle}" with "${toTitle}" - both pieces contribute to understanding the same research domain or methodological approach.`;
}

function getWhyThisMatters(connection) {
  const strength = connection.strength;
  const reason = connection.reason || '';
  
  // Generate contextual explanations based on the AI reasoning
  if (reason.includes('methodology')) {
    return `This connection reveals methodological approaches that could be applied across different research contexts, potentially strengthening your analytical toolkit.`;
  } else if (reason.includes('framework') || reason.includes('theory')) {
    return `This theoretical connection suggests ways to bridge different conceptual approaches, which could lead to more comprehensive analysis in your research.`;
  } else if (reason.includes('empirical') || reason.includes('evidence')) {
    return `This connection highlights complementary evidence sources that could strengthen arguments or reveal gaps in current understanding.`;
  } else if (strength >= 0.8) {
    return `This strong connection suggests a significant conceptual overlap that could inform how you approach similar topics in your research or studies.`;
  } else {
    return `This connection reveals subtle relationships between different domains that might not be immediately obvious but could enhance your understanding.`;
  }
}

function getContentSources(connection) {
  // Try to get the actual content titles from the connection
  const fromContent = currentConnections.find(c => c.id === connection.from);
  const toContent = currentConnections.find(c => c.id === connection.to);
  
  if (fromContent || toContent) {
    return `Connecting "${fromContent?.title || 'Content'}" and "${toContent?.title || 'Content'}" based on thematic similarities.`;
  }
  
  // Show the actual platforms if available
  if (connection.platforms) {
    return `Found connection between content from: ${connection.platforms}`;
  }
  
  return `Based on analysis of recent browsing content.`;
}

function getStrengthExplanation(strength) {
  const percentage = Math.round(strength * 100);
  if (strength >= 0.8) {
    return `${percentage}% confidence rating indicates exceptional alignment.`;
  } else if (strength >= 0.6) {
    return `${percentage}% confidence rating shows solid connection.`;
  } else {
    return `${percentage}% confidence rating suggests loose association.`;
  }
}

function getDetailedAnalysis(connection) {
  // Use the actual AI reason as the detailed analysis
  if (connection.reason && connection.reason.trim()) {
    return connection.reason + " This connection was identified through AI analysis of the content themes and context.";
  }
  
  // Fallback only if no real reason
  return `Connection detected with ${Math.round(connection.strength * 100)}% confidence based on content analysis.`;
}

function getConnectionInsight(connection) {
  if (connection.strength >= 0.8) {
    return `Strong connections like this often reveal important patterns in how you process information. This pairing might be worth exploring further or saving for future reference.`;
  } else if (connection.strength >= 0.6) {
    return `Moderate connections help identify emerging themes in your research. Consider whether this relationship suggests new directions worth exploring.`;
  } else {
    return `Even weak connections can spark new ideas. This relationship might become stronger as you encounter more related content.`;
  }
}

// Event listeners with better debugging
function attachConnectionEventListeners(container) {
  // Use event delegation for better reliability
  container.addEventListener('click', handleConnectionClick);
}

function handleConnectionClick(e) {
  const target = e.target;
  const connectionId = target.dataset.connectionId;
  const action = target.dataset.action;
  
  console.log('Click detected:', { 
    target: target.tagName, 
    className: target.className,
    connectionId, 
    action 
  });
  
  if (!connectionId) {
    const parent = target.closest('[data-connection-id]');
    if (parent && !action) {
      // Clicked somewhere in connection item but not on a button
      const parentId = parent.dataset.connectionId;
      const connection = currentConnections.find(c => 
        (c.id || generateConnectionId(c)) === parentId
      );
      if (connection) {
        console.log('Opening detail view for:', parentId);
        showDetailView(connection);
      }
    }
    return;
  }
  
  // Handle button actions
  if (action) {
    e.stopPropagation();
    e.preventDefault();
    
    console.log('Processing action:', action, 'for connection:', connectionId);
    
    // Visual feedback
    target.style.transform = 'scale(0.9)';
    target.style.opacity = '0.7';
    setTimeout(() => {
      target.style.transform = 'scale(1)';
      target.style.opacity = '1';
    }, 150);
    
    // Handle action
    switch(action) {
      case 'pin':
        console.log('Calling togglePin with false');
        togglePin(connectionId, false);
        break;
      case 'unpin':
        console.log('Calling togglePin with true');
        togglePin(connectionId, true);
        break;
      case 'delete':
        console.log('Calling deleteConnection');
        deleteConnection(connectionId);
        break;
    }
    return;
  }
  
  // Handle connection item click (expand to detail view)
  if (!target.closest('.connection-actions')) {
    console.log('Opening detail view for connection:', connectionId);
    const connection = currentConnections.find(c => 
      (c.id || generateConnectionId(c)) === connectionId
    );
    if (connection) {
      showDetailView(connection);
    }
  }
}

// Actions with proper error handling and debugging
async function togglePin(connectionId, isCurrentlyPinned) {
  try {
    console.log('togglePin called:', { connectionId, isCurrentlyPinned });
    
    // First, verify the connection exists in our current data
    const connection = currentConnections.find(c => 
      (c.id || generateConnectionId(c)) === connectionId
    );
    
    if (!connection) {
      console.error('Connection not found in current data:', connectionId);
      await loadConnectionsData(); // Force refresh
      return;
    }
    
    const response = await chrome.runtime.sendMessage({
      type: isCurrentlyPinned ? 'UNPIN_CONNECTION' : 'PIN_CONNECTION',
      connectionId: connectionId
    });
    
    console.log('Pin/Unpin response:', response);
    
    if (response && response.success) {
      console.log('Pin/unpin successful, reloading data...');
      
      // Immediately reload data and update view
      await loadConnectionsData();
      
      // If we're in pinned view and unpinned the last item, go back to main
      if (isCurrentlyPinned && currentView === 'pinned' && pinnedConnections.length === 0) {
        showMainView();
      }
    } else {
      console.error('Pin/unpin failed:', response);
      // Only show error if it actually failed
      await loadConnectionsData(); // Still refresh data
    }
  } catch (error) {
    console.error('Failed to toggle pin:', error);
    await loadConnectionsData(); // Refresh on error
  }
}

async function deleteConnection(connectionId) {
  try {
    console.log('deleteConnection called:', connectionId);
    
    // First, verify the connection exists in our current data
    const connection = currentConnections.find(c => 
      (c.id || generateConnectionId(c)) === connectionId
    );
    
    if (!connection) {
      console.error('Connection not found in current data:', connectionId);
      await loadConnectionsData(); // Force refresh
      return;
    }
    
    const response = await chrome.runtime.sendMessage({
      type: 'DELETE_CONNECTION',
      connectionId: connectionId
    });
    
    console.log('Delete response:', response);
    
    if (response && response.success) {
      console.log('Delete successful, animating removal...');
      
      // Remove from UI with animation
      const item = document.querySelector(`[data-connection-id="${connectionId}"]`);
      if (item) {
        item.style.transition = 'all 0.3s ease';
        item.style.transform = 'translateX(-100%)';
        item.style.opacity = '0';
        
        setTimeout(async () => {
          // Reload data and update current view
          await loadConnectionsData();
          
          // If we're in pinned view and deleted the last item, go back
          if (currentView === 'pinned' && pinnedConnections.length === 0) {
            showMainView();
          }
        }, 300);
      } else {
        // If item not found, just reload data
        await loadConnectionsData();
      }
    } else {
      console.error('Delete failed:', response);
      // Only show error if it actually failed
      await loadConnectionsData(); // Still refresh data
    }
  } catch (error) {
    console.error('Failed to delete connection:', error);
    await loadConnectionsData(); // Refresh on error
  }
}

async function clearAllData() {
  if (confirm('Clear all unpinned data? Pinned connections will be preserved.')) {
    try {
      await chrome.runtime.sendMessage({type: 'CLEAR_DATA'});
      await loadConnectionsData();
      
      if (currentView !== 'main') {
        showMainView();
      }
      
      // Update controls after clearing data
      updateControlsVisibility();
    } catch (error) {
      console.error('Failed to clear data:', error);
      showError('Failed to clear data');
    }
  }
}

// Visualization
async function showVisualization() {
  try {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    
    // Check for restricted pages
    if (tab.url.startsWith('chrome://') || 
        tab.url.startsWith('chrome-extension://') || 
        tab.url.startsWith('about:')) {
      
      showError('Visualization not available on this page. Please navigate to a regular website and try again.');
      return;
    }

    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'SHOW_VISUALIZATION',
        connections: currentConnections
      });
    } catch (contentScriptError) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        
        setTimeout(async () => {
          try {
            await chrome.tabs.sendMessage(tab.id, {
              type: 'SHOW_VISUALIZATION',
              connections: currentConnections
            });
          } catch (retryError) {
            showError('Unable to show visualization on this page.');
          }
        }, 100);
        
      } catch (injectionError) {
        showError('Cannot show visualization on this page.');
      }
    }
  } catch (error) {
    console.error('Visualization error:', error);
    showError('Failed to show visualization.');
  }
}

// Helper functions
function displayError(message) {
  const container = document.getElementById('connectionsList');
  if (container) {
    container.innerHTML = `<div class="connection-item">${message}</div>`;
  }
}

function showError(message) {
  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(255, 59, 48, 0.95);
    backdrop-filter: blur(20px);
    color: white;
    padding: 16px 20px;
    border-radius: 12px;
    max-width: 300px;
    text-align: center;
    z-index: 1000;
    font-size: 13px;
    font-weight: 500;
  `;
  errorDiv.textContent = message;
  
  document.body.appendChild(errorDiv);
  
  setTimeout(() => {
    if (errorDiv.parentNode) {
      errorDiv.style.opacity = '0';
      setTimeout(() => errorDiv.remove(), 300);
    }
  }, 3000);
  
  errorDiv.addEventListener('click', () => {
    errorDiv.style.opacity = '0';
    setTimeout(() => errorDiv.remove(), 300);
  });
}

// Cleanup
window.addEventListener('beforeunload', () => {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (refreshInterval) clearInterval(refreshInterval);
  } else {
    startAutoRefresh();
    if (currentView === 'main') loadConnectionsData(true);
  }
});