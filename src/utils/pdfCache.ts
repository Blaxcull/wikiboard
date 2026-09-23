const pdfBufferCache = new Map<string, ArrayBuffer>();

export async function fetchPdfBuffer(url: string): Promise<ArrayBuffer> {
  const cached = pdfBufferCache.get(url);
  if (cached && cached.byteLength > 0) return cached.slice(0);

  const controller = new AbortController();
  const signal = controller.signal;
  let is404 = false;

  const tryFetch = async (targetUrl: string): Promise<ArrayBuffer> => {
    const res = await fetch(targetUrl, { signal });
    if (res.status === 404 || res.status === 410) {
      is404 = true;
      throw new Error("File does not exist");
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 100) throw new Error("Invalid buffer size");

    // Inspect first 1024 bytes for %PDF- magic header vs HTML 404 page
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    const headBytes = new Uint8Array(buf.slice(0, Math.min(buf.byteLength, 1024)));
    let headText = "";
    for (let i = 0; i < headBytes.length; i++) {
      headText += String.fromCharCode(headBytes[i]);
    }

    const hasPdfHeader = headText.includes("%PDF-");
    const isHtml = contentType.includes("text/html") || /<!DOCTYPE|<html|<title>404|not found/i.test(headText);

    if (!hasPdfHeader || isHtml) {
      if (/404|not found|page not found/i.test(headText)) {
        is404 = true;
        throw new Error("File does not exist");
      }
      throw new Error("Target location returned an HTML page or non-PDF file instead of a valid PDF document (missing %PDF- header).");
    }

    return buf;
  };

  const isRemote = /^https?:\/\//i.test(url);
  const isWikimedia = /wikimedia\.org|wikipedia\.org/i.test(url);

  // If local file path or non-HTTP URL, fetch directly without proxying
  if (!isRemote) {
    try {
      const buf = await tryFetch(url);
      pdfBufferCache.set(url, buf);
      return buf.slice(0);
    } catch {
      throw new Error("File does not exist at the specified location.");
    }
  }

  const targets: string[] = [];
  if (isWikimedia) {
    targets.push(
      `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
      `https://corsproxy.io/?${encodeURIComponent(url)}`,
    );
  } else {
    targets.push(
      url,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
      `https://corsproxy.io/?${encodeURIComponent(url)}`,
    );
  }

  try {
    const buf = await Promise.any(targets.map((t) => tryFetch(t)));
    controller.abort();
    pdfBufferCache.set(url, buf);
    return buf.slice(0);
  } catch {
    controller.abort();
    if (is404) {
      throw new Error("File does not exist at the specified location.");
    }
    throw new Error("Network error when fetching PDF");
  }
}

export async function prefetchPdf(url: string): Promise<void> {
  if (!url || pdfBufferCache.has(url)) return;
  try {
    await fetchPdfBuffer(url);
  } catch {
    /* ignore prefetch errors */
  }
}
