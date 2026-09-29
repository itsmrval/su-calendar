import { fold, parseDate } from "../lib/ics.js";
import { JUSSIEU, placeLines } from "../lib/places.js";

const URL = "https://cal.ufr-info-p6.jussieu.fr/caldav.php/RES/M1_RES-ITESCIA/?export";
const AUTH = "student.master:guest";
const COURSE = /^(?:UM|MU)4IN\d+-([A-Z]+)-([A-Za-z]+?)(\d*)\b/;

export async function uniCalendar(from, to) {
  const res = await fetch(URL, { headers: { Authorization: `Basic ${btoa(AUTH)}` } });
  if (!res.ok) throw new Error(`University ${res.status}`);

  const text = (await res.text()).replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
  const timezones = text.match(/^BEGIN:VTIMEZONE$[\s\S]*?^END:VTIMEZONE$/gm) ?? [];
  const events = (text.match(/^BEGIN:VEVENT$[\s\S]*?^END:VEVENT$/gm) ?? []).map(parse);

  return {
    publishedUntil: Math.max(...events.map((e) => e.lastDate)),
    events: [
      ...timezones.map((tz) => tz.replace(/\n/g, "\r\n")),
      ...events.filter((e) => e.lastDate >= from && e.start <= to).map(render),
    ],
  };
}

function parse(block) {
  const lines = block.split("\n").filter((line) => !line.startsWith("X-APPLE-"));
  const prop = (key) => lines.find((l) => l.match(new RegExp(`^${key}[;:]`)))?.replace(/^[^:]*:/, "");

  const start = parseDate(prop("DTSTART"));
  const until = prop("RRULE")?.match(/UNTIL=(\w+)/)?.[1];
  const lastDate = until ? parseDate(until) : parseDate(prop("DTEND")) ?? start;
  return { lines, start, lastDate };
}

function render({ lines }) {
  let cancelled = false;
  let room = "";
  const body = lines.slice(1, -1).flatMap((line) => {
    const [key, value] = [line.replace(/[;:].*/, ""), line.replace(/^[^:]*:/, "")];
    if (key === "SUMMARY") {
      cancelled = /ANNUL/i.test(value);
      return `SUMMARY:${title(value)}`;
    }
    if (key === "LOCATION") room = location(value);
    if (["LOCATION", "STATUS", "GEO", "X-APPLE-STRUCTURED-LOCATION"].includes(key)) return [];
    return line;
  });
  return [
    "BEGIN:VEVENT",
    ...body,
    ...placeLines(room || "Jussieu", JUSSIEU),
    `STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
  ]
    .map(fold)
    .join("\r\n");
}

function title(summary) {
  const clean = summary.replace(/\s*ANNUL[ÉE]E?S?\s*/i, " ").trim();
  const match = clean.match(COURSE);
  if (!match) return `${clean} - SU`;
  const [, ue, kind, number] = match;
  const type = /^C[SM]$/i.test(kind) ? "Cours" : `${kind.toUpperCase()}${number}`;
  return `${type} ${ue} - SU`;
}

function location(value) {
  return value
    .replace(/\\([,;n])/g, (_, c) => (c === "n" ? " " : c))
    .replace(/\(?\s*Réservation[^)]*\)?/gi, "")
    .replace(/^\s*Salle[^:]*:\s*/i, "")
    .replace(/\s+et\s+/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}
