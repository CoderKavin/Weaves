// Weaves Content Script - Extracts content from web pages
class WeavesContentExtractor {
  constructor() {
    this.lastContent = '';
    this.extractionDelay = 2000; // Wait 2 seconds after page load
    this.isOverlayVisible = false;
    this.setupExtractor();
  }

  setupExtractor() {
    // Wait for page to load, then extract content
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => this.extractAndSend(), this.extractionDelay);
      });
    } else {
      setTimeout(() => this.extractAndSend(), this.extractionDelay);
    }

    // Listen for dynamic content changes
    this.setupContentObserver();
    
    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'SHOW_CONNECTIONS') {
        this.showConnectionsOverlay(message.data);
        sendResponse({success: true});
      }
      if (message.type === 'HIDE_CONNECTIONS') {
        this.hideConnectionsOverlay();
        sendResponse({success: true});
      }
      return true;
    });
  }

  extractContent() {
    // Remove script and style elements
    const scripts = document.querySelectorAll('script, style, noscript');
    scripts.forEach(el => el.remove());

    let content = '';
    let title = document.title || '';
    const url = window.location.href;
    const domain = window.location.hostname;

    // Detect content type and extract accordingly
    const contentType = this.detectContentType(url, domain, document);
    
    switch (contentType.type) {
      case 'youtube':
        content = this.extractYouTubeContent();
        break;
      case 'email':
        content = this.extractEmailContent();
        break;
      case 'social':
        content = this.extractSocialContent();
        break;
      case 'document':
        content = this.extractDocumentContent();
        break;
      case 'forum':
        content = this.extractForumContent();
        break;
      case 'news':
        content = this.extractNewsContent();
        break;
      default:
        content = this.extractGeneralContent();
    }

    // Extract metadata
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      content = metaDescription.getAttribute('content') + ' ' + content;
    }

    // Add page context
    const context = this.extractPageContext();
    if (context) {
      content = context + ' ' + content;
    }

    // Clean and limit content
    content = content
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 8000); // Increased limit for richer content

    return {
      title: title.substring(0, 200),
      content: content,
      url: url,
      domain: domain,
      contentType: contentType.type,
      platform: contentType.platform
    };
  }

  detectContentType(url, domain, document) {
    // YouTube
    if (domain.includes('youtube.com') || domain.includes('youtu.be')) {
      return { type: 'youtube', platform: 'YouTube' };
    }
    
    // Email platforms
    if (domain.includes('gmail.com') || domain.includes('outlook.') || 
        domain.includes('yahoo.com') || domain.includes('protonmail.com') ||
        document.querySelector('[role="main"][aria-label*="mail" i]')) {
      return { type: 'email', platform: 'Email' };
    }
    
    // Social media
    if (domain.includes('twitter.com') || domain.includes('x.com')) {
      return { type: 'social', platform: 'Twitter/X' };
    }
    if (domain.includes('linkedin.com')) {
      return { type: 'social', platform: 'LinkedIn' };
    }
    if (domain.includes('reddit.com')) {
      return { type: 'forum', platform: 'Reddit' };
    }
    if (domain.includes('facebook.com')) {
      return { type: 'social', platform: 'Facebook' };
    }
    
    // Document platforms
    if (domain.includes('docs.google.com') || domain.includes('drive.google.com')) {
      return { type: 'document', platform: 'Google Docs' };
    }
    if (domain.includes('notion.so') || domain.includes('notion.com')) {
      return { type: 'document', platform: 'Notion' };
    }
    
    // News and articles
    if (document.querySelector('article') || document.querySelector('.article') ||
        document.querySelector('[role="article"]')) {
      return { type: 'news', platform: 'Article' };
    }
    
    return { type: 'general', platform: 'Web Page' };
  }

  extractYouTubeContent() {
    let content = '';
    
    // Video title
    const title = document.querySelector('#title h1, .title');
    if (title) content += title.textContent + '. ';
    
    // Description
    const description = document.querySelector('#description, .description, #meta-contents');
    if (description) content += description.textContent + '. ';
    
    // Comments (top few for context)
    const comments = document.querySelectorAll('#content-text, .comment-text');
    const topComments = Array.from(comments).slice(0, 5);
    topComments.forEach(comment => {
      if (comment.textContent.length > 20) {
        content += comment.textContent + '. ';
      }
    });
    
    // Channel info
    const channel = document.querySelector('#channel-name, .channel-name');
    if (channel) content += `Channel: ${channel.textContent}. `;
    
    return content;
  }

  extractEmailContent() {
    let content = '';
    
    // Email subject
    const subject = document.querySelector('[data-legacy-thread-id] h2, .subject, [aria-label*="subject" i]');
    if (subject) content += `Subject: ${subject.textContent}. `;
    
    // Email body
    const emailBody = document.querySelector('[role="listitem"] [dir="ltr"], .email-body, [data-message-id]');
    if (emailBody) {
      content += this.extractTextFromElement(emailBody);
    } else {
      // Fallback for different email layouts
      const bodySelectors = [
        '[aria-label*="message" i]',
        '.message-body',
        '[role="main"] div[dir="ltr"]',
        '.email-content'
      ];
      
      for (const selector of bodySelectors) {
        const element = document.querySelector(selector);
        if (element) {
          content += this.extractTextFromElement(element);
          break;
        }
      }
    }
    
    return content;
  }

  extractSocialContent() {
    let content = '';
    
    // Twitter/X posts
    const tweets = document.querySelectorAll('[data-testid="tweet"], .tweet, [aria-label*="tweet" i]');
    tweets.forEach(tweet => {
      const text = tweet.querySelector('[data-testid="tweetText"], .tweet-text');
      if (text) content += text.textContent + '. ';
    });
    
    // LinkedIn posts
    const linkedinPosts = document.querySelectorAll('.feed-shared-update-v2, .occludable-update');
    linkedinPosts.forEach(post => {
      const text = post.querySelector('.break-words, .feed-shared-text');
      if (text) content += text.textContent + '. ';
    });
    
    // Facebook posts
    const fbPosts = document.querySelectorAll('[data-pagelet*="FeedUnit"], .userContent');
    fbPosts.forEach(post => {
      content += this.extractTextFromElement(post) + '. ';
    });
    
    return content;
  }

  extractForumContent() {
    let content = '';
    
    // Reddit
    if (window.location.hostname.includes('reddit.com')) {
      // Post title
      const title = document.querySelector('[data-click-id="body"] h1, .title');
      if (title) content += title.textContent + '. ';
      
      // Post content
      const postContent = document.querySelector('[data-click-id="text"], .usertext-body');
      if (postContent) content += this.extractTextFromElement(postContent) + '. ';
      
      // Top comments
      const comments = document.querySelectorAll('.Comment, [data-click-id="body"] .md');
      Array.from(comments).slice(0, 3).forEach(comment => {
        content += this.extractTextFromElement(comment) + '. ';
      });
    }
    
    return content;
  }

  extractDocumentContent() {
    let content = '';
    
    // Google Docs
    if (window.location.hostname.includes('docs.google.com')) {
      const docContent = document.querySelector('.kix-page, .doc-content');
      if (docContent) content += this.extractTextFromElement(docContent);
    }
    
    // Notion
    if (window.location.hostname.includes('notion.')) {
      const notionContent = document.querySelector('.notion-page-content, [data-block-id]');
      if (notionContent) content += this.extractTextFromElement(notionContent);
    }
    
    return content;
  }

  extractNewsContent() {
    let content = '';
    
    // Article content
    const articleSelectors = [
      'article',
      '.article-content',
      '.post-content',
      '.entry-content',
      '[role="article"]',
      '.story-body'
    ];
    
    for (const selector of articleSelectors) {
      const article = document.querySelector(selector);
      if (article) {
        content += this.extractTextFromElement(article);
        break;
      }
    }
    
    return content;
  }

  extractGeneralContent() {
    // Try to find main content areas
    const contentSelectors = [
      'main',
      'article',
      '[role="main"]',
      '.content',
      '.main-content',
      '#content',
      '.post-content',
      '.entry-content'
    ];

    let mainContent = null;
    for (const selector of contentSelectors) {
      mainContent = document.querySelector(selector);
      if (mainContent) break;
    }

    if (mainContent) {
      return this.extractTextFromElement(mainContent);
    } else {
      // Fallback to body content
      return this.extractTextFromElement(document.body);
    }
  }

  extractPageContext() {
    // Extract additional context clues
    let context = '';
    
    // Navigation breadcrumbs
    const breadcrumbs = document.querySelector('.breadcrumb, .breadcrumbs, nav[aria-label*="bread" i]');
    if (breadcrumbs) {
      context += `Context: ${breadcrumbs.textContent.replace(/\s+/g, ' ').trim()}. `;
    }
    
    // Page headings
    const mainHeading = document.querySelector('h1');
    if (mainHeading && !context.includes(mainHeading.textContent)) {
      context += `Main topic: ${mainHeading.textContent}. `;
    }
    
    return context;
  }

  extractTextFromElement(element) {
    // Skip elements that are likely not content
    const skipSelectors = [
      'nav', 'header', 'footer', 'aside', 
      '.navigation', '.menu', '.sidebar',
      '.advertisement', '.ads', '.social',
      '[aria-hidden="true"]'
    ];

    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          
          // Skip hidden elements
          if (parent.offsetParent === null) return NodeFilter.FILTER_REJECT;
          
          // Skip navigation and other non-content areas
          for (const selector of skipSelectors) {
            if (parent.closest(selector)) return NodeFilter.FILTER_REJECT;
          }
          
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let text = '';
    let node;
    while (node = walker.nextNode()) {
      text += node.textContent + ' ';
    }

    return text;
  }

  async extractAndSend() {
    try {
      const extracted = this.extractContent();
      
      // Only send if content has changed significantly or is substantial
      if (extracted.content.length < 100) return; // Skip very short content
      
      if (this.contentSimilarity(extracted.content, this.lastContent) < 0.8) {
        this.lastContent = extracted.content;
        
        const response = await chrome.runtime.sendMessage({
          type: 'CONTENT_UPDATE',
          title: extracted.title,
          content: extracted.content,
          url: extracted.url,
          domain: extracted.domain,
          platform: extracted.platform,
          contentType: extracted.contentType
        });
        
        if (response && response.highQuality > 0) {
          this.showConnectionNotification(response.highQuality, true);
        } else if (response && response.connections > 0) {
          this.showConnectionNotification(response.connections, false);
        }
      }
    } catch (error) {
      console.warn('Weaves: Failed to extract content:', error);
    }
  }

  contentSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    const set1 = new Set(str1.toLowerCase().split(/\s+/));
    const set2 = new Set(str2.toLowerCase().split(/\s+/));
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    return intersection.size / union.size;
  }

  setupContentObserver() {
    // Observe dynamic content changes
    const observer = new MutationObserver((mutations) => {
      let shouldReextract = false;
      
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // Check if significant content was added
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE && 
                node.textContent && 
                node.textContent.length > 100) {
              shouldReextract = true;
              break;
            }
          }
        }
      }
      
      if (shouldReextract) {
        setTimeout(() => this.extractAndSend(), 1000);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false
    });
  }

  showConnectionNotification(count, isHighQuality = false) {
    // Create a more intelligent notification
    const notification = document.createElement('div');
    notification.id = 'weaves-notification';
    
    const emoji = isHighQuality ? '🤯' : '🕸️';
    const quality = isHighQuality ? 'breakthrough' : 'new';
    const color = isHighQuality ? 'linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%)' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    
    notification.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${color};
        color: white;
        padding: 12px 16px;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        animation: weavesSlideIn 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        border: 1px solid rgba(255,255,255,0.2);
      ">
        ${emoji} Found ${count} ${quality} insight${count > 1 ? 's' : ''}!
        <div style="font-size: 11px; opacity: 0.9; margin-top: 2px;">
          Click to explore
        </div>
      </div>
    `;

    // Enhanced animation styles
    if (!document.getElementById('weaves-styles')) {
      const styles = document.createElement('style');
      styles.id = 'weaves-styles';
      styles.textContent = `
        @keyframes weavesSlideIn {
          from { 
            transform: translateX(100%) scale(0.8); 
            opacity: 0; 
          }
          to { 
            transform: translateX(0) scale(1); 
            opacity: 1; 
          }
        }
        @keyframes weavesSlideOut {
          from { 
            transform: translateX(0) scale(1); 
            opacity: 1; 
          }
          to { 
            transform: translateX(100%) scale(0.8); 
            opacity: 0; 
          }
        }
        @keyframes weavesGlow {
          0%, 100% { box-shadow: 0 4px 20px rgba(0,0,0,0.2); }
          50% { box-shadow: 0 4px 30px rgba(0,0,0,0.3), 0 0 20px rgba(255,255,255,0.1); }
        }
      `;
      document.head.appendChild(styles);
    }

    document.body.appendChild(notification);

    // Add glow effect for high quality connections
    if (isHighQuality) {
      notification.firstElementChild.style.animation += ', weavesGlow 2s infinite';
    }

    // Click to open popup (try to focus extension)
    notification.addEventListener('click', async () => {
      try {
        await chrome.runtime.sendMessage({type: 'OPEN_POPUP'});
      } catch (e) {
        // Fallback - just remove notification
        console.log('Click detected - open Weaves extension to see insights');
      }
    });

    // Auto-hide with longer duration for high-quality insights
    const hideAfter = isHighQuality ? 6000 : 4000;
    setTimeout(() => {
      if (notification.parentNode) {
        notification.firstElementChild.style.animation = 'weavesSlideOut 0.3s ease-in';
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
        }, 300);
      }
    }, hideAfter);
  }

  showConnectionsOverlay(data) {
    if (this.isOverlayVisible) return;
    
    this.isOverlayVisible = true;
    
    // Create overlay iframe
    const overlay = document.createElement('iframe');
    overlay.id = 'weaves-overlay';
    overlay.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      border: none !important;
      z-index: 2147483647 !important;
      background: rgba(0,0,0,0.8) !important;
      pointer-events: auto !important;
    `;
    
    // Create the overlay content
    const overlayContent = this.createOverlayHTML(data);
    overlay.srcdoc = overlayContent;
    
    document.body.appendChild(overlay);
    
    // Close on escape key
    const closeHandler = (e) => {
      if (e.key === 'Escape') {
        this.hideConnectionsOverlay();
        document.removeEventListener('keydown', closeHandler);
      }
    };
    document.addEventListener('keydown', closeHandler);
  }

  createOverlayHTML(data) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js"></script>
        <style>
          body { 
            margin: 0; 
            padding: 20px; 
            background: rgba(0,0,0,0.9); 
            color: white; 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            overflow: hidden;
          }
          .close-btn {
            position: absolute;
            top: 20px;
            right: 20px;
            background: none;
            border: 2px solid white;
            color: white;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
          }
          .close-btn:hover { background: rgba(255,255,255,0.1); }
          #visualization { 
            width: 100%; 
            height: calc(100vh - 40px); 
          }
          .node { cursor: pointer; }
          .link { stroke: #999; stroke-opacity: 0.6; }
          .tooltip {
            position: absolute;
            padding: 8px;
            background: rgba(0,0,0,0.8);
            border: 1px solid #666;
            border-radius: 4px;
            pointer-events: none;
            opacity: 0;
          }
        </style>
      </head>
      <body>
        <button class="close-btn" onclick="parent.postMessage('close-overlay', '*')">✕ Close</button>
        <div id="visualization"></div>
        <div class="tooltip" id="tooltip"></div>
        
        <script>
          const data = ${JSON.stringify(data)};
          
          // Create force-directed graph
          const width = window.innerWidth - 40;
          const height = window.innerHeight - 40;
          
          const svg = d3.select("#visualization")
            .append("svg")
            .attr("width", width)
            .attr("height", height);
            
          const simulation = d3.forceSimulation()
            .force("link", d3.forceLink().id(d => d.id).distance(100))
            .force("charge", d3.forceManyBody().strength(-300))
            .force("center", d3.forceCenter(width / 2, height / 2));
            
          // Process data into nodes and links
          const nodes = data.content.map(c => ({
            id: c.id,
            title: c.title,
            category: c.analysis?.category || 'General',
            url: c.url
          }));
          
          const links = data.connections.map(c => ({
            source: c.from,
            target: c.to,
            strength: c.strength,
            reason: c.reason,
            type: c.type
          }));
          
          // Color scale for categories
          const color = d3.scaleOrdinal(d3.schemeCategory10);
          
          // Create links
          const link = svg.append("g")
            .selectAll("line")
            .data(links)
            .enter().append("line")
            .attr("class", "link")
            .attr("stroke-width", d => Math.sqrt(d.strength * 5));
            
          // Create nodes
          const node = svg.append("g")
            .selectAll("circle")
            .data(nodes)
            .enter().append("circle")
            .attr("class", "node")
            .attr("r", 8)
            .attr("fill", d => color(d.category))
            .call(d3.drag()
              .on("start", dragstarted)
              .on("drag", dragged)
              .on("end", dragended));
              
          // Add labels
          const label = svg.append("g")
            .selectAll("text")
            .data(nodes)
            .enter().append("text")
            .text(d => d.title.substring(0, 30) + (d.title.length > 30 ? '...' : ''))
            .attr("font-size", "10px")
            .attr("dx", 12)
            .attr("dy", 4)
            .attr("fill", "white");
            
          simulation
            .nodes(nodes)
            .on("tick", ticked);
            
          simulation.force("link")
            .links(links);
            
          function ticked() {
            link
              .attr("x1", d => d.source.x)
              .attr("y1", d => d.source.y)
              .attr("x2", d => d.target.x)
              .attr("y2", d => d.target.y);
              
            node
              .attr("cx", d => d.x)
              .attr("cy", d => d.y);
              
            label
              .attr("x", d => d.x)
              .attr("y", d => d.y);
          }
          
          function dragstarted(event, d) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          }
          
          function dragged(event, d) {
            d.fx = event.x;
            d.fy = event.y;
          }
          
          function dragended(event, d) {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }
          
          // Tooltip
          const tooltip = d3.select("#tooltip");
          
          node.on("mouseover", function(event, d) {
            tooltip.transition().duration(200).style("opacity", .9);
            tooltip.html(d.title + "<br/>Category: " + d.category)
              .style("left", (event.pageX + 10) + "px")
              .style("top", (event.pageY - 28) + "px");
          })
          .on("mouseout", function(d) {
            tooltip.transition().duration(500).style("opacity", 0);
          });
          
          // Handle messages from parent
          window.addEventListener('message', function(event) {
            if (event.data === 'close-overlay') {
              window.parent.postMessage('close-overlay-confirmed', '*');
            }
          });
        </script>
      </body>
      </html>
    `;
  }

  hideConnectionsOverlay() {
    const overlay = document.getElementById('weaves-overlay');
    if (overlay) {
      overlay.remove();
      this.isOverlayVisible = false;
    }
  }
}

// Handle messages from overlay
window.addEventListener('message', function(event) {
  if (event.data === 'close-overlay-confirmed') {
    const extractor = window.weavesExtractor;
    if (extractor) {
      extractor.hideConnectionsOverlay();
    }
  }
});

// Initialize content extractor
if (!window.weavesExtractor) {
  window.weavesExtractor = new WeavesContentExtractor();
}

console.log('Weaves content script loaded on:', window.location.href);