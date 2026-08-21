const WIKI_ORIGIN = "https://en.wikipedia.org";

export function extractTitle(url: string): string | null {
  const match = url.match(/\/wiki\/([^#?]+)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export async function fetchArticle(title: string): Promise<string> {
  const api = `${WIKI_ORIGIN}/w/api.php?action=parse&page=${encodeURIComponent(
    title,
  )}&format=json&origin=*&redirects=1&prop=text`;
  const res = await fetch(api);
  if (!res.ok) throw new Error(`Wikipedia API error ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.info);
  return data.parse.text["*"] as string;
}

const INTERCEPT_SCRIPT = `
document.addEventListener('mousedown', function () {
  parent.postMessage({ type: 'wiki-focus' }, '*');
}, true);

document.addEventListener('click', function (e) {
  var a = e.target.closest && e.target.closest('a[href]');
  if (!a) return;
  var href = a.getAttribute('href') || '';
  var m = href.match(/^\\/wiki\\/([^#?]+)/);
  if (m) {
    e.preventDefault();
    e.stopPropagation();
    parent.postMessage({ type: 'wiki-link', title: decodeURIComponent(m[1]) }, '*');
  }
}, true);
`;

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildSrcdoc(html: string, title: string): string {
  const displayTitle = escapeHtml(title.replace(/_/g, " "));
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<base href="${WIKI_ORIGIN}/">
<link rel="stylesheet" href="${WIKI_ORIGIN}/w/load.php?lang=en&modules=site.styles%7Cmediawiki.page.media%7Cskins.vector.styles&only=styles">
<style>
body { margin: 8px; }
.wiki-title {
  font-family: sans-serif;
  font-size: 1.75rem;
  font-weight: 400;
  line-height: 1.3;
  margin: 0 0 0.2em;
  padding-bottom: 0.1em;
  border-bottom: 1px solid #a2a9b1;
}
</style>
<script>${INTERCEPT_SCRIPT}</script>
</head>
<body class="mw-parser-output">
<h1 class="wiki-title">${displayTitle}</h1>
${html}
</body>
</html>`;
}
