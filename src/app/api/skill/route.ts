import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

/** Serves public/skill.md so the Deploy modal and external clients can load it reliably (avoids static path issues on some hosts). */
export async function GET() {
  try {
    const path = join(process.cwd(), "public", "skill.md");
    const content = readFileSync(path, "utf-8");
    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (e) {
    return new NextResponse("# Error\nCould not load skill.md", {
      status: 500,
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
    });
  }
}
