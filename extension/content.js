// LeadPulse AI - Multi-Platform Content Script
// Injected on Reddit, LinkedIn, and X (Twitter) to extract context and insert AI replies

(() => {
  const DEFAULT_API_URL = "http://localhost:3000";

  function showToast(message, isError = false) {
    let toast = document.getElementById("leadpulse-global-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "leadpulse-global-toast";
      toast.className = "leadpulse-toast";
      document.body.appendChild(toast);
    }
    toast.innerHTML = `
      <span class="leadpulse-toast-badge" style="background: ${isError ? "#ef4444" : "#10b981"};"></span>
      <span>${message}</span>
    `;
    toast.classList.add("show");
    setTimeout(() => {
      toast.classList.remove("show");
    }, 4500);
  }

  function getBaseApiUrl(callback) {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(["leadpulse_api_url"], (res) => {
        callback(res.leadpulse_api_url || DEFAULT_API_URL);
      });
    } else {
      callback(DEFAULT_API_URL);
    }
  }

  // Detect current platform
  function detectPlatform() {
    const host = window.location.hostname.toLowerCase();
    if (host.includes("reddit.com")) return "Reddit";
    if (host.includes("linkedin.com")) return "LinkedIn";
    if (host.includes("twitter.com") || host.includes("x.com")) return "Twitter";
    if (host.includes("upwork.com")) return "Upwork";
    if (host.includes("instagram.com")) return "Instagram";
    return "Web";
  }

  // Extract contextual post title, body, and author from page
  function extractContext() {
    const platform = detectPlatform();
    let title = "";
    let content = "";
    let author = "";
    let url = window.location.href;

    if (platform === "Reddit") {
      const h1 = document.querySelector("h1");
      if (h1) title = h1.innerText.trim();

      const shredditPost = document.querySelector("shreddit-post");
      if (shredditPost) {
        title = title || shredditPost.getAttribute("post-title") || "";
        author = shredditPost.getAttribute("author") || "";
        const permalink = shredditPost.getAttribute("permalink");
        if (permalink) url = `https://www.reddit.com${permalink}`;
        const bodySlot =
          shredditPost.querySelector('[slot="text-body"]') ||
          shredditPost.querySelector('div[id*="-post-rtjson-content"]');
        if (bodySlot) content = bodySlot.innerText.trim();
      }

      if (!content) {
        const postContent =
          document.querySelector('[data-test-id="post-content"]') ||
          document.querySelector(".usertext-body");
        if (postContent) content = postContent.innerText.trim();
        const postAnchor = document.querySelector('a[data-click-id="body"], a[data-testid="post-title"]');
        if (postAnchor?.href && postAnchor.href.includes("/comments/")) url = postAnchor.href;
      }
    } else if (platform === "LinkedIn") {
      const activePost =
        document.querySelector(".feed-shared-update-v2") ||
        document.querySelector(".feed-shared-update") ||
        document.querySelector(".feed-shared-poll");

      if (activePost) {
        const textElement =
          activePost.querySelector(".feed-shared-update-v2__description") ||
          activePost.querySelector(".feed-shared-text") ||
          activePost.querySelector(".feed-shared-inline-show-more-text");
        if (textElement) content = textElement.innerText.trim();

        const authorElement = activePost.querySelector(".update-components-actor__name");
        if (authorElement) {
          author = authorElement.innerText.trim();
          title = `LinkedIn Post by ${author}`;
        }

        // Direct permalink extraction from data-urn or post link
        const urn = activePost.getAttribute("data-urn") || activePost.getAttribute("data-id");
        if (urn && urn.includes("urn:li:activity:")) {
          url = `https://www.linkedin.com/feed/update/${urn}/`;
        } else {
          const directAnchor = activePost.querySelector('a[href*="/posts/"], a[href*="/feed/update/"], a[href*="/pulse/"]');
          if (directAnchor?.href) url = directAnchor.href;
        }
      }

      // If still on search page, attempt finding first valid post permalink
      if (url.includes("/search/results/") || url.includes("/search/")) {
        const directAnchor = document.querySelector('a[href*="/posts/"], a[href*="/feed/update/"], a[href*="/pulse/"]');
        if (directAnchor && directAnchor.getAttribute("href")) {
          const href = directAnchor.getAttribute("href");
          url = href.startsWith("http") ? href : `https://www.linkedin.com${href}`;
        }
      }

      if (!title) title = document.title;
    } else if (platform === "Twitter") {
      // X / Twitter active tweet extraction
      const mainTweet =
        document.querySelector('article[data-testid="tweet"]') ||
        document.querySelector('[data-testid="tweetText"]')?.closest("article");

      if (mainTweet) {
        const tweetTextEl = mainTweet.querySelector('[data-testid="tweetText"]');
        if (tweetTextEl) content = tweetTextEl.innerText.trim();

        const userEl = mainTweet.querySelector('[data-testid="User-Name"]');
        if (userEl) {
          author = userEl.innerText.replace(/\n+/g, " ").trim();
          title = `Tweet from ${author}`;
        }

        // Direct tweet status URL extraction
        const statusAnchor = mainTweet.querySelector('a[href*="/status/"]');
        if (statusAnchor) {
          const href = statusAnchor.getAttribute("href");
          url = href.startsWith("http") ? href : `https://x.com${href}`;
        }
      }

      if (!title) title = document.title.replace(/\s*\/ X$/, "");
    } else if (platform === "Upwork") {
      const jobTitleEl = document.querySelector('h1, h2, [data-test="job-title"], .job-details-title');
      if (jobTitleEl) title = jobTitleEl.innerText.trim();
      const descEl = document.querySelector('[data-test="job-description"], .job-description, .description');
      if (descEl) content = descEl.innerText.trim();
      const clientEl = document.querySelector('[data-test="client-spend"], [data-test="client-history"]');
      if (clientEl) author = `Upwork Client (${clientEl.innerText.trim().slice(0, 30)})`;
      if (!title) title = document.title.replace(/\s*-\s*Upwork$/, "");
    } else if (platform === "Instagram") {
      const captionEl = document.querySelector('article div[role="button"] ~ span, h1, [data-testid="post-comment-root"]');
      if (captionEl) content = captionEl.innerText.trim();
      const authorEl = document.querySelector('header a, a[role="link"]');
      if (authorEl) author = authorEl.innerText.trim();
      title = author ? `Instagram Post by ${author}` : document.title;
      if (!title) title = document.title;
    }

    // Fallback if empty: grab selection or title
    if (!content) {
      content = window.getSelection().toString().trim() || title || document.title;
    }

    function sanitizeText(raw) {
      if (!raw) return "";
      return String(raw)
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<[^>]*>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#x2F;/g, "/")
        .replace(/\s+/g, " ")
        .trim();
    }

    return {
      platform,
      title: sanitizeText(title || document.title),
      content: sanitizeText(content || title || document.title),
      author: sanitizeText(author || ""),
      url,
    };
  }

  // Insert generated text into target input element
  function insertTextIntoInput(inputEl, text) {
    if (!inputEl) return;

    if (inputEl.isContentEditable || inputEl.getAttribute("contenteditable") === "true") {
      inputEl.focus();
      // Use document.execCommand for rich text editors (Draft.js, Lexical, Twitter editor)
      const success = document.execCommand("insertText", false, text);
      if (!success) {
        inputEl.innerText = (inputEl.innerText ? inputEl.innerText + "\n\n" : "") + text;
      }
      inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      inputEl.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      inputEl.focus();
      const start = inputEl.selectionStart || 0;
      const end = inputEl.selectionEnd || 0;
      const val = inputEl.value || "";
      inputEl.value = val.substring(0, start) + text + val.substring(end);
      inputEl.selectionStart = inputEl.selectionEnd = start + text.length;
      inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      inputEl.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  async function handleGenerateClick(btn, inputEl) {
    const originalText = btn.innerHTML;
    btn.innerHTML = "✨ Generating AI Reply...";
    btn.classList.add("leadpulse-loading");

    getBaseApiUrl(async (apiUrl) => {
      const context = extractContext();
      try {
        const response = await fetch(`${apiUrl}/api/ingest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: context.platform,
            title: context.title,
            content: context.content,
            author: context.author,
            url: context.url,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Server error");
        }

        // Pick platform-specific pitch if available
        let reply = "";
        const lead = data.lead;
        if (lead) {
          if (context.platform === "Twitter" && lead.pitches?.quickHook) {
            reply = lead.pitches.quickHook;
          } else if (lead.pitches?.valuePitch) {
            reply = lead.pitches.valuePitch;
          } else {
            reply = lead.suggestedReply;
          }
        } else {
          reply = data.suggestedReply || "";
        }

        if (!reply) {
          throw new Error("No suggested reply returned");
        }

        insertTextIntoInput(inputEl, reply);

        // Copy to clipboard
        try {
          await navigator.clipboard.writeText(reply);
        } catch (e) {
          console.warn("Clipboard write fallback", e);
        }

        const score = data.lead?.intentScore ?? 0;
        showToast(
          `✨ [${context.platform}] AI Reply inserted (${score}% Intent) & copied to clipboard!`
        );
      } catch (err) {
        console.error("LeadPulse generation error:", err);
        showToast(`Error: ${err.message}. Is LeadPulse server running?`, true);
      } finally {
        btn.innerHTML = originalText;
        btn.classList.remove("leadpulse-loading");
      }
    });
  }

  function attachButtons() {
    const platform = detectPlatform();

    // 1. Reddit Selectors
    if (platform === "Reddit") {
      const redditEditors = document.querySelectorAll(
        'shreddit-comment-composer, [data-testid="comment-top-level"], div[contenteditable="true"][aria-label*="comment" i], textarea[name="comment"]'
      );

      redditEditors.forEach((composer) => {
        if (composer.dataset.leadpulseAttached) return;

        const targetInput = composer.matches('textarea, div[contenteditable="true"]')
          ? composer
          : composer.querySelector('textarea, div[contenteditable="true"], [slot="rte"]');

        if (targetInput) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "leadpulse-ai-btn";
          btn.innerHTML = "✨ Insert AI Reply";
          btn.title = "LeadPulse AI: Generate contextual non-spammy response";
          btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleGenerateClick(btn, targetInput);
          });

          composer.dataset.leadpulseAttached = "true";
          composer.parentElement?.insertBefore(btn, composer.nextSibling);
        }
      });
    }

    // 2. LinkedIn Selectors
    if (platform === "LinkedIn") {
      const linkedinBoxes = document.querySelectorAll(
        '.comments-comment-box, .comments-comment-texteditor, div[contenteditable="true"][aria-label*="comment" i]'
      );

      linkedinBoxes.forEach((box) => {
        if (box.dataset.leadpulseAttached) return;

        const targetInput = box.matches('div[contenteditable="true"]')
          ? box
          : box.querySelector('div[contenteditable="true"], .ql-editor');

        if (targetInput) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "leadpulse-ai-btn";
          btn.innerHTML = "✨ Insert AI Reply";
          btn.title = "LeadPulse AI: Generate consultative B2B response";
          btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleGenerateClick(btn, targetInput);
          });

          box.dataset.leadpulseAttached = "true";
          const actionsContainer = box.querySelector(".comments-comment-box__buttons") || box;
          actionsContainer.appendChild(btn);
        }
      });
    }

    // 3. Twitter / X Selectors
    if (platform === "Twitter") {
      const tweetTextareas = document.querySelectorAll(
        '[data-testid="tweetTextarea_0"], div[role="textbox"][data-testid*="tweetTextarea"]'
      );

      tweetTextareas.forEach((textarea) => {
        if (textarea.dataset.leadpulseAttached) return;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "leadpulse-ai-btn";
        btn.innerHTML = "✨ Insert X Hook";
        btn.title = "LeadPulse AI: Generate punchy <280 char hook";
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          handleGenerateClick(btn, textarea);
        });

        textarea.dataset.leadpulseAttached = "true";

        // Find toolbar container or place right next to tweet composer
        const toolbar = textarea.closest('[data-testid="toolBar"]') || textarea.parentElement;
        if (toolbar) {
          toolbar.appendChild(btn);
        } else {
          textarea.insertAdjacentElement("afterend", btn);
        }
      });
    }

    // 4. Upwork Proposal Selectors
    if (platform === "Upwork") {
      const coverLetterBoxes = document.querySelectorAll(
        'textarea#coverLetter, textarea[aria-labelledby*="cover_letter" i], textarea[data-test="proposal-cover-letter"], textarea[name="coverLetter"]'
      );

      coverLetterBoxes.forEach((textarea) => {
        if (textarea.dataset.leadpulseAttached) return;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "leadpulse-ai-btn";
        btn.innerHTML = "✨ Generate Proposal Pitch";
        btn.title = "LeadPulse AI: Draft winning Upwork proposal";
        btn.style.margin = "8px 0";
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          handleGenerateClick(btn, textarea);
        });

        textarea.dataset.leadpulseAttached = "true";
        textarea.parentElement?.insertBefore(btn, textarea);
      });
    }

    // 5. Instagram Selectors
    if (platform === "Instagram") {
      const igInputs = document.querySelectorAll(
        'textarea[aria-label*="comment" i], div[contenteditable="true"][role="textbox"], textarea[placeholder*="message" i]'
      );

      igInputs.forEach((inputEl) => {
        if (inputEl.dataset.leadpulseAttached) return;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "leadpulse-ai-btn";
        btn.innerHTML = "✨ Insert AI Reply";
        btn.title = "LeadPulse AI: Generate contextual Instagram reply";
        btn.style.margin = "4px 0";
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          handleGenerateClick(btn, inputEl);
        });

        inputEl.dataset.leadpulseAttached = "true";
        inputEl.parentElement?.appendChild(btn);
      });
    }
  }

  // Periodic check for dynamically mounted comment inputs
  setInterval(attachButtons, 2000);
  setTimeout(attachButtons, 1000);
})();
