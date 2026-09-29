import { escape, fold, toUtc } from "../lib/ics.js";

const API = "https://connect.cfa-insta.fr/api";

export async function cfaEvents(env, from, to) {
  const token = await login(env.CFA_EMAIL, env.CFA_PASSWORD);
  const [courses, rooms] = await Promise.all([
    get("courses/all-course-occurences", token),
    get("rooms", token).catch(() => []),
  ]);
  const roomsById = new Map(rooms.map((room) => [room._id, room]));
  const stamp = toUtc(new Date());

  return courses
    .filter((course) => Date.parse(course.end) >= from && Date.parse(course.start) <= to)
    .map((course) => ({
      course: course.courseId?.name,
      start: Date.parse(course.start),
      ics: toEvent(course, roomsById.get(course.room), stamp),
    }));
}

async function login(email, pwd) {
  const res = await fetch(`${API}/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://connect.cfa-insta.fr" },
    body: JSON.stringify({
      email,
      pwd,
      deviceInfo: { screenResolution: "1512x982", language: "fr-FR", timezone: "Europe/Paris" },
    }),
  });
  if (!res.ok) throw new Error(`CFA login ${res.status}`);

  const token = findJwt(await res.json());
  if (!token) throw new Error("CFA login: no token");
  return token;
}

async function get(path, token) {
  const res = await fetch(`${API}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`CFA ${path} ${res.status}`);
  return (await res.json()).data;
}

function findJwt(value) {
  if (typeof value === "string") return /^eyJ[\w-]*\.[\w-]+\.[\w-]+$/.test(value) ? value : null;
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) {
      const token = findJwt(child);
      if (token) return token;
    }
  }
  return null;
}

function toEvent(course, room, stamp) {
  const cancelled = course.cancelReason || /^CANCEL/i.test(course.status ?? "");
  const lines = [
    "BEGIN:VEVENT",
    `UID:cfa-${course._id}@connect.cfa-insta.fr`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${toUtc(new Date(course.start))}`,
    `DTEND:${toUtc(new Date(course.end))}`,
    `SUMMARY:${escape(`${course.courseId?.name ?? "Cours"} - CFA`)}`,
    room && `LOCATION:${escape(location(room))}`,
    course.cancelReason && `DESCRIPTION:${escape(course.cancelReason)}`,
    `STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
  ];
  return lines.filter(Boolean).map(fold).join("\r\n");
}

function location({ name, campus }) {
  return campus?.name ? `${name} - ${campus.name}` : name;
}
