// Weaves Storage Manager - Handles persistent storage, daily resets, and pinning system
class WeavesStorageManager {
  constructor() {
    this.pinnedConnections = new Map();
    this.STORAGE_KEYS = {
      WEAVES_DATA: 'weavesData',
      PINNED_CONNECTIONS: 'pinnedConnections',
      LAST_RESET_DATE: 'lastResetDate',
      SETTINGS: 'weavesSettings'
    };
    this.DEFAULT_SETTINGS = {
      dailyResetEnabled: true,
      resetTime: '00:00', // Midnight
      maxStorageSize: 50, // MB
      retentionDays: 7
    };
  }

  async initialize() {
    try {
      await this.loadStoredData();
      await this.checkDailyReset();
      console.log('Weaves Storage Manager initialized');
    } catch (error) {
      console.error('Failed to initialize storage manager:', error);
    }
  }

  async loadStoredData() {
    try {
      const result = await chrome.storage.local.get([
        this.STORAGE_KEYS.WEAVES_DATA,
        this.STORAGE_KEYS.PINNED_CONNECTIONS,
        this.STORAGE_KEYS.LAST_RESET_DATE,
        this.STORAGE_KEYS.SETTINGS
      ]);

      // Load pinned connections
      this.pinnedConnections = new Map(result[this.STORAGE_KEYS.PINNED_CONNECTIONS] || []);

      // Load settings with defaults
      this.settings = { ...this.DEFAULT_SETTINGS, ...result[this.STORAGE_KEYS.SETTINGS] };

      return result[this.STORAGE_KEYS.WEAVES_DATA] || null;
    } catch (error) {
      console.warn('Failed to load stored data:', error);
      return null;
    }
  }

  async checkDailyReset() {
    if (!this.settings.dailyResetEnabled) return false;

    try {
      const result = await chrome.storage.local.get([this.STORAGE_KEYS.LAST_RESET_DATE]);
      const today = new Date().toDateString();
      const lastReset = result[this.STORAGE_KEYS.LAST_RESET_DATE];

      if (lastReset !== today) {
        console.log('New day detected - performing daily reset');
        await this.performDailyReset();
        await chrome.storage.local.set({ 
          [this.STORAGE_KEYS.LAST_RESET_DATE]: today 
        });
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to check daily reset:', error);
      return false;
    }
  }

  async performDailyReset() {
    try {
      // Clear unpinned data but preserve pinned connections
      await chrome.storage.local.set({
        [this.STORAGE_KEYS.WEAVES_DATA]: null
      });

      // Clean up old pinned connections (older than retention period)
      await this.cleanupPinnedConnections();

      console.log('Daily reset completed - unpinned data cleared, pinned connections preserved');
    } catch (error) {
      console.error('Failed to perform daily reset:', error);
    }
  }

  async cleanupPinnedConnections() {
    const retentionMs = this.settings.retentionDays * 24 * 60 * 60 * 1000;
    const cutoffTime = Date.now() - retentionMs;
    
    let cleanedCount = 0;
    for (const [id, connection] of this.pinnedConnections.entries()) {
      if (connection.pinnedAt < cutoffTime) {
        this.pinnedConnections.delete(id);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      await this.savePinnedConnections();
      console.log(`Cleaned up ${cleanedCount} old pinned connections`);
    }
  }

  async saveData(contentStore, connections) {
    try {
      const dataToStore = {
        contentStore: Array.from(contentStore.entries()),
        connections: connections,
        timestamp: Date.now(),
        version: '1.0'
      };

      // Check storage size and cleanup if needed
      await this.checkStorageSize(dataToStore);

      await chrome.storage.local.set({
        [this.STORAGE_KEYS.WEAVES_DATA]: dataToStore
      });

      // Also save pinned connections
      await this.savePinnedConnections();
    } catch (error) {
      console.error('Failed to save data:', error);
      throw error;
    }
  }

  async savePinnedConnections() {
    try {
      await chrome.storage.local.set({
        [this.STORAGE_KEYS.PINNED_CONNECTIONS]: Array.from(this.pinnedConnections.entries())
      });
    } catch (error) {
      console.error('Failed to save pinned connections:', error);
    }
  }

  async checkStorageSize(data) {
    try {
      const dataSize = new Blob([JSON.stringify(data)]).size;
      const maxSize = this.settings.maxStorageSize * 1024 * 1024; // Convert MB to bytes

      if (dataSize > maxSize) {
        console.warn(`Data size (${Math.round(dataSize / 1024)}KB) exceeds limit. Performing cleanup.`);
        await this.performStorageCleanup();
      }
    } catch (error) {
      console.warn('Failed to check storage size:', error);
    }
  }

  async performStorageCleanup() {
    // This could be called by the main AI class to trim old data
    console.log('Storage cleanup requested - consider reducing data retention');
  }

  // Pin Management Methods
  pinConnection(connection) {
    const connectionId = this.generateConnectionId(connection);
    
    if (connectionId && connection) {
      this.pinnedConnections.set(connectionId, {
        ...connection,
        pinned: true,
        pinnedAt: Date.now(),
        pinnedVersion: '1.0'
      });
      
      this.savePinnedConnections();
      console.log(`Connection pinned: ${connectionId}`);
      return true;
    }
    return false;
  }

  unpinConnection(connectionId) {
    const removed = this.pinnedConnections.delete(connectionId);
    if (removed) {
      this.savePinnedConnections();
      console.log(`Connection unpinned: ${connectionId}`);
    }
    return removed;
  }

  isPinned(connectionId) {
    return this.pinnedConnections.has(connectionId);
  }

  getPinnedConnections() {
    return Array.from(this.pinnedConnections.values()).map(conn => ({
      ...conn,
      id: this.generateConnectionId(conn),
      pinned: true
    }));
  }

  generateConnectionId(connection) {
    if (!connection.from || !connection.to || !connection.timestamp) {
      console.warn('Invalid connection for ID generation:', connection);
      return null;
    }
    return `${connection.from}-${connection.to}-${connection.timestamp}`;
  }

  // Combine regular and pinned connections
  getAllConnections(regularConnections) {
    const regular = regularConnections.map(c => ({
      ...c,
      id: this.generateConnectionId(c),
      pinned: false
    }));
    
    const pinned = this.getPinnedConnections();
    
    // Remove duplicates (if a pinned connection also exists in regular connections)
    const allConnections = [...pinned];
    regular.forEach(regularConn => {
      if (!pinned.find(pinnedConn => pinnedConn.id === regularConn.id)) {
        allConnections.push(regularConn);
      }
    });
    
    return allConnections.sort((a, b) => {
      // Pinned connections first
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      // Then by strength
      if (a.strength !== b.strength) return b.strength - a.strength;
      // Then by recency
      return b.timestamp - a.timestamp;
    });
  }

  // Settings management
  async updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    await chrome.storage.local.set({
      [this.STORAGE_KEYS.SETTINGS]: this.settings
    });
    console.log('Settings updated:', newSettings);
  }

  getSettings() {
    return { ...this.settings };
  }

  // Export/Import functionality
  async exportData() {
    try {
      const allData = await chrome.storage.local.get();
      const exportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        data: allData,
        pinnedConnections: Array.from(this.pinnedConnections.entries())
      };
      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error('Failed to export data:', error);
      throw error;
    }
  }

  async importData(jsonData) {
    try {
      const importData = JSON.parse(jsonData);
      
      if (importData.version && importData.data) {
        // Restore main data
        await chrome.storage.local.set(importData.data);
        
        // Restore pinned connections
        if (importData.pinnedConnections) {
          this.pinnedConnections = new Map(importData.pinnedConnections);
          await this.savePinnedConnections();
        }
        
        console.log('Data imported successfully');
        return true;
      }
      throw new Error('Invalid import data format');
    } catch (error) {
      console.error('Failed to import data:', error);
      throw error;
    }
  }

  // Analytics and insights
  getStorageStats() {
    return {
      pinnedConnections: this.pinnedConnections.size,
      settings: this.settings,
      lastReset: null // Would need to fetch from storage
    };
  }

  // Cleanup utilities
  async clearAllData() {
    try {
      await chrome.storage.local.clear();
      this.pinnedConnections.clear();
      console.log('All data cleared');
    } catch (error) {
      console.error('Failed to clear all data:', error);
    }
  }

  async clearUnpinnedData() {
    try {
      await chrome.storage.local.set({
        [this.STORAGE_KEYS.WEAVES_DATA]: null
      });
      console.log('Unpinned data cleared');
    } catch (error) {
      console.error('Failed to clear unpinned data:', error);
    }
  }
}

// Export for use in background script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WeavesStorageManager;
} else if (typeof self !== 'undefined') {
  self.WeavesStorageManager = WeavesStorageManager;
}