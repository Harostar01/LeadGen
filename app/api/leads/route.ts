import { NextRequest, NextResponse } from "next/server";
import { prisma, LeadRepo } from "@/lib/db";
import { cleanLeadText, normalizeLinkedInUrl, isValidLinkedInUrl } from "@/lib/cleaner";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const shouldReset = searchParams.get("reset") === "true";
    if (shouldReset) {
      LeadRepo.reset();
    }
    const status = searchParams.get("status") || "ALL";
    const minScore = searchParams.get("minScore")
      ? parseInt(searchParams.get("minScore")!, 10)
      : undefined;
    const source = searchParams.get("source") || undefined;
    const search = searchParams.get("search") || undefined;

    const leads = await LeadRepo.findMany({
      status,
      minScore,
      source,
      search,
    });

    // Calculate aggregated metrics
    const allLeads = await LeadRepo.findMany();
    const stats = {
      total: allLeads.length,
      highIntent: allLeads.filter((l) => l.intentScore >= 70).length,
      contacted: allLeads.filter((l) => l.status === "CONTACTED" || l.status === "REPLIED").length,
      archived: allLeads.filter((l) => l.status === "ARCHIVED").length,
      newLeads: allLeads.filter((l) => l.status === "NEW").length,
      avgIntentScore:
        allLeads.length > 0
          ? Math.round(
              allLeads.reduce((acc, curr) => acc + curr.intentScore, 0) /
                allLeads.length
            )
          : 0,
    };

    return NextResponse.json(
      {
        success: true,
        stats,
        leads,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (error: any) {
    console.error("[Leads API Error]:", error);
    return NextResponse.json(
      { error: "Failed to fetch leads", details: error?.message || error },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { source = "Manual", title, content, url, author, intentScore = 50, suggestedReply, reasoning } = body;

    if (!url || !content) {
      return NextResponse.json(
        { error: "Missing required fields: 'url' and 'content'" },
        { status: 400 }
      );
    }

    let cleanUrl = String(url).trim();

    const isLinkedIn =
      (typeof source === "string" && source.toLowerCase().includes("linkedin")) ||
      cleanUrl.toLowerCase().includes("linkedin.com");

    if (isLinkedIn) {
      const normalized = normalizeLinkedInUrl(cleanUrl);
      if (!normalized) {
        return NextResponse.json(
          {
            error:
              "Invalid LinkedIn URL. Lead URLs must be direct permalinks containing /posts/, /feed/update/, or /pulse/. Generic search feeds (/search/results/) are rejected.",
            url: cleanUrl,
          },
          { status: 400 }
        );
      }
      cleanUrl = normalized;
    }

    // Duplicate check across all states ('NEW' | 'CONTACTED' | 'REPLIED' | 'ARCHIVED' | 'DELETED')
    const existing = prisma
      ? await prisma.lead.findUnique({ where: { url: cleanUrl } })
      : await LeadRepo.findByUrl(cleanUrl);

    if (existing) {
      return NextResponse.json(
        {
          success: true,
          message: "Lead already exists in DB",
          lead: existing,
          isDuplicate: true,
        },
        { status: 200 }
      );
    }

    const lead = await LeadRepo.create({
      source,
      title: title ? cleanLeadText(title) : null,
      content: cleanLeadText(content),
      author: author ? cleanLeadText(author) : null,
      url: cleanUrl,
      intentScore,
      suggestedReply: suggestedReply ? cleanLeadText(suggestedReply) : undefined,
      reasoning: reasoning ? cleanLeadText(reasoning) : undefined,
      status: "NEW",
    });

    return NextResponse.json({ success: true, lead }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to create lead", details: error?.message || error },
      { status: 500 }
    );
  }
}
