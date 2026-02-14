import { NextResponse } from "next/server";
import { SKILL_MARKDOWN } from "@/data/skill-content";

/** Serves skill.md so the Deploy modal and external clients can load it (embedded for serverless/Vercel). */
export async function GET() {
  return new NextResponse(SKILL_MARKDOWN, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
