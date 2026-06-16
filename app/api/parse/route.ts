import { NextRequest, NextResponse } from "next/server";
import { parseTasks } from "@/lib/ai";

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    const tasks = await parseTasks(text);
    return NextResponse.json({ tasks });
  } catch (error: any) {
    console.error("Parse error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to parse tasks" },
      { status: 500 }
    );
  }
}
