/**
 * Fixed water source locations on the globe.
 * Drones refill here. Positioned near major bodies of water.
 */

export type WaterSource = {
  id: string;
  lat: number;
  lng: number;
  name: string;
};

export const WATER_SOURCES: WaterSource[] = [
  { id: 'ws-atlantic', lat: 30, lng: -40, name: 'Mid-Atlantic' },
  { id: 'ws-pacific', lat: 0, lng: -140, name: 'Central Pacific' },
  { id: 'ws-indian', lat: -10, lng: 70, name: 'Indian Ocean' },
  { id: 'ws-mediterranean', lat: 35, lng: 15, name: 'Mediterranean' },
  { id: 'ws-caribbean', lat: 18, lng: -75, name: 'Caribbean' },
  { id: 'ws-northsea', lat: 55, lng: 3, name: 'North Sea' },
  { id: 'ws-greatlakes', lat: 45, lng: -85, name: 'Great Lakes' },
  { id: 'ws-southchina', lat: 15, lng: 115, name: 'South China Sea' },
  { id: 'ws-guinea', lat: 3, lng: 3, name: 'Gulf of Guinea' },
  { id: 'ws-coral', lat: -15, lng: 155, name: 'Coral Sea' },
  { id: 'ws-arabian', lat: 15, lng: 65, name: 'Arabian Sea' },
  { id: 'ws-bengal', lat: 15, lng: 88, name: 'Bay of Bengal' },
];
