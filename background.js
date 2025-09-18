// Weaves Storage Manager - Handles daily reset and pinning system
class WeavesStorageManager {
  constructor() {
    this.STORAGE_KEYS = {
      DAILY_DATA: 'weavesData',
      PINNED_CONNECTIONS: 'pinnedConnections',
      LAST_RESET_DATE: 'lastResetDate',
      SETTINGS: 'weavesSettings'
    };
    
    this.DEFAULT_SETTINGS = {
      autoResetEnabled: true,
      resetTime: 'midnight',
      maxDailyContent: 100,
      maxPinnedConnections: 50,
      dataRetentionDays: 7
    };
    
    this.pinnedConnections = new Map();
    this.settings = { ...this.DEFAULT_SETTINGS };
    this.initializeStorage();
  }

  async initializeStorage() {
    try {
      const result = await chrome.storage.local.get([this.STORAGE_KEYS.SETTINGS]);
      if (result[this.STORAGE_KEYS.SETTINGS]) {
        this.settings = { ...this.DEFAULT_SETTINGS, ...result[this.STORAGE_KEYS.SETTINGS] };
      }

      await this.checkAndPerformDailyReset();
      await this.loadPinnedConnections();
      this.scheduleNextResetCheck();
      
      console.log('Weaves Storage Manager initialized');
    } catch (error) {
      console.error('Failed to initialize storage manager:', error);
    }
  }

  async checkAndPerformDailyReset() {
    if (!this.settings.autoResetEnabled) return;

    try {
      const result = await chrome.storage.local.get([this.STORAGE_KEYS.LAST_RESET_DATE]);
      const today = this.getCurrentDateString();
      const lastReset = result[this.STORAGE_KEYS.LAST_RESET_DATE];

      if (lastReset !== today) {
        await this.performDailyReset(today);
        console.log('Daily reset performed for ' + today);
      }
    } catch (error) {
      console.error('Failed to check/perform daily reset:', error);
    }
  }

  async performDailyReset(dateString) {
    try {
      await chrome.storage.local.set({
        [this.STORAGE_KEYS.DAILY_DATA]: null,
        [this.STORAGE_KEYS.LAST_RESET_DATE]: dateString
      });

      await this.cleanupPinnedConnections();
    } catch (error) {
      console.error('Failed to perform daily reset:', error);
    }
  }

  async loadStoredData() {
    try {
      const result = await chrome.storage.local.get([
        this.STORAGE_KEYS.DAILY_DATA,
        this.STORAGE_KEYS.LAST_RESET_DATE
      ]);

      const today = this.getCurrentDateString();
      const lastReset = result[this.STORAGE_KEYS.LAST_RESET_DATE];

      if (lastReset !== today && this.settings.autoResetEnabled) {
        await this.performDailyReset(today);
        return { contentStore: new Map(), connections: [] };
      }

      if (result[this.STORAGE_KEYS.DAILY_DATA]) {
        const data = result[this.STORAGE_KEYS.DAILY_DATA];
        return {
          contentStore: new Map(data.contentStore || []),
          connections: data.connections || []
        };
      }

      return { contentStore: new Map(), connections: [] };
    } catch (error) {
      console.error('Failed to load stored data:', error);
      return { contentStore: new Map(), connections: [] };
    }
  }

  async saveData(contentStore, connections) {
    try {
      const dataToStore = {
        contentStore: Array.from(contentStore.entries()),
        connections: connections,
        timestamp: Date.now()
      };

      await chrome.storage.local.set({
        [this.STORAGE_KEYS.DAILY_DATA]: dataToStore
      });

      await this.savePinnedConnections();
    } catch (error) {
      console.error('Failed to save data:', error);
    }
  }

  async loadPinnedConnections() {
    try {
      const result = await chrome.storage.local.get([this.STORAGE_KEYS.PINNED_CONNECTIONS]);
      if (result[this.STORAGE_KEYS.PINNED_CONNECTIONS]) {
        this.pinnedConnections = new Map(result[this.STORAGE_KEYS.PINNED_CONNECTIONS]);
      }
    } catch (error) {
      console.error('Failed to load pinned connections:', error);
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

  async pinConnection(connectionId, connection) {
    try {
      if (this.pinnedConnections.size >= this.settings.maxPinnedConnections) {
        throw new Error('Cannot pin more than ' + this.settings.maxPinnedConnections + ' connections');
      }

      const pinnedConnection = {
        ...connection,
        pinned: true,
        pinnedAt: Date.now(),
        pinnedDate: this.getCurrentDateString()
      };

      this.pinnedConnections.set(connectionId, pinnedConnection);
      await this.savePinnedConnections();
      
      return true;
    } catch (error) {
      console.error('Failed to pin connection:', error);
      return false;
    }
  }

  async unpinConnection(connectionId) {
    try {
      const removed = this.pinnedConnections.delete(connectionId);
      if (removed) {
        await this.savePinnedConnections();
      }
      return removed;
    } catch (error) {
      console.error('Failed to unpin connection:', error);
      return false;
    }
  }

  getPinnedConnections() {
    return Array.from(this.pinnedConnections.values()).map(conn => ({
      ...conn,
      id: this.generateConnectionId(conn),
      pinned: true
    }));
  }

  async cleanupPinnedConnections() {
    try {
      if (this.pinnedConnections.size > this.settings.maxPinnedConnections) {
        const sortedPins = Array.from(this.pinnedConnections.entries())
          .sort(([,a], [,b]) => a.pinnedAt - b.pinnedAt);
        
        const toRemove = sortedPins.slice(0, sortedPins.length - this.settings.maxPinnedConnections);
        toRemove.forEach(([id]) => this.pinnedConnections.delete(id));
        
        await this.savePinnedConnections();
      }
    } catch (error) {
      console.error('Failed to cleanup pinned connections:', error);
    }
  }

  getCurrentDateString() {
    return new Date().toDateString();
  }

  generateConnectionId(connection) {
    return connection.from + '-' + connection.to + '-' + connection.timestamp;
  }

  scheduleNextResetCheck() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const timeUntilReset = tomorrow.getTime() - now.getTime();
    
    setTimeout(() => {
      this.checkAndPerformDailyReset();
      this.scheduleNextResetCheck();
    }, timeUntilReset);

    console.log('Next reset scheduled for: ' + tomorrow.toLocaleString());
  }

  async getStorageStats() {
    try {
      const result = await chrome.storage.local.get(null);
      const totalSize = JSON.stringify(result).length;
      
      return {
        totalStorageBytes: totalSize,
        pinnedConnectionsCount: this.pinnedConnections.size,
        lastResetDate: result[this.STORAGE_KEYS.LAST_RESET_DATE],
        settings: this.settings
      };
    } catch (error) {
      console.error('Failed to get storage stats:', error);
      return null;
    }
  }
}

// Weaves Background Service Worker
class WeavesAI {
  constructor() {
    this.isInitialized = false;
    this.session = null;
    this.contentStore = new Map();
    this.connections = [];
    this.storageManager = new WeavesStorageManager();
    
    this.initializeAI();
    this.loadStoredData();
  }

  async loadStoredData() {
    try {
      const data = await this.storageManager.loadStoredData();
      this.contentStore = data.contentStore;
      this.connections = data.connections;
      console.log('Loaded ' + this.contentStore.size + ' content items and ' + this.connections.length + ' connections');
    } catch (error) {
      console.warn('Failed to load stored data:', error);
    }
  }

  async saveData() {
    try {
      await this.storageManager.saveData(this.contentStore, this.connections);
    } catch (error) {
      console.warn('Failed to save data:', error);
    }
  }

  async pinConnection(connectionId) {
    const connection = this.connections.find(c => this.getConnectionId(c) === connectionId);
    if (connection) {
      const success = await this.storageManager.pinConnection(connectionId, connection);
      return success;
    }
    return false;
  }

  async unpinConnection(connectionId) {
    return await this.storageManager.unpinConnection(connectionId);
  }

  getConnectionId(connection) {
    return this.storageManager.generateConnectionId(connection);
  }

  getAllConnections() {
    const regularConnections = this.connections.map(c => ({
      ...c,
      id: this.getConnectionId(c),
      pinned: false
    }));
    
    const pinnedConnections = this.storageManager.getPinnedConnections();
    
    const allConnections = [...pinnedConnections];
    regularConnections.forEach(regular => {
      if (!pinnedConnections.find(pinned => pinned.id === regular.id)) {
        allConnections.push(regular);
      }
    });
    
    return allConnections.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      if (a.strength !== b.strength) return b.strength - a.strength;
      return b.timestamp - a.timestamp;
    });
  }

  async initializeAI() {
  try {
    const availability = await LanguageModel.availability();
    console.log('AI Availability:', availability);
    
    // Force accept "available" status
    if (availability) {
      this.session = await LanguageModel.create({
        temperature: 0.7,
        topK: 3,
      });
      this.isInitialized = true;
      console.log('Weaves AI initialized successfully with Chrome AI');
    } else {
      console.log('Chrome AI not ready, using fallback analysis');
      this.isInitialized = false;
    }
  } catch (error) {
    console.error('Chrome AI initialization failed:', error);
    this.isInitialized = false;
  }
}

  async analyzeContent(content) {
  if (!this.isInitialized) {
    return {
      coreMessage: 'Content requires AI analysis',
      perspective: 'unknown',
      themes: [],
      emotionalContext: 'neutral',
      problems: [],
      solutions: [],
      assumptions: [],
      implications: [],
      contentNature: 'unanalyzed',
      summary: content.substring(0, 300) + '...'
    };
  }

  try {
    const prompt = `Analyze this content and return a JSON object with insights:
    
    Content: ${content.substring(0, 4000)}
    
    Return JSON:
    {
      "coreMessage": "main point",
      "themes": ["theme1", "theme2"],
      "emotionalContext": "emotional tone",
      "problems": ["problems mentioned"],
      "solutions": ["solutions mentioned"],
      "contentNature": "type of content"
    }`;

    const result = await this.session.prompt(prompt);
    try {
      const parsed = JSON.parse(result);
      return {
        coreMessage: parsed.coreMessage || '',
        perspective: 'analyzed',
        themes: parsed.themes || [],
        emotionalContext: parsed.emotionalContext || 'neutral',
        problems: parsed.problems || [],
        solutions: parsed.solutions || [],
        assumptions: [],
        implications: parsed.themes || [],
        contentNature: parsed.contentNature || 'general',
        summary: content.substring(0, 300) + '...'
      };
    } catch (parseError) {
      return this.minimalFallbackAnalysis(content);
    }
  } catch (error) {
    console.warn('AI analysis failed:', error);
    return this.minimalFallbackAnalysis(content);
  }
}

  async findConnections(newContent, existingContents) {
  if (!this.isInitialized) {
    console.log('AI not available - no connections generated');
    return [];
  }

  try {
    // Extract meaningful content for analysis
    const newAnalysis = {
      title: newContent.title,
      content: newContent.analysis?.coreMessage || newContent.content?.substring(0, 800),
      themes: newContent.analysis?.themes || [],
      problems: newContent.analysis?.problems || [],
      solutions: newContent.analysis?.solutions || [],
      contentNature: newContent.analysis?.contentNature || 'unknown'
    };

    const existingAnalyses = existingContents.slice(0, 4).map((content, index) => ({
      index: index,
      title: content.title,
      content: content.analysis?.coreMessage || content.content?.substring(0, 400),
      themes: content.analysis?.themes || [],
      problems: content.analysis?.problems || [],
      solutions: content.analysis?.solutions || [],
      contentNature: content.analysis?.contentNature || 'unknown',
      id: content.id
    }));

    const prompt = `You are an expert academic advisor helping students and researchers discover intellectually valuable connections that would enhance their understanding or research.

NEW CONTENT:
Title: "${newAnalysis.title}"
Key Points: ${newAnalysis.content}
Type: ${newAnalysis.contentNature}

EXISTING CONTENT TO COMPARE:
${existingAnalyses.map(content => 
  `${content.index}: "${content.title}" (${content.contentNature})\nKey Points: ${content.content}`
).join('\n\n')}

FIND CONNECTIONS THAT PROVIDE GENUINE ACADEMIC VALUE:

Look for:
- Methodological approaches in one that could solve limitations in another
- Theoretical frameworks that bridge different disciplines
- Empirical evidence that supports/challenges arguments across fields
- Complementary perspectives on the same phenomenon
- Historical patterns or case studies that illuminate current issues
- Conceptual models that explain phenomena in different domains
- Research gaps in one area filled by insights from another
- Contradictions that reveal deeper questions worth investigating

IGNORE surface-level similarities like shared keywords or topics.

ONLY suggest connections that would make a researcher think: "I hadn't considered applying this framework/method/evidence to my area of study."

Respond with ONLY the most intellectually valuable connections:

Format: CONNECT: [index] | [0.7-1.0] | [specific insight explaining HOW this connection advances understanding or research]

Maximum 2 connections. If no genuinely valuable connections exist, respond with: NO_CONNECTIONS`;

    const result = await this.session.prompt(prompt);
    console.log('Academic AI response:', result);
    
    // Handle case where no valuable connections are found
    if (result.trim() === 'NO_CONNECTIONS') {
      console.log('AI found no academically valuable connections');
      return [];
    }
    
    // Parse structured text response
    const connections = [];
    const lines = result.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('CONNECT:')) {
        try {
          const parts = line.replace('CONNECT:', '').split('|').map(p => p.trim());
          if (parts.length >= 3) {
            const index = parseInt(parts[0]);
            const strength = parseFloat(parts[1]);
            const reason = parts[2];
            
            // Validate the connection meets academic standards
            if (index >= 0 && index < existingAnalyses.length && 
                strength >= 0.7 && strength <= 1.0 && 
                reason.length > 50 && // Ensure detailed reasoning
                !reason.toLowerCase().includes('both mention') && // Filter shallow connections
                !reason.toLowerCase().includes('both discuss') &&
                !reason.toLowerCase().includes('both are about')) {
              
              connections.push({
                contentId: existingAnalyses[index].id,
                strength: strength,
                reason: reason,
                type: 'academic-insight',
                relationship: 'provides-framework'
              });
            } else {
              console.log('Rejected shallow connection:', reason);
            }
          }
        } catch (parseError) {
          console.log('Failed to parse connection line:', line);
        }
      }
    }
    
    console.log('Academically valuable connections found:', connections.length);
    return connections;
    
  } catch (error) {
    console.warn('Academic AI analysis failed:', error);
    return [];
  }
}

  minimalFallbackAnalysis(content) {
    const sentences = content.split(/[.!?]+/).filter(s => s.length > 15);
    const words = content.toLowerCase()
      .split(/\W+/)
      .filter(w => w.length > 3 && !this.isStopWord(w))
      .reduce((freq, word) => {
        freq[word] = (freq[word] || 0) + 1;
        return freq;
      }, {});

    const importantWords = Object.entries(words)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 20)
      .map(([word]) => word);

    const problemIndicators = sentences.filter(s => 
      /\b(problem|issue|challenge|difficult|wrong|bad|fail)/i.test(s)
    );
    const solutionIndicators = sentences.filter(s => 
      /\b(solution|fix|improve|better|should|need to|way to)/i.test(s)
    );

    return {
      coreMessage: sentences[0] || 'Content analysis',
      perspective: problemIndicators.length > solutionIndicators.length ? 'critical' : 'neutral',
      themes: importantWords.slice(0, 4),
      emotionalContext: this.detectBasicEmotion(content),
      problems: problemIndicators.slice(0, 2),
      solutions: solutionIndicators.slice(0, 2),
      assumptions: [],
      implications: importantWords.slice(0, 3),
      contentNature: 'general',
      summary: content.substring(0, 300) + '...'
    };
  }

  minimalFallbackConnections(newContent, existingContents) {
  // Don't generate fake connections - return empty array
  console.log('No AI available and no fallback connections generated');
  return [];
}

  isStopWord(word) {
    const stopWords = ['this', 'that', 'with', 'have', 'will', 'from', 'they', 'been', 'have', 'their', 'said', 'each', 'which', 'than', 'them', 'many', 'some', 'time', 'very', 'when', 'much', 'your'];
    return stopWords.includes(word);
  }

  detectBasicEmotion(content) {
    const lowerContent = content.toLowerCase();
    if (/frustrated|angry|annoying|terrible|awful|hate/i.test(lowerContent)) return 'frustrated';
    if (/excited|amazing|wonderful|love|great|fantastic/i.test(lowerContent)) return 'positive';
    if (/worried|concerned|anxious|scared|nervous/i.test(lowerContent)) return 'concerned';
    if (/curious|interesting|wonder|question|explore/i.test(lowerContent)) return 'curious';
    return 'neutral';
  }

  findOverlap(arr1, arr2) {
    const set1 = new Set(arr1.map(item => item.toLowerCase()));
    return arr2.filter(item => set1.has(item.toLowerCase()));
  }

  categorizeContent(content) {
    if (content.includes('research') || content.includes('study')) return 'Research';
    if (content.includes('tutorial') || content.includes('how to')) return 'Educational';
    if (content.includes('news') || content.includes('breaking')) return 'News';
    return 'General';
  }
}

// Initialize Weaves AI
const weavesAI = new WeavesAI();

// Listen for content updates from tabs
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.type === 'CONTENT_UPDATE') {
    try {
      const tabId = sender.tab.id;
      
      const content = {
        id: tabId + '-' + Date.now(),
        tabId: tabId,
        url: sender.tab.url,
        title: message.title,
        content: message.content,
        domain: message.domain,
        platform: message.platform,
        contentType: message.contentType,
        timestamp: Date.now(),
        analysis: await weavesAI.analyzeContent(message.content)
      };

      weavesAI.contentStore.set(content.id, content);

      const existingContents = Array.from(weavesAI.contentStore.values())
        .filter(c => c.id !== content.id)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 12);

      const connections = await weavesAI.findConnections(content, existingContents);
      
      (Array.isArray(connections) ? connections : []).forEach(conn => {
        const targetContent = weavesAI.contentStore.get(conn.contentId); // Add this line


        weavesAI.connections.push({
            from: content.id,
            to: conn.contentId,
            fromTitle: content.title,                    // Make sure this line exists
            toTitle: targetContent?.title || 'Unknown',  // Make sure this line exists
            fromUrl: content.url,                        // Add if missing
            toUrl: targetContent?.url || '',             // Add if missing
            strength: conn.strength,
            reason: conn.reason,
            type: conn.type,
            relationship: conn.relationship,
            timestamp: Date.now(),
            platforms: `${content.title} → ${targetContent?.title || 'Unknown'}`  // Use actual titles
        });
      });

      await weavesAI.saveData();

      const highQualityConnections = connections.filter(c => c.strength >= 0.75);
      if (highQualityConnections.length > 0) {
        chrome.action.setBadgeText({
          text: highQualityConnections.length.toString(),
          tabId: tabId
        });
        chrome.action.setBadgeBackgroundColor({color: '#4CAF50'});
      }

      sendResponse({success: true, connections: connections.length, highQuality: highQualityConnections.length});
    } catch (error) {
      console.error('Error processing content:', error);
      sendResponse({success: false, error: error.message});
    }
  }

  if (message.type === 'GET_CONNECTIONS') {
  const recentContent = Array.from(weavesAI.contentStore.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 25);
  
  const allConnections = weavesAI.getAllConnections()
    // Remove or extend the time filter
    // .filter(conn => Date.now() - conn.timestamp < 86400000)
    .slice(0, 50);

  sendResponse({
    content: recentContent,
    connections: allConnections
  });
}

  if (message.type === 'PIN_CONNECTION') {
    const success = await weavesAI.pinConnection(message.connectionId);
    sendResponse({success});
  }

  if (message.type === 'UNPIN_CONNECTION') {
    const success = await weavesAI.unpinConnection(message.connectionId);
    sendResponse({success});
  }

  if (message.type === 'GET_STORAGE_STATS') {
    const stats = await weavesAI.storageManager.getStorageStats();
    sendResponse({stats});
  }

  if (message.type === 'DELETE_CONNECTION') {
    try {
      const connectionId = message.connectionId;
      
      // Remove from regular connections
      weavesAI.connections = weavesAI.connections.filter(
        conn => weavesAI.getConnectionId(conn) !== connectionId
      );
      
      // Remove from pinned connections if it exists
      await weavesAI.unpinConnection(connectionId);
      
      // Save updated data
      await weavesAI.saveData();
      
      sendResponse({success: true});
    } catch (error) {
      console.error('Failed to delete connection:', error);
      sendResponse({success: false, error: error.message});
    }
  }

  if (message.type === 'CLEAR_DATA') {
    weavesAI.contentStore.clear();
    weavesAI.connections = [];
    chrome.action.setBadgeText({text: ''});
    await weavesAI.saveData();
    sendResponse({success: true});
  }

  if (message.type === 'PIN_CONNECTION') {
    try {
      const connectionId = message.connectionId;
      console.log('PIN_CONNECTION received for ID:', connectionId);
      
      // Find the connection in the main connections array
      const connection = weavesAI.connections.find(conn => {
        const id = weavesAI.storageManager.generateConnectionId(conn);
        return id === connectionId;
      });
      
      if (connection) {
        // Mark as pinned in main array
        connection.pinned = true;
        
        // Add to pinned storage
        const success = await weavesAI.storageManager.pinConnection(connectionId, connection);
        
        // Save data
        await weavesAI.saveData();
        
        console.log('Pin successful:', success);
        sendResponse({success: true});
      } else {
        console.error('Connection not found for ID:', connectionId);
        sendResponse({success: false, error: 'Connection not found'});
      }
    } catch (error) {
      console.error('Failed to pin connection:', error);
      sendResponse({success: false, error: error.message});
    }
  }

  if (message.type === 'UNPIN_CONNECTION') {
    try {
      const connectionId = message.connectionId;
      console.log('UNPIN_CONNECTION received for ID:', connectionId);
      
      // Find and unmark in main array
      const connection = weavesAI.connections.find(conn => {
        const id = weavesAI.storageManager.generateConnectionId(conn);
        return id === connectionId;
      });
      
      if (connection) {
        connection.pinned = false;
      }
      
      // Remove from pinned storage
      const success = await weavesAI.storageManager.unpinConnection(connectionId);
      
      // Save data
      await weavesAI.saveData();
      
      console.log('Unpin successful:', success);
      sendResponse({success: true});
    } catch (error) {
      console.error('Failed to unpin connection:', error);
      sendResponse({success: false, error: error.message});
    }
  }

  if (message.type === 'DELETE_CONNECTION') {
    try {
      const connectionId = message.connectionId;
      console.log('DELETE_CONNECTION received for ID:', connectionId);
      
      // Remove from main connections array
      const initialLength = weavesAI.connections.length;
      weavesAI.connections = weavesAI.connections.filter(conn => {
        const id = weavesAI.storageManager.generateConnectionId(conn);
        return id !== connectionId;
      });
      
      const wasDeleted = weavesAI.connections.length < initialLength;
      
      // Also remove from pinned if it exists
      await weavesAI.storageManager.unpinConnection(connectionId);
      
      // Save updated data
      await weavesAI.saveData();
      
      console.log('Delete successful:', wasDeleted);
      sendResponse({success: wasDeleted});
    } catch (error) {
      console.error('Failed to delete connection:', error);
      sendResponse({success: false, error: error.message});
    }
  }

  return true; // Keep message channel open for async response
});

// Clean up old data periodically
setInterval(() => {
  const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  
  for (const [id, content] of weavesAI.contentStore.entries()) {
    if (content.timestamp < oneWeekAgo) {
      weavesAI.contentStore.delete(id);
    }
  }
  
  weavesAI.connections = weavesAI.connections.filter(
    conn => conn.timestamp > oneWeekAgo
  );
}, 60000);

console.log('Weaves background service worker loaded');