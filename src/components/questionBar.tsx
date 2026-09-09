import { useCallback, useEffect, useRef, useState } from "react";
import { useWindows } from "../store/windows";
import { searchArticles, type QAResult } from "../utils/qa";

export default function QuestionBar() {
  const setActive = useWindows((s) => s.setActive);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<QAResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [hasTyped, setHasTyped] = useState(false);
  const abortRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const glowRef = useRef<{ el: HTMLElement; handlers: Map<string, () => void> } | null>(null);

  const clearGlow = useCallback(() => {
    if (glowRef.current) {
      glowRef.current.el.classList.remove("qa-glow");
      for (const [evt, handler] of glowRef.current.handlers) {
        glowRef.current.el.removeEventListener(evt, handler);
      }
      glowRef.current = null;
    }
  }, []);

  const runSearch = useCallback((q: string) => {
    const trimmed = q.trim();
    if (!trimmed || trimmed.length < 3) {
      setResults([]);
      setShowDropdown(false);
      return;
    }
    const found = searchArticles(trimmed);
    setResults(found);
    setShowDropdown(true);
  }, []);

  // Debounced live search on every keystroke
  useEffect(() => {
    if (abortRef.current) clearTimeout(abortRef.current);
    abortRef.current = setTimeout(() => {
      runSearch(query);
    }, 250);
    return () => {
      if (abortRef.current) clearTimeout(abortRef.current);
    };
  }, [query, runSearch]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setHasTyped(val.trim().length > 0);
    if (!val.trim()) clearGlow();
  };

  const handleFocus = () => {
    if (hasTyped) setShowDropdown(true);
  };

  const handleBlur = (e: React.FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setTimeout(() => setShowDropdown(false), 200);
    }
  };

  const focusWindow = useCallback(
    (windowId: string) => {
      clearGlow();

      const el = document.getElementById(`win-${windowId}`);
      if (el) {
        el.classList.add("qa-glow");

        const handlers = new Map<string, () => void>();

        const onInteract = () => {
          clearGlow();
        };

        handlers.set("mousedown", onInteract);
        handlers.set("touchstart", onInteract);
        el.addEventListener("mousedown", onInteract, { once: true, passive: true });
        el.addEventListener("touchstart", onInteract, { once: true, passive: true });

        glowRef.current = { el, handlers };
      }

      setActive(windowId);
      setShowDropdown(false);
    },
    [setActive, clearGlow],
  );

  return (
    <div className="qa-wrap" onBlur={handleBlur}>
      <form className="qa-form" onSubmit={(e) => e.preventDefault()}>
        <input
          className="qa-input"
          value={query}
          onChange={handleChange}
          onFocus={handleFocus}
          placeholder="Ask a question about your open articles…"
        />
      </form>

      {showDropdown && hasTyped && (
        <div className="qa-dropdown">
          {results.length === 0 ? (
            <div className="qa-empty">Not enough info</div>
          ) : (
            results.map((r, i) => (
              <button
                key={i}
                className="qa-result"
                onClick={() => focusWindow(r.windowId)}
              >
                <div className="qa-answer">{r.answer}</div>
                <div className="qa-source">
                  <span className="qa-ref">{r.articleTitle}</span>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
