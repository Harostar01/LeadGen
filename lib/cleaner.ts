/**
 * LeadPulse AI - Text & URL Cleaning Utility
 * Handles HTML stripping, entity unescaping, LinkedIn URL normalization/validation,
 * and X (Twitter) search recency query generation.
 */

/**
 * Strips HTML comments, HTML tags, and unescapes all common HTML entities.
 * Specifically removes Reddit artifacts like `<!-- SC_OFF -->`, tags like `<p>`, `<div>`, `<ul>`,
 * and converts entities like `&amp;`, `&#39;`, `&quot;`, `&lt;`, `&gt;`, `&#x2F;`.
 */
export function cleanLeadText(rawText: string | null | undefined): string {
  if (!rawText) return "";

  let cleaned = String(rawText);

  // 1. Strip HTML comments (e.g. <!-- SC_OFF -->, <!-- SC_ON -->)
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, " ");

  // 2. Strip HTML tags (e.g. <p>, <div>, <ul>, <li>, <br/>, <a href="...">)
  cleaned = cleaned.replace(/<[^>]*>/g, " ");

  // 3. Unescape HTML named entities
  const namedEntities: Record<string, string> = {
    "&amp;": "&",
    "&#39;": "'",
    "&apos;": "'",
    "&quot;": '"',
    "&lt;": "<",
    "&gt;": ">",
    "&nbsp;": " ",
    "&#x2F;": "/",
    "&#47;": "/",
    "&mdash;": "—",
    "&ndash;": "–",
    "&hellip;": "…",
    "&copy;": "©",
    "&reg;": "®",
    "&trade;": "™",
  };

  for (const [entity, replacement] of Object.entries(namedEntities)) {
    cleaned = cleaned.split(entity).join(replacement);
  }

  // 4. Unescape numeric decimal entities (e.g. &#8217; -> ’, &#128640; -> 🚀)
  cleaned = cleaned.replace(/&#(\d+);/g, (_, dec) => {
    try {
      const code = parseInt(dec, 10);
      return String.fromCodePoint ? String.fromCodePoint(code) : String.fromCharCode(code);
    } catch {
      return "";
    }
  });

  // 5. Unescape numeric hexadecimal entities (e.g. &#x27; -> ', &#x1F680; -> 🚀)
  cleaned = cleaned.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
    try {
      const code = parseInt(hex, 16);
      return String.fromCodePoint ? String.fromCodePoint(code) : String.fromCharCode(code);
    } catch {
      return "";
    }
  });

  // 6. Normalize whitespace and trim
  return cleaned.replace(/\s+/g, " ").trim();
}

/**
 * Normalizes and validates LinkedIn URLs strictly:
 * - Rejects any URL containing `/search/results/` or `/search`
 * - Accepts URLs matching `/posts/` or `/feed/update/urn:li:activity:`
 * - Returns normalized URL string or null if not a valid direct post permalink
 */
export function normalizeLinkedInUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;

  // 1. Unescape HTML entities in URLs (&amp; -> &, &#39; -> ', &quot; -> ", etc.)
  let url = rawUrl
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

  // Must belong to linkedin domain
  if (!url.toLowerCase().includes("linkedin.com")) {
    return null;
  }

  const lower = url.toLowerCase();

  // Reject search results or search feeds
  if (lower.includes("/search/results/") || lower.includes("/search?") || lower.includes("/search/")) {
    return null;
  }

  // 2. Check if URL contains a LinkedIn Activity URN regex (urn:li:activity:\d+)
  const urnMatch =
    url.match(/urn:li:activity:(\d+)/i) ||
    url.match(/urn%3Ali%3Aactivity%3A(\d+)/i);

  if (urnMatch && urnMatch[1]) {
    return `https://www.linkedin.com/feed/update/urn:li:activity:${urnMatch[1]}/`;
  }

  // 3. For direct /posts/ or /feed/update/, strip tracking parameters (?utm_...)
  if (lower.includes("/posts/") || lower.includes("/feed/update/")) {
    try {
      const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
      parsed.search = "";
      parsed.hash = "";
      let normalized = parsed.toString();
      if (!normalized.endsWith("/")) normalized += "/";
      return normalized;
    } catch {
      const clean = url.split("?")[0].split("#")[0];
      return clean.endsWith("/") ? clean : `${clean}/`;
    }
  }

  return null;
}

/**
 * Validates LinkedIn URLs strictly using normalizeLinkedInUrl
 */
export function isValidLinkedInUrl(url: string | null | undefined): boolean {
  return normalizeLinkedInUrl(url) !== null;
}

/**
 * Normalizes and validates X (Twitter) status permalinks:
 * Accepts: x.com/[username]/status/[status_id] or twitter.com/[username]/status/[status_id]
 * Rejects: search URLs, feeds, home pages
 */
export function normalizeXPostUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const url = rawUrl.trim();
  const lower = url.toLowerCase();
  if (!lower.includes("x.com") && !lower.includes("twitter.com")) return null;
  if (lower.includes("/search?") || lower.includes("/search/") || lower.includes("/search")) return null;

  const match = url.match(/(?:x\.com|twitter\.com)\/([a-zA-Z0-9_]{1,50})\/status\/(\d+)/i);
  if (match) {
    return `https://x.com/${match[1]}/status/${match[2]}`;
  }
  return null;
}

/**
 * Normalizes and validates Instagram direct post URLs:
 * Rejects: /popular/, /explore/, /tags/
 * Accepts: /p/ or /reel/ direct post permalinks
 */
export function normalizeInstagramUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const url = rawUrl.trim();
  const lower = url.toLowerCase();
  if (!lower.includes("instagram.com")) return null;

  // Reject /popular/, /explore/, /tags/
  if (lower.includes("/popular/") || lower.includes("/explore/") || lower.includes("/tags/")) {
    return null;
  }

  const match = url.match(/instagram\.com\/(?:[a-zA-Z0-9._-]+\/)?(p|reel)\/([a-zA-Z0-9_-]+)/i);
  if (match) {
    const type = match[1].toLowerCase();
    const id = match[2];
    return `https://www.instagram.com/${type}/${id}/`;
  }
  return null;
}

/**
 * Normalizes and validates Reddit direct post URLs:
 * Accepts: /r/[subreddit]/comments/[id]/[title]/ or redd.it/[id]
 * Rejects: /r/[subreddit], /new.rss, /search
 */
export function normalizeRedditPostUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const url = rawUrl.trim();
  const lower = url.toLowerCase();
  if (!lower.includes("reddit.com") && !lower.includes("redd.it")) return null;
  if (lower.includes("/search?") || lower.includes("/search/") || lower.endsWith(".rss") || lower.includes("/new.rss")) {
    return null;
  }

  // redd.it shortlink
  const shortMatch = url.match(/redd\.it\/([a-zA-Z0-9]+)/i);
  if (shortMatch) {
    return `https://www.reddit.com/comments/${shortMatch[1]}/`;
  }

  const match = url.match(/reddit\.com\/r\/([a-zA-Z0-9_]+)\/comments\/([a-zA-Z0-9]+)(?:\/([a-zA-Z0-9_%-]+))?/i);
  if (match) {
    const sub = match[1];
    const id = match[2];
    const slug = match[3] ? `${match[3]}/` : "";
    return `https://www.reddit.com/r/${sub}/comments/${id}/${slug}`;
  }
  return null;
}

/**
 * Normalizes and validates Upwork direct job permalinks
 */
export function normalizeUpworkUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const url = rawUrl.trim();
  const lower = url.toLowerCase();
  if (!lower.includes("upwork.com")) return null;
  if (lower.includes("/nx/search/") || lower.includes("/search/")) return null;

  const match =
    url.match(/upwork\.com\/jobs\/~([a-zA-Z0-9]+)/i) ||
    url.match(/upwork\.com\/freelance-jobs\/apply\/([a-zA-Z0-9_-]+)/i) ||
    url.match(/upwork\.com\/job\/([a-zA-Z0-9_-]+)/i);

  if (match) {
    return url.split("?")[0];
  }
  return null;
}

/**
 * Checks if a URL is a generic search query or feed on any platform
 */
export function isGenericSearchFeedUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  const lower = url.toLowerCase();
  return (
    lower.includes("/search/results/") ||
    lower.includes("/search?") ||
    lower.includes("/search/") ||
    lower.includes("/results/content/") ||
    lower.includes("?q=") ||
    lower.includes("&q=") ||
    lower.includes("/explore/") ||
    lower.includes("/tags/") ||
    lower.includes("/popular/")
  );
}

/**
 * Strict validator for direct post permalinks across platforms.
 * Rejects search/tag feed URLs and requires genuine post permalinks:
 * - LinkedIn: Reject any URL containing `/search/results/` or `/search`. Only accept URLs matching `/posts/` or `/feed/update/urn:li:activity:`.
 * - Instagram: Reject any URL containing `/popular/`, `/explore/`, or `/tags/`. Only accept direct post URLs containing `/p/` or `/reel/`.
 * - X (Twitter): Reject generic search URLs (`x.com/search?q=...`). Only accept direct status permalinks matching `x.com/[username]/status/[status_id]`.
 * - Reddit: Ensure direct post link (`/r/[subreddit]/comments/[id]/[title]/` or `redd.it/[id]`) instead of subreddit main URL.
 * - Upwork: Reject search feeds (`/nx/search/`). Only accept direct job posts (`/jobs/~[id]` or `/freelance-jobs/apply/[id]`).
 * - Hacker News: Only accept direct item permalinks (`news.ycombinator.com/item?id=[id]`).
 */
export function isValidDirectPermalink(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  const clean = url.trim();
  if (!clean.startsWith("http://") && !clean.startsWith("https://")) return false;

  const lower = clean.toLowerCase();

  // 1. LinkedIn
  if (lower.includes("linkedin.com")) {
    if (lower.includes("/search/results/") || lower.includes("/search?") || lower.includes("/search/")) {
      return false;
    }
    const hasActivity = /urn:li:activity:\d+/i.test(clean) || /urn%3Ali%3Aactivity%3A\d+/i.test(clean);
    const hasFeedUpdate = /linkedin\.com\/feed\/update\/urn:li:activity:\d+/i.test(clean);
    const hasPost = /linkedin\.com\/(?:[a-zA-Z0-9_-]+\/)?posts\/[a-zA-Z0-9_\-%]+/i.test(clean) || lower.includes("/posts/");
    return hasActivity || hasFeedUpdate || hasPost;
  }

  // 2. Instagram
  if (lower.includes("instagram.com")) {
    if (
      lower.includes("/popular/") ||
      lower.includes("/explore/") ||
      lower.includes("/tags/")
    ) {
      return false;
    }
    // Only accept direct post URLs containing /p/ or /reel/
    const isPostOrReel = /instagram\.com\/(?:[a-zA-Z0-9._-]+\/)?(?:p|reel)\/([a-zA-Z0-9_-]+)/i.test(clean);
    return isPostOrReel;
  }

  // 3. X (Twitter)
  if (lower.includes("x.com") || lower.includes("twitter.com")) {
    if (lower.includes("/search?") || lower.includes("/search/") || lower.includes("/search")) {
      return false;
    }
    // Only accept direct status permalinks matching x.com/[username]/status/[status_id]
    const isStatus = /(?:x\.com|twitter\.com)\/[a-zA-Z0-9_]{1,50}\/status\/\d+/i.test(clean);
    return isStatus;
  }

  // 4. Reddit
  if (lower.includes("reddit.com") || lower.includes("redd.it")) {
    if (
      lower.includes("/search?") ||
      lower.includes("/search/") ||
      lower.includes("/submit") ||
      lower.endsWith(".rss") ||
      lower.includes("/new.rss") ||
      lower.includes("/top.rss")
    ) {
      return false;
    }
    // Subreddit root URLs like /r/forhire or /r/forhire/ are NOT direct post links
    const isRedditPost =
      /reddit\.com\/r\/[a-zA-Z0-9_]+\/comments\/[a-zA-Z0-9]+/i.test(clean) ||
      /redd\.it\/[a-zA-Z0-9]+/i.test(clean);
    return isRedditPost;
  }

  // 5. Upwork
  if (lower.includes("upwork.com")) {
    if (lower.includes("/nx/search/") || lower.includes("/search/")) {
      return false;
    }
    const isUpworkJob =
      /upwork\.com\/jobs\/~[a-zA-Z0-9]+/i.test(clean) ||
      /upwork\.com\/freelance-jobs\/apply\/[a-zA-Z0-9_-]+/i.test(clean) ||
      /upwork\.com\/job\/[a-zA-Z0-9_-]+/i.test(clean);
    return isUpworkJob;
  }

  // 6. Hacker News
  if (lower.includes("news.ycombinator.com")) {
    return /news\.ycombinator\.com\/item\?id=\d+/i.test(clean);
  }

  // 7. Generic URL check: reject obvious search query feeds
  if (isGenericSearchFeedUrl(clean)) {
    return false;
  }

  return true;
}

/**
 * Generates an official LinkedIn content search URL sorted by latest posts
 */
export function buildLinkedInSearchUrl(keyword: string): string {
  const clean = keyword.trim().replace(/^["']|["']$/g, "");
  return `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(clean)}&sortBy=%22date_posted%22`;
}

/**
 * Generates an Upwork job search URL with recency sorting
 */
export function buildUpworkSearchUrl(keyword: string): string {
  const clean = keyword.trim().replace(/^["']|["']$/g, "");
  return `https://www.upwork.com/nx/search/jobs/?q=${encodeURIComponent(clean)}&sort=recency`;
}

/**
 * Generates an Instagram hashtag / explore search URL
 */
export function buildInstagramSearchUrl(keywordOrTag: string): string {
  const cleanTag = keywordOrTag
    .trim()
    .replace(/^#/, "")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .toLowerCase();
  if (cleanTag) {
    return `https://www.instagram.com/explore/tags/${encodeURIComponent(cleanTag)}/`;
  }
  return "https://www.instagram.com/explore/";
}

/**
 * Generates an X (Twitter) search URL with strict reverse-chronological recency:
 * 1. Appends dynamic 7-day date filter using valid Twitter syntax (since:YYYY-MM-DD).
 * 2. Appends '&f=live' to force strict chronological order instead of top/popular posts.
 */
export function buildXSearchQueryUrl(keyword: string, baseUrl = "https://x.com/search"): string {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const yyyy = sevenDaysAgo.getUTCFullYear();
  const mm = String(sevenDaysAgo.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(sevenDaysAgo.getUTCDate()).padStart(2, "0");
  const sinceDate = `${yyyy}-${mm}-${dd}`;

  // Twitter/X uses 'since:YYYY-MM-DD' operator, NOT 'after:'
  const cleanKeyword = keyword.trim().replace(/^["']|["']$/g, "");
  const query = `${cleanKeyword} since:${sinceDate}`;
  const encodedQuery = encodeURIComponent(query);

  // &f=live forces strict reverse-chronological order on X
  return `${baseUrl}?q=${encodedQuery}&f=live`;
}

/**
 * Generates a Nitter / X RSS query URL with strict 7-day recency and &f=live
 */
export function buildNitterRssQueryUrl(keyword: string, nitterHost = "https://nitter.net"): string {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const yyyy = sevenDaysAgo.getUTCFullYear();
  const mm = String(sevenDaysAgo.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(sevenDaysAgo.getUTCDate()).padStart(2, "0");
  const sinceDate = `${yyyy}-${mm}-${dd}`;

  const cleanKeyword = keyword.trim().replace(/^["']|["']$/g, "");
  const query = `${cleanKeyword} since:${sinceDate}`;
  return `${nitterHost}/search/rss?q=${encodeURIComponent(query)}&f=live`;
}
