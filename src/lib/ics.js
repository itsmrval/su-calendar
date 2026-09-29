export const toUtc = (date) => date.toISOString().replace(/[-:]|\.\d+/g, "");

export const escape = (text) =>
  String(text).replace(/[\\;,]/g, "\\$&").replace(/\n/g, "\\n");

export function parseDate(value) {
  const m = value?.match(/^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d))?/);
  if (!m) return null;
  const [, y, mo, d, h = 0, mi = 0, s = 0] = m;
  return Date.UTC(y, mo - 1, d, h, mi, s);
}

export function fold(line) {
  const encoder = new TextEncoder();
  const chunks = [];
  let chunk = "";
  for (const char of line) {
    const limit = chunks.length ? 74 : 75;
    if (encoder.encode(chunk + char).length > limit) {
      chunks.push(chunk);
      chunk = "";
    }
    chunk += char;
  }
  return [...chunks, chunk].join("\r\n ");
}

export function calendar(name, components) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//su-calendar//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${name}`,
    "X-WR-TIMEZONE:Europe/Paris",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    ...components,
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
