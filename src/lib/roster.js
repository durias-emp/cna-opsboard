// ── The ONE place the team is defined in code ────────────────────────────────
// Used as the fallback until migrations/2026-08-22-team-roster.sql has been run;
// after that the live source is the team_profiles table (see src/context/TeamContext.jsx).
//
// group:      'pilot' | 'mechanic' | 'operations'
// management: can see and create management-only tasks

export const FALLBACK_ROSTER = [
  { name: 'James McBride',   group: 'pilot',      role: 'Pilot',               management: true  },
  { name: 'Jay McMackin',    group: 'pilot',      role: 'Pilot',               management: false },
  { name: 'Daniel Sandoval', group: 'pilot',      role: 'Pilot',               management: false },
  { name: 'Cesar Espinoza',  group: 'mechanic',   role: 'Aircraft Mechanic',   management: false },
  { name: 'Antony Villalta', group: 'mechanic',   role: 'Aircraft Mechanic',   management: false },
  { name: 'Luis Soriano',    group: 'mechanic',   role: 'Aircraft Mechanic',   management: false },
  { name: 'Javier Ascencio', group: 'operations', role: 'Head Regulator',      management: true  },
  { name: 'Alonia Ascencio', group: 'operations', role: 'Assistant Regulator', management: true  },
  { name: 'Diego Urias',     group: 'operations', role: 'Operations',          management: true  },
  { name: 'Kelly Moreno',    group: 'operations', role: 'Operations',          management: true  },
]

// Derive every list the app needs from one roster array
export function deriveTeam(roster) {
  const active     = roster.filter(m => m.active !== false)
  const byGroup    = g => active.filter(m => m.group === g)
  return {
    members:         active,
    pilots:          byGroup('pilot'),
    mechanics:       byGroup('mechanic'),
    operations:      byGroup('operations'),
    names:           active.map(m => m.name),
    managementNames: new Set(active.filter(m => m.management).map(m => m.name)),
  }
}
