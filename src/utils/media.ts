/**
 * Media extraction and API utilities for YouTube and media embeds.
 */

/**
 * Extracts a YouTube 11-character video ID from a URL, embed string, or raw ID.
 *
 * Supports:
 * - https://www.youtube.com/watch?v=dQw4w9WgXcQ
 * - https://youtube.com/watch?v=dQw4w9WgXcQ&t=10s
 * - https://youtu.be/dQw4w9WgXcQ
 * - https://www.youtube.com/embed/dQw4w9WgXcQ
 * - https://www.youtube.com/shorts/dQw4w9WgXcQ
 * - https://m.youtube.com/watch?v=dQw4w9WgXcQ
 * - dQw4w9WgXcQ (raw 11-char ID)
 */
export function extractYouTubeId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  // Raw 11-character video ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  // Common YouTube URL regex matching standard videos, shorts, embeds, and shortened links
  const match = trimmed.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([a-zA-Z0-9_-]{11})/
  );

  return match ? match[1] : null;
}

/**
 * Fetches video metadata via YouTube oEmbed API (CORS-friendly, no API key needed).
 */
export async function fetchYouTubeInfo(videoId: string): Promise<{ title?: string; author?: string } | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      title: typeof data.title === "string" ? data.title : undefined,
      author: typeof data.author_name === "string" ? data.author_name : undefined,
    };
  } catch (err) {
    console.warn("[Media] Could not fetch YouTube info via oEmbed:", err);
    return null;
  }
}
