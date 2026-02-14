import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

/**
 * Serve the Skill markdown file from public/ so the deploy modal
 * always gets markdown, not a 404 HTML page (avoids static path/case issues).
 */
export async function GET() {
  const publicDir = join(process.cwd(), 'public');
  const candidates = ['skill.md', 'Skill.md'];
  for (const name of candidates) {
    try {
      const path = join(publicDir, name);
      const body = await readFile(path, 'utf-8');
      return new NextResponse(body, {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Cache-Control': 'public, max-age=60',
        },
      });
    } catch {
      continue;
    }
  }
  return NextResponse.json(
    { error: 'Skill file not found' },
    { status: 404 }
  );
}
