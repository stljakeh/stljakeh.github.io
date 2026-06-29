// ========== CONFIGURATION ==========
const FORMATIONS = {
  '4-3-3': { gk: 1, def: 4, mid: 3, fwd: 3, label: '4-3-3', desc: '1 GK \u00b7 4 DEF \u00b7 3 MID \u00b7 3 FWD' },
  '4-4-2': { gk: 1, def: 4, mid: 4, fwd: 2, label: '4-4-2', desc: '1 GK \u00b7 4 DEF \u00b7 4 MID \u00b7 2 FWD' },
  '3-5-2': { gk: 1, def: 3, mid: 5, fwd: 2, label: '3-5-2', desc: '1 GK \u00b7 3 DEF \u00b7 5 MID \u00b7 2 FWD' },
  '3-4-3': { gk: 1, def: 3, mid: 4, fwd: 3, label: '3-4-3', desc: '1 GK \u00b7 3 DEF \u00b7 4 MID \u00b7 3 FWD' },
  '5-3-2': { gk: 1, def: 5, mid: 3, fwd: 2, label: '5-3-2', desc: '1 GK \u00b7 5 DEF \u00b7 3 MID \u00b7 2 FWD' },
};
const POS_COLORS = { G: '#E2231A', D: '#1C3570', M: '#c0c0c0', F: '#E2231A' };
const POS_LABELS = { G: 'GK', D: 'DEF', M: 'MID', F: 'FWD' };
const TOTAL_GAMES = 34;
const DRAW_RATE = 0.18;
const USER_TEAM_ID = '21812';
const USER_CONF = 'west';
const PLAYOFF_TEAMS = 9;
const MIN_SEASON = 1996;
const MAX_SEASON = 2026;
const FORMATION_REQUIREMENTS = { '4-3-3': { gk: 1, def: 4, mid: 3, fwd: 3 }, '4-4-2': { gk: 1, def: 4, mid: 4, fwd: 2 }, '3-5-2': { gk: 1, def: 3, mid: 5, fwd: 2 }, '3-4-3': { gk: 1, def: 3, mid: 4, fwd: 3 }, '5-3-2': { gk: 1, def: 5, mid: 3, fwd: 2 } };

// ========== MLS TEAMS WITH DECADE AVAILABILITY ==========
const MLS_CLUBS = [
  { id: '18418', name: 'Atlanta United FC', abbr: 'ATL', conf: 'east', founded: 2017, eras: [2010, 2020] },
  { id: '20906', name: 'Austin FC', abbr: 'ATX', conf: 'west', founded: 2021, eras: [2020] },
  { id: '9720',  name: 'CF Montr\u00e9al', abbr: 'MTL', conf: 'east', founded: 2012, eras: [2010, 2020] },
  { id: '21300', name: 'Charlotte FC', abbr: 'CLT', conf: 'east', founded: 2022, eras: [2020] },
  { id: '182',   name: 'Chicago Fire FC', abbr: 'CHI', conf: 'east', founded: 1998, eras: [1990, 2000, 2010, 2020] },
  { id: '184',   name: 'Colorado Rapids', abbr: 'COL', conf: 'west', founded: 1996, eras: [1990, 2000, 2010, 2020] },
  { id: '183',   name: 'Columbus Crew', abbr: 'CLB', conf: 'east', founded: 1996, eras: [1990, 2000, 2010, 2020] },
  { id: '193',   name: 'D.C. United', abbr: 'DC', conf: 'east', founded: 1996, eras: [1990, 2000, 2010, 2020] },
  { id: '18267', name: 'FC Cincinnati', abbr: 'CIN', conf: 'east', founded: 2019, eras: [2010, 2020] },
  { id: '185',   name: 'FC Dallas', abbr: 'DAL', conf: 'west', founded: 1996, eras: [1990, 2000, 2010, 2020] },
  { id: '6077',  name: 'Houston Dynamo FC', abbr: 'HOU', conf: 'west', founded: 2006, eras: [2000, 2010, 2020] },
  { id: '20232', name: 'Inter Miami CF', abbr: 'MIA', conf: 'east', founded: 2020, eras: [2020] },
  { id: '187',   name: 'LA Galaxy', abbr: 'LA', conf: 'west', founded: 1996, eras: [1990, 2000, 2010, 2020] },
  { id: '18966', name: 'LAFC', abbr: 'LAFC', conf: 'west', founded: 2018, eras: [2010, 2020] },
  { id: '17362', name: 'Minnesota United FC', abbr: 'MIN', conf: 'west', founded: 2017, eras: [2010, 2020] },
  { id: '18986', name: 'Nashville SC', abbr: 'NSH', conf: 'east', founded: 2020, eras: [2020] },
  { id: '189',   name: 'New England Revolution', abbr: 'NE', conf: 'east', founded: 1996, eras: [1990, 2000, 2010, 2020] },
  { id: '17606', name: 'New York City FC', abbr: 'NYC', conf: 'east', founded: 2015, eras: [2010, 2020] },
  { id: '12011', name: 'Orlando City SC', abbr: 'ORL', conf: 'east', founded: 2015, eras: [2010, 2020] },
  { id: '10739', name: 'Philadelphia Union', abbr: 'PHI', conf: 'east', founded: 2010, eras: [2010, 2020] },
  { id: '9723',  name: 'Portland Timbers', abbr: 'POR', conf: 'west', founded: 2011, eras: [2010, 2020] },
  { id: '4771',  name: 'Real Salt Lake', abbr: 'RSL', conf: 'west', founded: 2005, eras: [2000, 2010, 2020] },
  { id: '190',   name: 'New York Red Bulls', abbr: 'RBNY', conf: 'east', founded: 1996, eras: [1990, 2000, 2010, 2020] },
  { id: '22529', name: 'San Diego FC', abbr: 'SD', conf: 'west', founded: 2025, eras: [2020] },
  { id: '191',   name: 'San Jose Earthquakes', abbr: 'SJ', conf: 'west', founded: 1996, eras: [1990, 2000, 2010, 2020] },
  { id: '9726',  name: 'Seattle Sounders FC', abbr: 'SEA', conf: 'west', founded: 2009, eras: [2000, 2010, 2020] },
  { id: '186',   name: 'Sporting Kansas City', abbr: 'SKC', conf: 'west', founded: 1996, eras: [1990, 2000, 2010, 2020] },
  { id: '21812', name: 'St. Louis CITY SC', abbr: 'STL', conf: 'west', founded: 2023, eras: [2020] },
  { id: '7318',  name: 'Toronto FC', abbr: 'TOR', conf: 'east', founded: 2007, eras: [2000, 2010, 2020] },
  { id: '9727',  name: 'Vancouver Whitecaps', abbr: 'VAN', conf: 'west', founded: 2011, eras: [2010, 2020] },
];

// ========== SEEDED RNG ==========
function fnv1a(str) {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
}

function mulberry32(seed) {
  return function() {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

// ========== STATE ==========
function computeTier(rating) {
  if (rating >= 76) return { key: 'elite', label: 'MLS Cup Caliber', color: 'var(--tier-elite)' };
  if (rating >= 66) return { key: 'playoff', label: 'Playoff-Bound', color: 'var(--tier-playoff)' };
  if (rating >= 56) return { key: 'mid', label: 'Mid-Table', color: 'var(--tier-mid)' };
  return { key: 'rebuild', label: 'Rebuilding', color: 'var(--tier-rebuild)' };
}

function computeSquadTier() {
  return computeTier(state.squadRating);
}

// ========== POOL GENERATION (CLUB-ERA SPINS) ==========
function poissonRand(lambda, rng) {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do {
    k++;
    p *= (rng || Math.random)();
  } while (p > L);
  return k - 1;
}

function simulateMatch(userRating, oppRating, drawRate, seed) {
  const rng = seed ? mulberry32(fnv1a(seed)) : Math.random;
  const lambdaUs = Math.max(0.2, userRating / oppRating * 1.1);
  const lambdaThem = Math.max(0.2, oppRating / userRating * 0.9);
  const rawUs = poissonRand(lambdaUs, rng);
  const rawThem = poissonRand(lambdaThem, rng);
  const cappedUs = Math.min(rawUs, 8);
  const cappedThem = Math.min(rawThem, 8);

  let outcome;
  if (cappedUs > cappedThem) outcome = 'W';
  else if (cappedUs < cappedThem) outcome = 'L';
  else outcome = 'D';

  return { us: cappedUs, them: cappedThem, outcome };
}


