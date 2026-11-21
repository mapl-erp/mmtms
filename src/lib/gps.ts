export type Point = { lat: number; lng: number };

export const CORRIDORS: Record<string, Point[]> = {
  MH14MM3501: [
    { lat: 19.076, lng: 72.878 },
    { lat: 18.99, lng: 73.14 },
    { lat: 18.75, lng: 73.41 },
    { lat: 18.52, lng: 73.856 },
    { lat: 18.75, lng: 73.41 },
    { lat: 18.99, lng: 73.14 },
  ],
  MH14MM3502: [
    { lat: 18.52, lng: 73.856 },
    { lat: 18.74, lng: 73.8 },
    { lat: 19.09, lng: 73.86 },
    { lat: 19.58, lng: 73.8 },
    { lat: 19.997, lng: 73.789 },
    { lat: 19.58, lng: 73.8 },
    { lat: 19.09, lng: 73.86 },
    { lat: 18.74, lng: 73.8 },
  ],
};

export const CITIES: { name: string; lat: number; lng: number }[] = [
  { name: "Mumbai", lat: 19.076, lng: 72.878 },
  { name: "Pune", lat: 18.52, lng: 73.856 },
  { name: "Nashik", lat: 19.997, lng: 73.789 },
];

const EPOCH = Date.UTC(2026, 10, 20);

export function simulateTruck(regNo: string, now = Date.now()) {
  const route = CORRIDORS[regNo] ?? CORRIDORS.MH14MM3501;
  const period = (regNo.endsWith("1") ? 8 : 11) * 60 * 1000;
  const t = ((now - EPOCH) % period + period) % period / period;
  const segments = route.length - 1;
  const cursor = t * segments;
  const index = Math.min(Math.floor(cursor), segments - 1);
  const along = cursor - index;
  const a = route[index];
  const b = route[index + 1];
  const lat = a.lat + (b.lat - a.lat) * along;
  const lng = a.lng + (b.lng - a.lng) * along;
  const heading = (Math.atan2(b.lng - a.lng, b.lat - a.lat) * 180) / Math.PI;
  const speedKmh = 48 + ((index * 7 + regNo.charCodeAt(regNo.length - 1)) % 5) * 3;
  return { regNo, lat, lng, speedKmh, heading, route };
}

export function project(lat: number, lng: number) {
  const minLng = 72.6;
  const maxLng = 74.3;
  const minLat = 18.25;
  const maxLat = 20.25;
  return {
    x: ((lng - minLng) / (maxLng - minLng)) * 860 + 30,
    y: ((maxLat - lat) / (maxLat - minLat)) * 520 + 24,
  };
}
