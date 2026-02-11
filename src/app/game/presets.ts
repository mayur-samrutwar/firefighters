import type { AgentRoute } from './store';

/** Preset routes for surveillance agents (each point is [lat, lng]) */
export const PRESET_ROUTES: { id: string; label: string; route: AgentRoute }[] = [
  {
    id: 'equator',
    label: 'Equator',
    route: [
      [-2, -180],
      [-2, -150],
      [-2, -120],
      [-2, -90],
      [-2, -60],
      [-2, -30],
      [-2, 0],
      [-2, 30],
      [-2, 60],
      [-2, 90],
      [-2, 120],
      [-2, 150],
      [-2, -180],
    ],
  },
  {
    id: 'polar',
    label: 'Polar orbit',
    route: [
      [85, 0],
      [60, 0],
      [30, 0],
      [0, 0],
      [-30, 0],
      [-60, 0],
      [-85, 0],
      [-60, 0],
      [-30, 0],
      [0, 0],
      [30, 0],
      [60, 0],
    ],
  },
  {
    id: 'tropical-north',
    label: 'Tropical north (23°N)',
    route: [
      [23, -180],
      [23, -90],
      [23, 0],
      [23, 90],
      [23, 180],
    ],
  },
  {
    id: 'tropical-south',
    label: 'Tropical south (23°S)',
    route: [
      [-23, -180],
      [-23, -90],
      [-23, 0],
      [-23, 90],
      [-23, 180],
    ],
  },
  {
    id: 'atlantic-europe',
    label: 'Atlantic–Europe pass',
    route: [
      [50, -30],
      [40, -10],
      [35, 10],
      [45, 25],
      [55, 15],
    ],
  },
];
