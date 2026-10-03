import { NextRequest, NextResponse } from "next/server";
import { LeadRepo } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await req.json();

    const allowedUpdates: any = {};
    if (body.status !== undefined) {
      allowedUpdates.status = body.status;
    }
    if (body.suggestedReply !== undefined) {
      allowedUpdates.suggestedReply = body.suggestedReply;
    }
    if (body.intentScore !== undefined) {
      allowedUpdates.intentScore = body.intentScore;
    }
    if (body.pitches !== undefined) {
      allowedUpdates.pitches = body.pitches;
    }
    if (body.signals !== undefined) {
      allowedUpdates.signals = body.signals;
    }

    const updated = await LeadRepo.update(id, allowedUpdates);
    if (!updated) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: "Lead updated successfully",
      lead: updated,
    });
  } catch (error: any) {
    console.error("[Leads PATCH Error]:", error);
    return NextResponse.json(
      { error: "Failed to update lead", details: error?.message || error },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const deleted = await LeadRepo.delete(id);
    if (!deleted) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: "Lead deleted successfully" });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to delete lead", details: error?.message || error },
      { status: 500 }
    );
  }
}
