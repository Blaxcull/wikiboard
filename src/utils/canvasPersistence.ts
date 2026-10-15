import { useWindows, type WindowData, type WindowGroup } from "../store/windows";
import { getCamera } from "./camera";
import { setZoomImmediate } from "./canvas/zoom";

export const DEFAULT_FILE_EXTENSION = ".xboard";
export const ACCEPTED_EXTENSIONS = [".xboard", ".wikiboard", ".json"];

export interface XBoardDocument {
  app: "Xboard";
  version: 1;
  name: string;
  savedAt: string;
  camera: {
    panX: number;
    panY: number;
    zoom: number;
  };
  maxZIndex: number;
  connectionStyle?: "pointy" | "curved";
  windows: WindowData[];
  groups: WindowGroup[];
}

/**
 * Converts a local blob: URL (from local file uploads) to a base64 data URL
 * so that saved files are self-contained and work across sessions and computers.
 */
async function blobUrlToDataUrl(url: string): Promise<string> {
  if (!url.startsWith("blob:")) return url;
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn("[Xboard] Could not convert blob URL to data URL:", url, err);
    return url;
  }
}

/**
 * Gathers all canvas state, converts ephemeral blob URLs into data URLs,
 * and builds a complete XBoardDocument object.
 */
export async function exportCanvasDocument(): Promise<XBoardDocument> {
  const state = useWindows.getState();
  const camera = getCamera();

  // Convert any ephemeral local file blobs (PDFs / images) to persistent data URLs
  const processedWindows = await Promise.all(
    state.windows.map(async (win) => {
      let updated = win;
      if (win.pdfUrl && win.pdfUrl.startsWith("blob:")) {
        const dataUrl = await blobUrlToDataUrl(win.pdfUrl);
        updated = { ...updated, pdfUrl: dataUrl };
      }
      if (win.directImageUrl && win.directImageUrl.startsWith("blob:")) {
        const dataUrl = await blobUrlToDataUrl(win.directImageUrl);
        updated = { ...updated, directImageUrl: dataUrl };
      }
      return updated;
    })
  );

  return {
    app: "Xboard",
    version: 1,
    name: "Canvas",
    savedAt: new Date().toISOString(),
    camera: {
      panX: Math.round(camera.panX),
      panY: Math.round(camera.panY),
      zoom: Number(camera.zoom.toFixed(4)),
    },
    maxZIndex: state.maxZIndex,
    connectionStyle: state.connectionStyle,
    windows: processedWindows,
    groups: state.groups,
  };
}

/**
 * Restores a loaded XBoardDocument into the canvas state and camera.
 */
export function applyCanvasDocument(doc: Partial<XBoardDocument>): boolean {
  if (!doc || !Array.isArray(doc.windows)) {
    throw new Error("Invalid Xboard file: Missing windows array.");
  }

  useWindows.getState().loadBoard({
    windows: doc.windows,
    groups: Array.isArray(doc.groups) ? doc.groups : [],
    maxZIndex: typeof doc.maxZIndex === "number" ? doc.maxZIndex : undefined,
    connectionStyle: doc.connectionStyle,
  });

  if (doc.camera) {
    const zoom = typeof doc.camera.zoom === "number" ? doc.camera.zoom : 1;
    const panX = typeof doc.camera.panX === "number" ? doc.camera.panX : 0;
    const panY = typeof doc.camera.panY === "number" ? doc.camera.panY : 0;
    setZoomImmediate(zoom, panX, panY);
  }

  return true;
}

/**
 * Saves the current Xboard canvas to the user's local PC via the native File Manager.
 * Uses window.showSaveFilePicker if available, otherwise falls back to browser download.
 */
export async function saveCanvasToFile(): Promise<boolean> {
  const doc = await exportCanvasDocument();
  const jsonContent = JSON.stringify(doc, null, 2);
  const dateStr = new Date().toISOString().slice(0, 10);
  const fileName = `xboard-${dateStr}${DEFAULT_FILE_EXTENSION}`;

  // Native Chromium File System Access API
  if ("showSaveFilePicker" in window) {
    try {
      const picker = (window as unknown as { showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker;
      const handle = await picker({
        suggestedName: fileName,
        types: [
          {
            description: "Xboard Canvas Document (*.xboard, *.wikiboard, *.json)",
            accept: {
              "application/json": ACCEPTED_EXTENSIONS,
            },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(jsonContent);
      await writable.close();
      return true;
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError") {
        // User deliberately cancelled the file picker dialog
        return false;
      }
      console.warn("[Xboard] showSaveFilePicker failed, falling back to download:", err);
    }
  }

  // Cross-browser download fallback
  try {
    const blob = new Blob([jsonContent], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch (err) {
    console.error("[Xboard] Fallback download failed:", err);
    return false;
  }
}

/**
 * Opens a local file picker to load an Xboard document and restores the board.
 * Uses window.showOpenFilePicker if available, otherwise falls back to a hidden file input.
 */
export async function loadCanvasFromFile(): Promise<void> {
  if ("showOpenFilePicker" in window) {
    try {
      const picker = (window as unknown as { showOpenFilePicker: (opts: unknown) => Promise<FileSystemFileHandle[]> }).showOpenFilePicker;
      const handles = await picker({
        types: [
          {
            description: "Xboard Canvas Document (*.xboard, *.wikiboard, *.json)",
            accept: {
              "application/json": ACCEPTED_EXTENSIONS,
              "text/plain": ACCEPTED_EXTENSIONS,
            },
          },
        ],
        multiple: false,
      });

      if (!handles || handles.length === 0) return;
      const file = await handles[0].getFile();
      const content = await file.text();
      const parsed = JSON.parse(content) as Partial<XBoardDocument>;
      applyCanvasDocument(parsed);
      return;
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError") {
        // User cancelled the file picker dialog
        return;
      }
      console.warn("[Xboard] showOpenFilePicker failed, falling back to file input:", err);
    }
  }

  // Fallback: programmatically create a file input element
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ACCEPTED_EXTENSIONS.join(",");
  input.style.display = "none";

  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      const parsed = JSON.parse(content) as Partial<XBoardDocument>;
      applyCanvasDocument(parsed);
    } catch (parseErr) {
      console.error("[Xboard] Failed to parse imported file:", parseErr);
      alert("Failed to load Xboard file. Please verify it is a valid .xboard or .json file.");
    } finally {
      input.remove();
    }
  };

  document.body.appendChild(input);
  input.click();
}
