/**
 * Fixed water sources for refill (water drones, heavy tankers).
 * ~40 points spread across the globe: oceans, seas, major lakes, key rivers.
 */

import { angularDistanceDeg } from "@/utils/geo";

/** Max distance (degrees) to consider an agent "at" a water source for refill. */
export const WATER_SOURCE_RADIUS_DEG = 2.5;

export type WaterSource = {
  id: string;
  lat: number;
  lng: number;
  name: string;
};

export const WATER_SOURCES: WaterSource[] = [
  // Oceans (7)
  { id: "pacific-central", lat: 0, lng: -160, name: "Pacific Ocean" },
  { id: "pacific-west", lat: 10, lng: 170, name: "Pacific Ocean (W)" },
  { id: "atlantic-central", lat: 25, lng: -40, name: "Atlantic Ocean" },
  { id: "atlantic-north", lat: 50, lng: -25, name: "Atlantic Ocean (N)" },
  { id: "indian-central", lat: -15, lng: 75, name: "Indian Ocean" },
  { id: "southern", lat: -58, lng: -30, name: "Southern Ocean" },
  { id: "arctic", lat: 78, lng: 10, name: "Arctic Ocean" },
  // Seas & gulfs (18)
  { id: "mediterranean", lat: 38, lng: 12, name: "Mediterranean Sea" },
  { id: "caribbean", lat: 18, lng: -75, name: "Caribbean Sea" },
  { id: "north-sea", lat: 56, lng: 4, name: "North Sea" },
  { id: "baltic", lat: 58, lng: 20, name: "Baltic Sea" },
  { id: "black-sea", lat: 43, lng: 34, name: "Black Sea" },
  { id: "red-sea", lat: 22, lng: 38, name: "Red Sea" },
  { id: "arabian-sea", lat: 15, lng: 65, name: "Arabian Sea" },
  { id: "south-china-sea", lat: 12, lng: 115, name: "South China Sea" },
  { id: "bering-sea", lat: 58, lng: -175, name: "Bering Sea" },
  { id: "caspian", lat: 42, lng: 50, name: "Caspian Sea" },
  { id: "gulf-of-mexico", lat: 25, lng: -95, name: "Gulf of Mexico" },
  { id: "hudson-bay", lat: 60, lng: -85, name: "Hudson Bay" },
  { id: "persian-gulf", lat: 27, lng: 51, name: "Persian Gulf" },
  { id: "gulf-of-guinea", lat: 0, lng: 6, name: "Gulf of Guinea" },
  { id: "tasman-sea", lat: -38, lng: 162, name: "Tasman Sea" },
  { id: "coral-sea", lat: -15, lng: 150, name: "Coral Sea" },
  { id: "gulf-of-bengal", lat: 15, lng: 88, name: "Bay of Bengal" },
  { id: "gulf-of-california", lat: 26, lng: -110, name: "Gulf of California" },
  // Major lakes (7)
  { id: "lake-superior", lat: 47.5, lng: -87.5, name: "Lake Superior" },
  { id: "lake-victoria", lat: -1, lng: 33, name: "Lake Victoria" },
  { id: "lake-baikal", lat: 54, lng: 108, name: "Lake Baikal" },
  { id: "lake-tanganyika", lat: -6, lng: 30, name: "Lake Tanganyika" },
  { id: "lake-titicaca", lat: -15.5, lng: -69.5, name: "Lake Titicaca" },
  { id: "great-salt-lake", lat: 41, lng: -112, name: "Great Salt Lake" },
  { id: "lake-chad", lat: 13, lng: 14, name: "Lake Chad" },
  // Key rivers (8)
  { id: "amazon-mouth", lat: 0, lng: -50, name: "Amazon (mouth)" },
  { id: "nile-delta", lat: 31, lng: 31, name: "Nile (delta)" },
  { id: "yangtze-mouth", lat: 31, lng: 122, name: "Yangtze (mouth)" },
  { id: "mississippi-mouth", lat: 29, lng: -89, name: "Mississippi (mouth)" },
  { id: "ganges-mouth", lat: 22, lng: 90, name: "Ganges (mouth)" },
  { id: "congo-mouth", lat: -6, lng: 12, name: "Congo (mouth)" },
  { id: "mekong-mouth", lat: 10, lng: 106, name: "Mekong (mouth)" },
  { id: "st-lawrence-mouth", lat: 49, lng: -70, name: "St. Lawrence (mouth)" },
  { id: "murray-mouth", lat: -35, lng: 139, name: "Murray (mouth)" },
];

/** True if (lat, lng) is within WATER_SOURCE_RADIUS_DEG of any water source. */
export function isAtWaterSource(lat: number, lng: number): boolean {
  for (const src of WATER_SOURCES) {
    if (angularDistanceDeg(lat, lng, src.lat, src.lng) <= WATER_SOURCE_RADIUS_DEG) {
      return true;
    }
  }
  return false;
}
