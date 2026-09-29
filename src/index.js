import { calendar } from "./lib/ics.js";
import { cfaEvents } from "./sources/cfa.js";
import { uniCalendar } from "./sources/uni.js";

const DAY = 86_400_000;
const PATH = "/index.ics";

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname !== PATH) {
      return new Response("Not found", { status: 404 });
    }

    const now = Date.now();
    const from = now - env.PAST_DAYS * DAY;
    const to = now + env.WINDOW_DAYS * DAY;

    const [uni, cfa] = await Promise.allSettled([uniCalendar(from, to), cfaEvents(env, from, to)]);
    const errors = [uni, cfa].filter((r) => r.status === "rejected").map((r) => r.reason.message);
    if (errors.length === 2) return new Response(errors.join("\n"), { status: 502 });

    const uniEvents = uni.value?.events ?? [];
    const publishedUntil = uni.value?.publishedUntil ?? -Infinity;
    const cfaOnly = (cfa.value ?? [])
      .filter((e) => !(e.course === "SU" && e.start <= publishedUntil))
      .map((e) => e.ics);

    const headers = { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store" };
    if (errors.length) headers["X-Errors"] = encodeURIComponent(errors.join("; "));

    return new Response(calendar("M1 RES + CFA", [...uniEvents, ...cfaOnly]), { headers });
  },
};
