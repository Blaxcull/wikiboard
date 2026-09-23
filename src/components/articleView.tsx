import { memo, useCallback, useEffect, useState } from "react";
import type { WindowData } from "../store/windows";
import { useWindows } from "../store/windows";
import {
  extractTitle,
  fetchArticle,
  fetchFileUrl,
  isPdfUrl,
  isWaybackUrl,
} from "../utils/wiki";
import {
  getCachedArticle,
  setCachedArticle,
} from "../utils/articleCache";
import { getScroll, setScroll } from "../utils/scrollMemory";
import StaticPreview from "./staticPreview";

type Props = { win: WindowData };

const ArticleView = memo(function ArticleView({ win }: Props) {
  const updateWindow = useWindows((s) => s.updateWindow);
  const addWindow = useWindows((s) => s.addWindow);

  const title = extractTitle(win.url) ?? "";
  const [prevUrl, setPrevUrl] = useState(win.url);

  const [fullHtml, setFullHtml] = useState<string | null>(() => {
    const cached = title ? getCachedArticle(title) : undefined;
    return cached?.html ?? null;
  });
  const [loading, setLoading] = useState<boolean>(() => {
    const cached = title ? getCachedArticle(title) : undefined;
    return !cached && Boolean(title);
  });

  const [fileInfo, setFileInfo] = useState<{ url: string; width: number; height: number; mime?: string } | null>(null);

  if (prevUrl !== win.url) {
    setPrevUrl(win.url);
    setScroll(win.id, 0, 0);
    const cached = title ? getCachedArticle(title) : undefined;
    setFullHtml(cached?.html ?? null);
    setLoading(!cached && Boolean(title));
    setFileInfo(null);
  }

  const handleScrollChange = useCallback(
    (y: number) => setScroll(win.id, 0, y),
    [win.id],
  );

  useEffect(() => {
    let cancelled = false;
    const articleTitle = extractTitle(win.url);
    if (!articleTitle) return;

    if (articleTitle.startsWith("File:")) {
      if (!win.directImageUrl) {
        fetchFileUrl(articleTitle).then((info) => {
          if (!cancelled && info) {
            if (info.mime === "application/pdf" || isPdfUrl(info.url) || articleTitle.toLowerCase().endsWith(".pdf")) {
              updateWindow(win.id, {
                contentType: "pdf",
                pdfUrl: info.url,
                title: articleTitle.replace(/^File:/i, "").replace(/_/g, " "),
                pdfCurrentPage: 1,
                width: win.width ?? 620,
                height: win.height ?? 908,
              });
            } else {
              setFileInfo(info);
            }
          }
        }).catch(() => {});
      }
      return;
    }

    if (articleTitle.startsWith("Special:") || articleTitle.startsWith("Help:") || articleTitle.startsWith("Wikipedia:")) {
      setLoading(false);
      return;
    }

    const cached = getCachedArticle(articleTitle);
    if (cached) return;

    fetchArticle(articleTitle)
      .then((html) => {
        if (cancelled) return;
        setFullHtml(html);
        setLoading(false);
        setCachedArticle(articleTitle, html, "", null);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [win.url, win.directImageUrl, win.id, win.width, win.height, updateWindow]);

  function handleLinkClick(wikiTitle: string, imageUrl?: string, href?: string) {
    const rawUrl = href || `https://en.wikipedia.org/wiki/${wikiTitle.replace(/ /g, "_")}`;
    if (isWaybackUrl(rawUrl)) {
      window.open(rawUrl, "_blank", "noopener,noreferrer");
      return;
    }
    const isPdf = isPdfUrl(rawUrl) || isPdfUrl(wikiTitle) || wikiTitle.toLowerCase().endsWith(".pdf");
    const current = useWindows.getState().windows.find((w) => w.id === win.id);
    if (!current) return;
    if (!current.links.some((l) => l.href === rawUrl)) {
      updateWindow(win.id, {
        links: [...current.links, { label: wikiTitle.replace(/_/g, " "), href: rawUrl }],
      });
    }

    if (isPdf && (href || !wikiTitle.startsWith("File:"))) {
      addWindow({
        contentType: "pdf",
        pdfUrl: rawUrl,
        title: wikiTitle.replace(/^File:/i, "").replace(/_/g, " "),
        parentId: win.id,
        sourceHref: href || rawUrl,
        pdfCurrentPage: 1,
        width: 620,
        height: 945,
      });
    } else {
      const isImg = !!imageUrl || wikiTitle.startsWith("File:");
      addWindow({
        title: wikiTitle.replace(/_/g, " "),
        url: rawUrl,
        parentId: win.id,
        sourceHref: href || rawUrl,
        ...(isImg ? { width: 250, height: 190 } : {}),
        ...(imageUrl ? { directImageUrl: imageUrl } : {}),
      });
    }
  }

  if (fullHtml) {
    return (
      <div className="w-full h-full border-0 block relative bg-white">
        <StaticPreview
          winId={win.id}
          title={title}
          html={fullHtml}
          scrollTop={getScroll(win.id)?.y ?? 0}
          onLinkClick={handleLinkClick}
          onScrollChange={handleScrollChange}
        />
      </div>
    );
  }

  if (title.startsWith("File:")) {
    const imgUrl = win.directImageUrl ?? fileInfo?.url;
    return (
      <div className="w-full h-full border-0 block relative bg-white">
        <div className="flex items-center justify-center h-full bg-[#f8f9fa]">
          {imgUrl ? (
            <img
              src={imgUrl}
              alt={title.replace(/_/g, " ")}
              className="max-w-full max-h-full object-contain"
            />
          ) : (
            <div className="text-center text-[#666] text-[13px] p-4">
              <strong className="block mb-1.5 text-[15px] text-[#222]">{title.replace(/_/g, " ")}</strong>
              <p>Loading image…</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (title.startsWith("Special:") || title.startsWith("Help:") || title.startsWith("Wikipedia:")) {
    return (
      <div className="w-full h-full border-0 block relative bg-white">
        <div className="text-center text-[#666] text-[13px] p-4">
          <strong className="block mb-1.5 text-[15px] text-[#222]">{title.replace(/_/g, " ")}</strong>
          <p>Not an article</p>
          <p className="text-[11px] text-[#999]">{title.split(":")[0]} pages can't be displayed</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full h-full border-0 block relative bg-white ${loading ? "" : ""}`}>
      {loading && <div className="absolute inset-0 flex items-center justify-center text-[13px] text-[#666]">Loading article…</div>}
      {!loading && (
        <div className="text-center text-[#666] text-[13px] p-4">
          <strong className="block mb-1.5 text-[15px] text-[#222]">{title.replace(/_/g, " ")}</strong>
          <p>Could not load article</p>
        </div>
      )}
    </div>
  );
});

export default ArticleView;
