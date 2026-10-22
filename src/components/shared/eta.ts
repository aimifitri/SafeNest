// Travel time from the routing service. This is a ROAD route from the public OSRM demo server
// (no live traffic). It is never a straight-line guess. If the service cannot be reached the caller
// gets { ok:false } and Today says the estimate is unavailable instead of inventing a number.
export type LatLng = { latitude: number; longitude: number };
export type RouteResult = { ok: true; minutes: number } | { ok: false; reason: "network" | "no_route" };

export async function fetchRouteMinutes(
  from: LatLng,
  to: LatLng,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<RouteResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  opts.signal?.addEventListener("abort", cancel);
  if (opts.signal?.aborted) cancel();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000);
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=false`;
    const res = await doFetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!res.ok) return { ok: false, reason: "network" };
    const body = (await res.json()) as { code?: string; routes?: Array<{ duration?: number }> };
    const seconds = body.routes?.[0]?.duration;
    if (body.code !== "Ok" || typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) {
      return { ok: false, reason: "no_route" };
    }
    return { ok: true, minutes: Math.max(1, Math.ceil(seconds / 60)) };
  } catch {
    return { ok: false, reason: "network" };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", cancel);
  }
}
