/** Nigerian states (ISO 3166-2:NG) with capital coordinates, used for coarse, privacy-safe location. */
export const NG_STATES: Record<string, { name: string; lat: number; lon: number }> = {
  AB: { name: "Abia", lat: 5.53, lon: 7.49 },
  AD: { name: "Adamawa", lat: 9.21, lon: 12.48 },
  AK: { name: "Akwa Ibom", lat: 5.03, lon: 7.93 },
  AN: { name: "Anambra", lat: 6.21, lon: 7.07 },
  BA: { name: "Bauchi", lat: 10.31, lon: 9.84 },
  BY: { name: "Bayelsa", lat: 4.93, lon: 6.27 },
  BE: { name: "Benue", lat: 7.73, lon: 8.54 },
  BO: { name: "Borno", lat: 11.83, lon: 13.15 },
  CR: { name: "Cross River", lat: 4.95, lon: 8.32 },
  DE: { name: "Delta", lat: 6.2, lon: 6.73 },
  EB: { name: "Ebonyi", lat: 6.32, lon: 8.11 },
  ED: { name: "Edo", lat: 6.34, lon: 5.63 },
  EK: { name: "Ekiti", lat: 7.62, lon: 5.22 },
  EN: { name: "Enugu", lat: 6.44, lon: 7.49 },
  FC: { name: "FCT Abuja", lat: 9.06, lon: 7.49 },
  GO: { name: "Gombe", lat: 10.29, lon: 11.17 },
  IM: { name: "Imo", lat: 5.48, lon: 7.03 },
  JI: { name: "Jigawa", lat: 11.76, lon: 9.34 },
  KD: { name: "Kaduna", lat: 10.52, lon: 7.44 },
  KN: { name: "Kano", lat: 12.0, lon: 8.52 },
  KT: { name: "Katsina", lat: 12.99, lon: 7.6 },
  KE: { name: "Kebbi", lat: 12.45, lon: 4.2 },
  KO: { name: "Kogi", lat: 7.8, lon: 6.74 },
  KW: { name: "Kwara", lat: 8.5, lon: 4.55 },
  LA: { name: "Lagos", lat: 6.6, lon: 3.35 },
  NA: { name: "Nasarawa", lat: 8.49, lon: 8.52 },
  NI: { name: "Niger", lat: 9.61, lon: 6.56 },
  OG: { name: "Ogun", lat: 7.16, lon: 3.35 },
  ON: { name: "Ondo", lat: 7.25, lon: 5.19 },
  OS: { name: "Osun", lat: 7.77, lon: 4.56 },
  OY: { name: "Oyo", lat: 7.38, lon: 3.93 },
  PL: { name: "Plateau", lat: 9.9, lon: 8.86 },
  RI: { name: "Rivers", lat: 4.82, lon: 7.03 },
  SO: { name: "Sokoto", lat: 13.06, lon: 5.24 },
  TA: { name: "Taraba", lat: 8.89, lon: 11.36 },
  YO: { name: "Yobe", lat: 11.75, lon: 11.96 },
  ZA: { name: "Zamfara", lat: 12.16, lon: 6.66 },
};

export function isState(code: string | null | undefined): code is string {
  return !!code && code in NG_STATES;
}

export function stateName(code: string | null | undefined): string {
  return code && NG_STATES[code] ? NG_STATES[code].name : "Unknown";
}

export function distanceKm(a: string, b: string): number {
  const p = NG_STATES[a];
  const q = NG_STATES[b];
  const rad = Math.PI / 180;
  const dLat = (q.lat - p.lat) * rad;
  const dLon = (q.lon - p.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(p.lat * rad) * Math.cos(q.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
