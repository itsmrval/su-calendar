import { escape, fold, toUtc } from "../lib/ics.js";
import { CLERY, JUSSIEU, placeLines } from "../lib/places.js";

const API = "https://connect.cfa-insta.fr/api";
const TOKEN_KEY = new Request("https://cfa.internal/token");
const CAMPUSES = { Cléry: CLERY };

export async function cfaEvents(env, from, to) {
  let token = await cachedToken(env);
  let courses;
  try {
    courses = await get("courses/all-course-occurences", token);
  } catch (error) {
    if (error.status !== 401) throw error;
    await caches.default.delete(TOKEN_KEY);
    token = await cachedToken(env);
    courses = await get("courses/all-course-occurences", token);
  }
  const rooms = await get("rooms", token).catch(() => []);
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

async function cachedToken(env) {
  const hit = await caches.default.match(TOKEN_KEY);
  if (hit) return hit.text();

  const token = await login(env.CFA_EMAIL, env.CFA_PASSWORD);
  const { exp } = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
  const ttl = Math.max(60, Math.floor(exp - Date.now() / 1000 - 300));
  await caches.default.put(TOKEN_KEY, new Response(token, { headers: { "Cache-Control": `max-age=${ttl}` } }));
  return token;
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
  if (!res.ok) throw Object.assign(new Error(`CFA ${path} ${res.status}`), { status: res.status });
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
  const name = course.courseId?.name ?? "Cours";
  const atUniversity = name === "SU";
  const cancelled = course.cancelReason || /^CANCEL/i.test(course.status ?? "");
  const status = cancelled ? "CANCELLED" : atUniversity ? "TENTATIVE" : "CONFIRMED";
  const lines = [
    "BEGIN:VEVENT",
    `UID:cfa-${course._id}@connect.cfa-insta.fr`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${toUtc(new Date(course.start))}`,
    `DTEND:${toUtc(new Date(course.end))}`,
    `SUMMARY:${escape(atUniversity ? "Non défini - SU" : `${name} - CFA`)}`,
    ...(atUniversity ? placeLines("Jussieu", JUSSIEU) : roomLines(room)),
    course.cancelReason && `DESCRIPTION:${escape(course.cancelReason)}`,
    `STATUS:${status}`,
    "END:VEVENT",
  ];
  return lines.filter(Boolean).map(fold).join("\r\n");
}

function roomLines(room) {
  if (!room) return [];
  const campus = room.campus?.name;
  const title = campus ? `${room.name} - ${campus}` : room.name;
  return CAMPUSES[campus] ? placeLines(title, CAMPUSES[campus]) : [`LOCATION:${escape(title)}`];
}
