// LeadPulse AI - Chrome Extension Popup Script

const DEFAULT_API_URL = 'http://localhost:3000';

document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('captureForm');
  const submitBtn = document.getElementById('submitBtn');
  const sourceSelect = document.getElementById('sourceSelect');
  const authorInput = document.getElementById('authorInput');
  const titleInput = document.getElementById('titleInput');
  const urlInput = document.getElementById('urlInput');
  const contentInput = document.getElementById('contentInput');
  const notification = document.getElementById('notification');
  const resultCard = document.getElementById('resultCard');
  const scoreBadge = document.getElementById('scoreBadge');
  const reasoningText = document.getElementById('reasoningText');
  const replyBox = document.getElementById('replyBox');
  const copyReplyBtn = document.getElementById('copyReplyBtn');
  const openThreadBtn = document.getElementById('openThreadBtn');
  const configToggle = document.getElementById('configToggle');
  const configBox = document.getElementById('configBox');
  const apiUrlInput = document.getElementById('apiUrlInput');
  const openDashboardLink = document.getElementById('openDashboardLink');

  // Load API URL from storage
  let apiUrl = DEFAULT_API_URL;
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    const data = await chrome.storage.local.get(['leadpulse_api_url']);
    if (data.leadpulse_api_url) {
      apiUrl = data.leadpulse_api_url;
      apiUrlInput.value = apiUrl;
    }
  } else {
    apiUrl = localStorage.getItem('leadpulse_api_url') || DEFAULT_API_URL;
    apiUrlInput.value = apiUrl;
  }
  openDashboardLink.href = `${apiUrl}/dashboard`;

  apiUrlInput.addEventListener('change', async (e) => {
    apiUrl = e.target.value.trim().replace(/\/$/, '') || DEFAULT_API_URL;
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ leadpulse_api_url: apiUrl });
    } else {
      localStorage.setItem('leadpulse_api_url', apiUrl);
    }
    openDashboardLink.href = `${apiUrl}/dashboard`;
  });

  configToggle.addEventListener('click', () => {
    configBox.style.display = configBox.style.display === 'block' ? 'none' : 'block';
  });

  // Query Active Tab to pre-populate details
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        urlInput.value = tab.url || '';
        titleInput.value = tab.title ? tab.title.replace(/ : [^:]+$/, '').trim() : '';

        // Auto-detect source
        if (tab.url.includes('reddit.com')) {
          sourceSelect.value = 'Reddit';
          const match = tab.url.match(/reddit\.com\/r\/([^/]+)/);
          if (match) {
            titleInput.placeholder = `[r/${match[1]}] ...`;
          }
        } else if (tab.url.includes('linkedin.com')) {
          sourceSelect.value = 'LinkedIn';
        } else if (tab.url.includes('twitter.com') || tab.url.includes('x.com')) {
          sourceSelect.value = 'Twitter';
        } else if (tab.url.includes('upwork.com')) {
          sourceSelect.value = 'Upwork';
        } else if (tab.url.includes('instagram.com')) {
          sourceSelect.value = 'Instagram';
        }

        // Get highlighted/selected text and metadata from page
        if (chrome.scripting && tab.id) {
          try {
            const results = await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: () => {
                const selection = window.getSelection().toString().trim();
                let author = '';
                let title = '';

                // Reddit selectors
                const redditAuthor = document.querySelector('shreddit-post')?.getAttribute('author') ||
                                     document.querySelector('a[data-testid="post_author_link"]')?.innerText;
                // LinkedIn author selector
                const linkedinAuthor = document.querySelector('.update-components-actor__name')?.innerText;

                // Upwork selectors
                const upworkTitle = document.querySelector('[data-test="job-title"], h1, h2')?.innerText;
                const upworkClient = document.querySelector('[data-test="client-spend"], [data-test="client-history"]')?.innerText;

                // Instagram selectors
                const igAuthor = document.querySelector('header a, a[role="link"]')?.innerText;

                author = redditAuthor || linkedinAuthor || (upworkClient ? `Upwork Client` : '') || igAuthor || '';
                title = upworkTitle || '';
                return { selection, author, title };
              }
            });

            if (results && results[0] && results[0].result) {
              const { selection, author, title } = results[0].result;
              if (selection) contentInput.value = selection;
              if (author) authorInput.value = author.trim();
              if (title && !titleInput.value) titleInput.value = title.trim();
            }
          } catch (err) {
            console.log('Script injection info:', err);
          }
        }
      }
    } catch (e) {
      console.warn('Could not query active tab:', e);
    }
  }

  function showNotification(msg, type = 'success') {
    notification.textContent = msg;
    notification.className = `notification ${type}`;
    notification.style.display = 'block';
    setTimeout(() => {
      notification.style.display = 'none';
    }, 4500);
  }

  let currentLeadResult = null;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const payload = {
      source: sourceSelect.value,
      title: titleInput.value.trim(),
      url: urlInput.value.trim(),
      content: contentInput.value.trim(),
      author: authorInput.value.trim() || undefined
    };

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>⏳ Analyzing with Groq AI...</span>';
    resultCard.style.display = 'none';

    try {
      const response = await fetch(`${apiUrl}/api/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Server responded with ${response.status}`);
      }

      currentLeadResult = data.lead || data;
      showNotification(data.message || 'Lead ingested & scored successfully!', 'success');

      // Update Result Card
      const score = currentLeadResult.intentScore ?? 0;
      scoreBadge.textContent = `Intent Score: ${score}/100`;
      scoreBadge.className = 'score-badge ' + (score >= 70 ? 'score-high' : score >= 40 ? 'score-med' : 'score-low');

      reasoningText.textContent = currentLeadResult.reasoning || 'No analysis reasoning returned.';
      replyBox.textContent = currentLeadResult.suggestedReply || 'No reply generated.';

      resultCard.style.display = 'block';
    } catch (error) {
      console.error(error);
      showNotification(`Ingestion failed: ${error.message}`, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>⚡ Capture & Score with AI</span>';
    }
  });

  copyReplyBtn.addEventListener('click', async () => {
    if (!currentLeadResult || !currentLeadResult.suggestedReply) return;
    try {
      await navigator.clipboard.writeText(currentLeadResult.suggestedReply);
      const originalText = copyReplyBtn.textContent;
      copyReplyBtn.textContent = '✅ Copied!';
      setTimeout(() => { copyReplyBtn.textContent = originalText; }, 2000);
    } catch (err) {
      showNotification('Failed to copy to clipboard', 'error');
    }
  });

  openThreadBtn.addEventListener('click', () => {
    const url = urlInput.value.trim();
    if (url) {
      window.open(url, '_blank');
    }
  });
});
