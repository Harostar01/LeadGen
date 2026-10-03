import { NextRequest, NextResponse } from "next/server";
import { prisma, LeadRepo } from "@/lib/db";
import { analyzeLeadWithGroq } from "@/lib/groq";
import { RedisService } from "@/lib/redis";
import { cleanLeadText, normalizeLinkedInUrl, isValidDirectPermalink } from "@/lib/cleaner";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { source = "ChromeExtension", title, content, url, author } = body;

    if (!url) {
      return NextResponse.json(
        { error: "Missing required field: 'url'" },
        { status: 400 }
      );
    }

    if (!content && !title) {
      return NextResponse.json(
        { error: "Must provide at least 'content' or 'title' to analyze lead" },
        { status: 400 }
      );
    }

    // 1. Filter out Reddit self-promotions ([FOR HIRE])
    const lowerTitle = (title || "").toLowerCase();
    const lowerContent = (content || "").toLowerCase();
    const combinedText = `${lowerTitle} ${lowerContent}`.trim();

    if (
      lowerTitle.includes("[for hire]") ||
      lowerTitle.includes("[for-hire]") ||
      lowerTitle.includes("[available]") ||
      lowerContent.includes("[for hire]") ||
      lowerContent.includes("[for-hire]") ||
      lowerContent.includes("[available]")
    ) {
      return NextResponse.json(
        { message: "Skipped: Freelancer post" },
        { status: 200 }
      );
    }

    let cleanUrl = String(url).trim();

    // LinkedIn Link Validation & Normalization
    const isLinkedIn =
      (typeof source === "string" && source.toLowerCase().includes("linkedin")) ||
      cleanUrl.toLowerCase().includes("linkedin.com");

    if (isLinkedIn) {
      const normalized = normalizeLinkedInUrl(cleanUrl);
      if (!normalized) {
        return NextResponse.json(
          { message: "Skipped: Not a direct post permalink" },
          { status: 200 }
        );
      }
      cleanUrl = normalized;
    }

    // 2. Validate strict direct permalink
    if (!isValidDirectPermalink(cleanUrl)) {
      return NextResponse.json(
        { message: "Skipped: Not a direct post permalink" },
        { status: 200 }
      );
    }

    // 3. Reddit Buyer Intent Filter
    const isReddit =
      (typeof source === "string" && source.toLowerCase().includes("reddit")) ||
      cleanUrl.toLowerCase().includes("reddit.com") ||
      cleanUrl.toLowerCase().includes("redd.it");

    if (isReddit) {
      const buyerIntentTriggers = [
        "[hiring]",
        "looking for",
        "need a",
        "hiring",
        "budget",
        "recommend",
      ];
      const hasBuyerIntent = buyerIntentTriggers.some((trigger) =>
        combinedText.includes(trigger)
      );

      if (!hasBuyerIntent) {
        return NextResponse.json(
          { message: "Skipped: Missing Reddit buyer intent triggers" },
          { status: 200 }
        );
      }
    }

    // 2. Sanitize Text: Clean raw post title, content, author using cleanLeadText()
    const sanitizedTitle = cleanLeadText(title || "");
    const sanitizedContent = cleanLeadText(content || title || "");
    const sanitizedAuthor = author ? cleanLeadText(author) : null;

    // 3. Duplicate Prevention Across All States:
    // Query database for the URL across ALL statuses ('NEW' | 'CONTACTED' | 'REPLIED' | 'ARCHIVED' | 'DELETED')
    // before analyzing or creating a record.
    const existingLead = prisma
      ? await prisma.lead.findUnique({ where: { url: cleanUrl } })
      : await LeadRepo.findByUrl(cleanUrl);

    if (existingLead) {
      return NextResponse.json(
        {
          success: true,
          message: "Lead already exists in DB",
          lead: existingLead,
          isDuplicate: true,
        },
        { status: 200 }
      );
    }

    // 4. Analyze intent with Groq AI algorithm (clean text passed)
    const analysis = await analyzeLeadWithGroq({
      title: sanitizedTitle || null,
      content: sanitizedContent || sanitizedTitle || "",
      source: source || "ChromeExtension",
      author: sanitizedAuthor,
    });

    // 5. Save lead into database with pitch variants, signal breakdown, and cleanUrl
    const newLead = await LeadRepo.create({
      source: source || "ChromeExtension",
      title: sanitizedTitle || null,
      content: sanitizedContent || sanitizedTitle || "",
      author: sanitizedAuthor,
      url: cleanUrl,
      intentScore: analysis.intentScore,
      reasoning: analysis.reasoning,
      suggestedReply: analysis.suggestedReply,
      pitches: analysis.pitches,
      signals: analysis.signals,
      status: "NEW",
    });

    // Mark as seen in Redis and increment metrics
    await RedisService.checkAndMarkUrlSeen(cleanUrl);
    await RedisService.recordIngestEvent();

    return NextResponse.json(
      {
        success: true,
        message: "Lead ingested and scored successfully",
        lead: newLead,
        isDuplicate: false,
      },
      {
        status: 201,
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error: any) {
    console.error("[API Ingest Error]:", error);
    return NextResponse.json(
      {
        error: "Failed to ingest lead",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}
