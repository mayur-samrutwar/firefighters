export type CirclePolygon = { type: 'Polygon'; coordinates: [number, number][][] };

/** Generate a GeoJSON Polygon approximating a circle. Coords are [lng, lat]. */
export function circleToPolygon(
  centerLat: number,
  centerLng: number,
  radiusDeg: number,
  points = 32
): CirclePolygon {
  const coords: [number, number][] = [];
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    const lat = centerLat + radiusDeg * Math.cos(angle);
    const lng = centerLng + (radiusDeg * Math.sin(angle)) / Math.max(0.01, Math.cos((centerLat * Math.PI) / 180));
    coords.push([lng, lat]);
  }
  return { type: 'Polygon', coordinates: [coords] };
}
