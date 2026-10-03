import { NextRequest, NextResponse } from "next/server";
import { KeywordRepo } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const keywords = await KeywordRepo.findMany();
    return NextResponse.json({ success: true, keywords });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch keywords", details: error?.message || error },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { keyword } = body;
    if (!keyword || typeof keyword !== "string" || !keyword.trim()) {
      return NextResponse.json(
        { error: "Keyword string is required" },
        { status: 400 }
      );
    }
    const created = await KeywordRepo.create(keyword);
    return NextResponse.json({ success: true, keyword: created }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to create keyword", details: error?.message || error },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing keyword ID" }, { status: 400 });
    }
    await KeywordRepo.delete(id);
    return NextResponse.json({ success: true, message: "Keyword deleted" });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to delete keyword", details: error?.message || error },
      { status: 500 }
    );
  }
}
