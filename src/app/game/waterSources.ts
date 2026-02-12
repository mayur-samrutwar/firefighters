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
  // Major inland / coastal clusters so drones don’t always cross oceans
  { id: 'ws-nile', lat: 30, lng: 31, name: 'Nile Delta' },
  { id: 'ws-victoria', lat: -2, lng: 33, name: 'Lake Victoria' },
  { id: 'ws-caspian', lat: 44, lng: 50, name: 'Caspian Sea' },
  { id: 'ws-blacksea', lat: 43, lng: 35, name: 'Black Sea' },
  { id: 'ws-amazon', lat: -3, lng: -55, name: 'Amazon Basin' },
  { id: 'ws-parana', lat: -30, lng: -58, name: 'Paraná River' },
  { id: 'ws-colorado', lat: 37, lng: -113, name: 'Southwest Reservoirs' },
  { id: 'ws-mississippi', lat: 34, lng: -91, name: 'Mississippi River' },
  { id: 'ws-yangtze', lat: 30, lng: 112, name: 'Yangtze Basin' },
  { id: 'ws-ganges', lat: 25, lng: 88, name: 'Ganges Delta' },
  { id: 'ws-murray', lat: -34, lng: 143, name: 'Murray-Darling' },
  { id: 'ws-lakebaikal', lat: 53, lng: 108, name: 'Lake Baikal' },
];
