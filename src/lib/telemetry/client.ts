/**
 * Fire-and-forget telemetry beacons from the public (diner) pages.
 *
 * Mock-mode fixture ids aren't uuids — beacons for them are skipped client-side
 * so dev consoles stay free of 400 noise. All failures are swallowed: telemetry
 * must never affect the diner experience.
 */

const CLIENT_ID_KEY = "tavli-client-id";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Device-generated random id persisted alongside the local saved list. */
export function getTelemetryClientId(): string {
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id || !UUID_RE.test(id)) {
    id = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

function post(payload: Record<string, unknown>): void {
  try {
    void fetch("/api/telemetry", {
      method: "POST",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {});
  } catch {
    // ignore — telemetry is best-effort
  }
}

export function sendViewBeacon(restaurantId: string, locale: string): void {
  if (!UUID_RE.test(restaurantId)) return;
  post({ type: "view", restaurantId, locale });
}

export function sendSaveBeacon(restaurantId: string, saved: boolean): void {
  if (!UUID_RE.test(restaurantId)) return;
  post({ type: "save", restaurantId, clientId: getTelemetryClientId(), saved });
}
