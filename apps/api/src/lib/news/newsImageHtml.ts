/** Extract the best candidate hero image URL from RSS/HTML body text. */
export function extractImageFromHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  const candidates: Array<{ url: string; score: number }> = [];

  const imgRe = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = imgRe.exec(html)) !== null) {
    const raw = match[1]?.trim();
    if (!raw || raw.startsWith("data:")) continue;
    const lower = raw.toLowerCase();
    let score = 10;
    if (/(logo|icon|avatar|badge|pixel|spacer|1x1|tracking)/.test(lower)) score -= 8;
    if (/(hero|feature|lead|thumb|cover|header|banner)/.test(lower)) score += 6;
    const widthMatch = match[0].match(/\bwidth=["']?(\d+)/i);
    const heightMatch = match[0].match(/\bheight=["']?(\d+)/i);
    const w = widthMatch ? parseInt(widthMatch[1], 10) : 0;
    const h = heightMatch ? parseInt(heightMatch[1], 10) : 0;
    if (w > 0 && h > 0) {
      if (w < 80 || h < 80) score -= 6;
      else score += Math.min(20, Math.floor((w + h) / 80));
    }
    candidates.push({ url: raw, score });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.url ?? null;
}
