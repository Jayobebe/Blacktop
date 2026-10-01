/**
 * Demo mode's crews (lib/demoMode): four made-up crews, so the crew list,
 * switching, the full-slots notice and every crew screen show something real
 * without touching the rider's own crews or the server. Made-up names stay in
 * English, like the Enterprise demo's. Distances in miles and speeds in mph,
 * as the boards store them.
 */
export const DEMO_OWN_CREW = 'BT7K2Q';

/** [code, the demo rider's name for it (null = the default "Crew CODE"), joined days ago]. */
export const DEMO_CREW_LIST: [string, string | null, number | null][] = [
  [DEMO_OWN_CREW, null, null],
  ['SUN4DY', 'Sunday Scratchers', 120],
  ['TRK8RT', 'Track Rats', 45],
  ['CAF3RN', 'Café Run', 9],
];

/** The crew demo mode opens on. */
export const DEMO_ACTIVE_CREW = 'SUN4DY';

type Member = {
  name: string;
  /** Lifetime miles, top speed (null = keeps peaks private), max lean, rides, Hit Heavy G, Petrol Head seconds. */
  total: [number, number | null, number | null, number, number, number];
  /** This week: miles, rides, max lean, corner score, top speed, night rides, longest ride. */
  week: [number, number, number | null, number | null, number | null, number, number];
};

const ME = 'Demo Rider';

const MEMBERS: Record<string, Member[]> = {
  [DEMO_OWN_CREW]: [
    { name: ME, total: [1843.2, 118, 47, 96, 3.42, 212], week: [142.6, 4, 44, 71, 104, 1, 58.3] },
    { name: 'Jules', total: [962.4, 97, 39, 58, 2.81, 145], week: [88.1, 3, 36, 64, 92, 0, 41.0] },
    { name: 'Sam', total: [2310.7, null, null, 131, 4.05, 98], week: [201.4, 5, null, null, null, 2, 77.9] },
  ],
  SUN4DY: [
    { name: 'Marco', total: [4120.5, 131, 52, 188, 3.95, 260], week: [236.8, 5, 49, 82, 121, 1, 96.4] },
    { name: ME, total: [1843.2, 118, 47, 96, 3.42, 212], week: [142.6, 4, 44, 71, 104, 1, 58.3] },
    { name: 'Priya', total: [2655.0, 109, 45, 140, 2.66, 301], week: [174.2, 4, 43, 75, 99, 0, 62.5] },
    { name: 'Dave', total: [1290.8, null, null, 77, 4.48, 133], week: [61.3, 2, null, null, null, 0, 33.1] },
    { name: 'Kit', total: [705.4, 92, 41, 39, 2.12, 187], week: [96.7, 3, 40, 66, 88, 2, 44.8] },
  ],
  TRK8RT: [
    { name: 'Lena', total: [3302.9, 154, 58, 162, 3.71, 244], week: [118.0, 3, 56, 90, 149, 0, 64.2] },
    { name: 'Ozzy', total: [2788.3, 149, 55, 133, 4.22, 176], week: [93.5, 2, 54, 87, 143, 0, 52.0] },
    { name: ME, total: [1843.2, 118, 47, 96, 3.42, 212], week: [142.6, 4, 44, 71, 104, 1, 58.3] },
    { name: 'Hana', total: [1510.6, 138, 53, 84, 3.08, 158], week: [77.9, 2, 51, 85, 131, 1, 45.6] },
  ],
  CAF3RN: [
    { name: 'Tom', total: [880.2, 84, 35, 61, 2.54, 119], week: [54.8, 3, 33, 58, 79, 0, 21.4] },
    { name: ME, total: [1843.2, 118, 47, 96, 3.42, 212], week: [142.6, 4, 44, 71, 104, 1, 58.3] },
    { name: 'Bea', total: [1104.9, 88, 37, 70, 2.37, 166], week: [66.0, 3, 35, 62, 81, 0, 28.7] },
  ],
};

const members = (code: string) => MEMBERS[code] ?? MEMBERS[DEMO_OWN_CREW];

export function demoLeaderboard(code: string) {
  return members(code).map((m) => ({
    display_name: m.name,
    total_distance: m.total[0],
    top_speed: m.total[1],
    max_lean: m.total[2],
    ride_count: m.total[3],
    hit_heavy: m.total[4],
    petrol_head: m.total[5],
  }));
}

export function demoChallenge(code: string) {
  return members(code).map((m) => ({
    display_name: m.name,
    distance: m.week[0],
    ride_count: m.week[1],
    max_lean: m.week[2],
    corner_score: m.week[3],
    top_speed: m.week[4],
    night_rides: m.week[5],
    longest_ride: m.week[6],
  }));
}

/** The month so far: roughly three weeks of the crew's weekly pace. */
export function demoMonth(code: string) {
  const ms = members(code);
  return {
    distance: Math.round(ms.reduce((s, m) => s + m.week[0], 0) * 2.6),
    ride_count: Math.round(ms.reduce((s, m) => s + m.week[1], 0) * 2.6),
    members: ms.length,
  };
}

/** Sunday Scratchers has a convoy out on the road; the other crews are quiet. */
export function demoCrewConvoys(code: string) {
  if (code !== 'SUN4DY') return [];
  return [
    {
      id: 'demo-crew-convoy',
      code: 'BXH7QZ',
      name: "Marco's Convoy",
      leader_name: 'Marco',
      member_count: 4,
      destination_name: 'Box Hill',
      destination_address: 'Zig Zag Road, Dorking',
      is_riding: true,
      created_at: new Date(Date.now() - 38 * 60000).toISOString(),
    },
  ];
}

export function demoCrewConvoyDetail(id: string) {
  if (id !== 'demo-crew-convoy') return [];
  return [
    { member_name: 'Marco', is_leader: true, lat: 51.2556, lng: -0.3221, top_speed: 71, distance_driven: 24.8 },
    { member_name: 'Priya', is_leader: false, lat: 51.2561, lng: -0.3240, top_speed: 68, distance_driven: 24.6 },
    { member_name: 'Kit', is_leader: false, lat: 51.2570, lng: -0.3262, top_speed: 66, distance_driven: 24.3 },
    { member_name: 'Dave', is_leader: false, lat: 51.2579, lng: -0.3281, top_speed: null, distance_driven: 24.1 },
  ];
}
