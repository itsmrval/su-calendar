import { escape } from "./ics.js";

export const JUSSIEU = { address: "4 place Jussieu, 75005 Paris", lat: 48.846346, lon: 2.355041 };
export const CLERY = { address: "12 rue de Cléry, 75002 Paris", lat: 48.867609, lon: 2.345211 };

export function placeLines(title, { address, lat, lon }) {
  const quoted = (text) => `"${text.replace(/"/g, "'")}"`;
  return [
    `LOCATION:${escape(title)}`,
    `X-APPLE-STRUCTURED-LOCATION;VALUE=URI;X-ADDRESS=${quoted(address)};X-APPLE-RADIUS=100;X-TITLE=${quoted(title)}:geo:${lat},${lon}`,
    `GEO:${lat};${lon}`,
  ];
}
