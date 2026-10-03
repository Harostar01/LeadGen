import { NextRequest, NextResponse } from "next/server";
import { XMLParser } from "fast-xml-parser";
import { prisma, LeadRepo, KeywordRepo } from "@/lib/db";
import { analyzeLeadWithGroq } from "@/lib/groq";
import { RedisService } from "@/lib/redis";
import {
  cleanLeadText,
  normalizeLinkedInUrl,
  isValidLinkedInUrl,
  isValidDirectPermalink,
} from "@/lib/cleaner";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_FEEDS = [
  "https://www.reddit.com/r/forhire/new.rss",
  "https://www.reddit.com/r/freelance_forhire/new.rss",
  "https://www.reddit.com/r/SaaS/new.rss",
];

interface ParsedEntry {
  title: string;
  link: string;
  content: string;
  author?: string;
  published?: string;
}

/**
 * Ensures Reddit RSS items extract the direct post permalink (/r/[subreddit]/comments/[id]/[title]/)
 * instead of the subreddit main URL or generic feed links.
 */
function extractRedditPostPermalink(link: string, entryRaw: any): string {
  // If link is already a direct comments link, return it
  if (link && /reddit\.com\/r\/[a-zA-Z0-9_]+\/comments\/[a-zA-Z0-9]+/i.test(link)) {
    return link;
  }
  if (link && /redd\.it\/[a-zA-Z0-9]+/i.test(link)) {
    return link;
  }

  // Search inside the item or block string for comments link
  const str = typeof entryRaw === "string" ? entryRaw : JSON.stringify(entryRaw);
  const match = str.match(/https?:\/\/(?:www\.)?reddit\.com\/r\/[a-zA-Z0-9_]+\/comments\/[a-zA-Z0-9]+(?:\/[a-zA-Z0-9_%-]+)?\/?/i);
  if (match) {
    return match[0];
  }

  const unescaped = str.replace(/&amp;/g, "&").replace(/\\"/g, '"');
  const match2 = unescaped.match(/https?:\/\/(?:www\.)?reddit\.com\/r\/[a-zA-Z0-9_]+\/comments\/[a-zA-Z0-9]+(?:\/[a-zA-Z0-9_%-]+)?\/?/i);
  if (match2) {
    return match2[0];
  }

  return link;
}

/**
 * Bulletproof RSS & Atom parser with regex fallback
 * Reddit feeds use Atom 1.0 (<feed><entry><link href="..."/><title>...</title>...</entry></feed>)
 * Hacker News and classic blogs use RSS 2.0 (<rss><channel><item><link>...</link><title>...</title>...</item></channel></rss>)
 */
function parseFeedXml(xmlData: string): ParsedEntry[] {
  const entries: ParsedEntry[] = [];

  // 1. Try fast-xml-parser with processEntities disabled (prevents entity expansion limit exceptions on Reddit HTML)
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      processEntities: false,
      stopNodes: ["*.content", "*.description"],
    });
    const parsed = parser.parse(xmlData);

    // Atom 1.0 format (Reddit)
    if (parsed.feed?.entry) {
      const rawEntries = Array.isArray(parsed.feed.entry)
        ? parsed.feed.entry
        : [parsed.feed.entry];

      for (const item of rawEntries) {
        let link = "";
        if (typeof item.link === "string") {
          link = item.link;
        } else if (item.link?.["@_href"]) {
          link = item.link["@_href"];
        } else if (Array.isArray(item.link)) {
          const alternate = item.link.find((l: any) => l["@_rel"] === "alternate" || !l["@_rel"]);
          link = alternate?.["@_href"] || item.link[0]?.["@_href"] || "";
        }

        // Ensure direct comments permalink for Reddit items
        link = extractRedditPostPermalink(link, item);

        const rawTitle = item.title?.["#text"] || item.title || "";
        const rawContent =
          item.content?.["#text"] || item.content || item.summary?.["#text"] || item.summary || "";
        const rawAuthor = item.author?.name || "reddit_user";

        const cleanTitle = cleanLeadText(String(rawTitle));
        const cleanContent = cleanLeadText(String(rawContent));
        const cleanAuthor = cleanLeadText(String(rawAuthor));

        if (link && (cleanTitle || cleanContent)) {
          entries.push({
            title: cleanTitle,
            link: String(link).trim(),
            content: cleanContent || cleanTitle,
            author: cleanAuthor,
            published: item.published || item.updated,
          });
        }
      }
      if (entries.length > 0) return entries;
    }

    // RSS 2.0 format (Hacker News, blogs)
    if (parsed.rss?.channel?.item) {
      const items = Array.isArray(parsed.rss.channel.item)
        ? parsed.rss.channel.item
        : [parsed.rss.channel.item];

      for (const item of items) {
        let link = item.link || item.guid?.["#text"] || item.guid || "";
        link = extractRedditPostPermalink(link, item);

        const rawTitle = item.title || "";
        const rawDesc = item.description || item["content:encoded"] || "";
        const rawAuthor = item.author || item["dc:creator"] || "hn_user";

        const cleanTitle = cleanLeadText(String(rawTitle));
        const cleanContent = cleanLeadText(String(rawDesc));
        const cleanAuthor = cleanLeadText(String(rawAuthor));

        if (link && (cleanTitle || cleanContent)) {
          entries.push({
            title: cleanTitle,
            link: String(link).trim(),
            content: cleanContent || cleanTitle,
            author: cleanAuthor,
            published: item.pubDate,
          });
        }
      }
      if (entries.length > 0) return entries;
    }
  } catch (err) {
    console.warn("[RSS Parser] XMLParser fallback triggered:", err);
  }

  // 2. High-reliability Regex Parser Fallback
  // Matches both <entry>...</entry> (Atom) and <item>...</item> (RSS)
  const blockMatches = xmlData.match(/<(?:entry|item)>[\s\S]*?<\/(?:entry|item)>/gi) || [];
  for (const block of blockMatches) {
    let link = "";
    // Atom: <link href="..." />
    const atomLink = block.match(/<link[^>]+href=["']([^"']+)["']/i);
    if (atomLink) {
      link = atomLink[1];
    } else {
      // RSS: <link>...</link>
      const rssLink = block.match(/<link>([\s\S]*?)<\/link>/i);
      if (rssLink) link = rssLink[1].replace(/<!\[CDATA\[(.*?)\]\]>/gi, "$1").trim();
    }

    link = extractRedditPostPermalink(link, block);

    const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const rawTitle = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/gi, "$1") : "";

    const authorMatch = block.match(
      /<(?:author>[\s\S]*?<name|dc:creator)[^>]*>([\s\S]*?)<\/(?:name|dc:creator)>/i
    );
    const rawAuthor = authorMatch ? authorMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/gi, "$1") : "";

    const contentMatch = block.match(/<(?:content|description)[^>]*>([\s\S]*?)<\/(?:content|description)>/i);
    const rawContent = contentMatch ? contentMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/gi, "$1") : "";

    const cleanTitle = cleanLeadText(rawTitle);
    const cleanContent = cleanLeadText(rawContent);
    const cleanAuthor = cleanLeadText(rawAuthor || "social_user");

    if (link && (cleanTitle || cleanContent)) {
      entries.push({
        title: cleanTitle,
        link: link.trim(),
        content: cleanContent || cleanTitle,
        author: cleanAuthor,
      });
    }
  }

  return entries;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const feedParam = searchParams.get("feed");
    const secret = searchParams.get("secret");

    // Optional secret check
    if (process.env.CRON_SECRET && secret && secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const feedsToFetch = feedParam ? [feedParam] : DEFAULT_FEEDS;

    // Get active monitored keywords for filtering
    const keywords = await KeywordRepo.findMany();
    const activeKeywords = keywords.filter((k) => k.active).map((k) => k.keyword.toLowerCase());

    const results = {
      scannedFeeds: feedsToFetch.length,
      totalEntriesFound: 0,
      newLeadsIngested: 0,
      leads: [] as any[],
      errors: [] as string[],
    };

    for (let i = 0; i < feedsToFetch.length; i++) {
      const feedUrl = feedsToFetch[i];
      if (i > 0) {
        // Polite delay between feed requests to avoid 429 rate limits
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
      try {
        const response = await fetch(feedUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            Accept: "application/rss+xml, application/atom+xml, text/xml, */*",
          },
          next: { revalidate: 0 },
        });

        if (!response.ok) {
          results.errors.push(`Failed to fetch ${feedUrl}: HTTP ${response.status}`);
          continue;
        }

        const xmlText = await response.text();
        const entries = parseFeedXml(xmlText);
        results.totalEntriesFound += entries.length;

        // Process up to 8 latest entries per feed
        for (const entry of entries.slice(0, 8)) {
          // Validate URL is a legitimate web URL
          if (!entry.link.startsWith("http://") && !entry.link.startsWith("https://")) {
            continue;
          }

          let cleanUrl = entry.link.trim();

          // If LinkedIn, normalize and validate
          if (cleanUrl.toLowerCase().includes("linkedin.com")) {
            const normalized = normalizeLinkedInUrl(cleanUrl);
            if (!normalized) {
              continue; // Skip generic search feeds or invalid URLs
            }
            cleanUrl = normalized;
          }

          // Strict direct permalink check - rejects subreddit main URLs, search feeds, tag feeds
          if (!isValidDirectPermalink(cleanUrl)) {
            continue;
          }

          // Duplicate Prevention Across All States (NEW, CONTACTED, REPLIED, ARCHIVED, DELETED)
          const existingLead = prisma
            ? await prisma.lead.findUnique({ where: { url: cleanUrl } })
            : await LeadRepo.findByUrl(cleanUrl);
          if (existingLead) continue;

          // Check if already seen in Redis
          await RedisService.checkAndMarkUrlSeen(cleanUrl);

          const sanitizedTitle = cleanLeadText(entry.title);
          const sanitizedContent = cleanLeadText(entry.content);
          const sanitizedAuthor = cleanLeadText(entry.author || "");

          const lowerTitle = sanitizedTitle.toLowerCase();
          const lowerContent = sanitizedContent.toLowerCase();
          const combinedText = `${lowerTitle} ${lowerContent}`.trim();

          // 1. Exclude Freelancer Posts: Immediately reject [FOR HIRE], [FOR-HIRE], [AVAILABLE]
          if (
            lowerTitle.includes("[for hire]") ||
            lowerTitle.includes("[for-hire]") ||
            lowerTitle.includes("[available]") ||
            lowerContent.includes("[for hire]") ||
            lowerContent.includes("[for-hire]") ||
            lowerContent.includes("[available]")
          ) {
            continue; // Skip freelancer self-promotions
          }

          // Determine source
          let source = "RSS";
          if (cleanUrl.includes("reddit.com") || cleanUrl.includes("redd.it")) source = "Reddit";
          else if (cleanUrl.includes("ycombinator.com")) source = "HackerNews";
          else if (cleanUrl.includes("linkedin.com")) source = "LinkedIn";
          else if (cleanUrl.includes("upwork.com")) source = "Upwork";
          else if (cleanUrl.includes("instagram.com")) source = "Instagram";

          // 2. If it's a Reddit lead, require Buyer Intent Keywords:
          // [HIRING], "looking for", "need a", "hiring", "budget", "recommend"
          if (source === "Reddit") {
            const buyerTriggers = [
              "[hiring]",
              "looking for",
              "need a",
              "hiring",
              "budget",
              "recommend",
            ];
            const hasBuyerIntent = buyerTriggers.some((t) => combinedText.includes(t));
            if (!hasBuyerIntent) {
              continue; // Skip Reddit posts lacking buyer intent
            }
          }

          // Keyword relevance check
          const matchesKeyword =
            activeKeywords.length === 0 ||
            activeKeywords.some((kw) => combinedText.includes(kw)) ||
            combinedText.includes("hiring") ||
            combinedText.includes("looking for") ||
            combinedText.includes("recommendation") ||
            combinedText.includes("ask hn");

          if (!matchesKeyword) continue;

          // Analyze with Groq AI (content is sanitized before evaluation)
          const analysis = await analyzeLeadWithGroq({
            title: sanitizedTitle,
            content: sanitizedContent,
            source,
            author: sanitizedAuthor || null,
          });

          // Ingest lead with genuine live URL and clean text
          const savedLead = await LeadRepo.create({
            source,
            title: sanitizedTitle,
            content: sanitizedContent,
            author: sanitizedAuthor || null,
            url: cleanUrl,
            intentScore: analysis.intentScore,
            reasoning: analysis.reasoning,
            suggestedReply: analysis.suggestedReply,
            pitches: analysis.pitches,
            signals: analysis.signals,
            status: "NEW",
          });

          await RedisService.recordIngestEvent();

          results.newLeadsIngested += 1;
          results.leads.push(savedLead);
        }
      } catch (feedErr: any) {
        console.error(`[RSS Fetch Error] on ${feedUrl}:`, feedErr);
        results.errors.push(`Error on ${feedUrl}: ${feedErr?.message || feedErr}`);
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: `Processed ${results.scannedFeeds} feeds. Ingested ${results.newLeadsIngested} new qualified leads.`,
        ...results,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        },
      }
    );
  } catch (error: any) {
    console.error("[RSS Cron Error]:", error);
    return NextResponse.json(
      { error: "Cron run failed", details: error?.message || error },
      { status: 500 }
    );
  }
}
