type CameraState = { panX: number; panY: number; zoom: number };
type CameraSubscriber = (cam: CameraState) => void;

let camera: CameraState = { panX: 0, panY: 0, zoom: 1 };
const subscribers = new Set<CameraSubscriber>();

export function getCamera(): CameraState {
  return camera;
}

export function setCamera(next: Partial<CameraState>) {
  Object.assign(camera, next);
  for (const fn of subscribers) fn(camera);
}

export function subscribeCamera(fn: CameraSubscriber): () => void {
  subscribers.add(fn);
  return () => { subscribers.delete(fn); };
}

/** Convert screen (client) coordinates to world coordinates. */
export function screenToWorld(sx: number, sy: number) {
  return {
    x: (sx - camera.panX) / camera.zoom,
    y: (sy - camera.panY) / camera.zoom,
  };
}

/** Convert world coordinates to screen (client) coordinates. */
export function worldToScreen(wx: number, wy: number) {
  return {
    x: wx * camera.zoom + camera.panX,
    y: wy * camera.zoom + camera.panY,
  };
}
