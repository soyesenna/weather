export const SEOUL_CENTER = { lat: 37.5665, lng: 126.9780 };

export const GU_CENTERS = [
  ['종로구', 37.5735, 126.9788], ['중구', 37.5636, 126.9976], ['용산구', 37.5326, 126.9904],
  ['성동구', 37.5634, 127.0369], ['광진구', 37.5385, 127.0823], ['동대문구', 37.5744, 127.0396],
  ['중랑구', 37.6063, 127.0925], ['성북구', 37.5894, 127.0167], ['강북구', 37.6396, 127.0257],
  ['도봉구', 37.6688, 127.0471], ['노원구', 37.6542, 127.0568], ['은평구', 37.6027, 126.9291],
  ['서대문구', 37.5791, 126.9368], ['마포구', 37.5663, 126.9018], ['양천구', 37.5170, 126.8665],
  ['강서구', 37.5509, 126.8495], ['구로구', 37.4955, 126.8877], ['금천구', 37.4569, 126.8955],
  ['영등포구', 37.5264, 126.8962], ['동작구', 37.5124, 126.9393], ['관악구', 37.4784, 126.9516],
  ['서초구', 37.4837, 127.0324], ['강남구', 37.5172, 127.0473], ['송파구', 37.5145, 127.1059],
  ['강동구', 37.5301, 127.1238],
] as const;

export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = 6371_000;
  const toRad = (v: number) => v * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat/2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng/2) ** 2;
  return Math.round(2 * r * Math.atan2(Math.sqrt(h), Math.sqrt(1-h)));
}

export function nearestGu(lat: number, lng: number) {
  return GU_CENTERS.map(([gu, glat, glng]) => ({ gu, d: haversineMeters({ lat, lng }, { lat: glat, lng: glng }) }))
    .sort((a, b) => a.d - b.d)[0].gu;
}
