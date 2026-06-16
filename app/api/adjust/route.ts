import { NextRequest, NextResponse } from "next/server";
import { adjustTask } from "@/lib/ai";

export async function POST(req: NextRequest) {
  try {
    const { task, instruction } = await req.json();

    if (!task || !instruction) {
      return NextResponse.json(
        { error: "Task and instruction are required" },
        { status: 400 }
      );
    }

    const result = await adjustTask(JSON.stringify(task), instruction);
    return NextResponse.json({ result });
  } catch (error: any) {
    console.error("Adjust error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to adjust task" },
      { status: 500 }
    );
  }
}
