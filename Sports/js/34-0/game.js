function shuffleArray(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor((rng || Math.random)() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function generateDraftPool(size) {
  const pool = [];
  const used = new Set();

  while (pool.length < size) {
    const club = MLS_CLUBS[Math.floor(Math.random() * MLS_CLUBS.length)];
    const era = club.eras[Math.floor(Math.random() * club.eras.length)];
    const key = club.id + '-' + era;
    if (used.has(key)) continue;
    used.add(key);

    const year = era + Math.floor(Math.random() * 10);
    const cappedYear = Math.min(year, MAX_SEASON);
    if (cappedYear < club.founded) continue;

    const roster = await fetchRoster(club.id, cappedYear);
    if (!roster || roster.length < 11) continue;

    const players = roster
      .filter(a => extractStat(a, 'appearances') > 3)
      .map(a => ({
        id: a.id,
        fullName: a.fullName,
        pos: (a.position && a.position.abbreviation) || 'M',
        apps: extractStat(a, 'appearances'),
        goals: extractStat(a, 'totalGoals'),
        assists: extractStat(a, 'goalAssists'),
      }));

    if (players.length < 11) continue;

    const avgRating = computeClubEraRating(players);
    const tier = computeTier(avgRating);

    pool.push({
      club,
      era,
      year: cappedYear,
      players,
      avgRating,
      tier,
    });
  }

  return pool;
}

function computeClubEraRating(players) {
  if (!players.length) return 40;
  let total = 0;
  for (const p of players) {
    let base;
    if (p.pos === 'G') base = 40 + p.apps * 0.4;
    else if (p.pos === 'D') base = 48 + p.apps * 0.25 + p.goals * 1.5;
    else if (p.pos === 'M') base = 40 + p.apps * 0.3 + (p.goals + p.assists) * 1.2;
    else base = 35 + p.apps * 0.2 + p.goals * 1.6 + p.assists * 0.6;
    total += Math.max(40, Math.min(99, base));
  }
  return Math.round(total / players.length);
}

function computePlayerRating(playerData, noiseRange) {
  const nr = noiseRange || 10;
  let base;
  if (playerData.pos === 'G') base = 40 + playerData.apps * 0.4;
  else if (playerData.pos === 'D') base = 48 + playerData.apps * 0.25 + playerData.goals * 1.5;
  else if (playerData.pos === 'M') base = 40 + playerData.apps * 0.3 + (playerData.goals + playerData.assists) * 1.2;
  else base = 35 + playerData.apps * 0.2 + playerData.goals * 1.6 + playerData.assists * 0.6;
  const noise = Math.random() * nr - nr / 2;
  return Math.round(Math.max(40, Math.min(99, base + noise)));
}

// ========== DRAFT LOGIC ==========
function createSlots(f) {
  const arr = [];
  for (let i = 0; i < f.gk; i++) arr.push({ pos: 'G', player: null, entry: null });
  for (let i = 0; i < f.def; i++) arr.push({ pos: 'D', player: null, entry: null });
  for (let i = 0; i < f.mid; i++) arr.push({ pos: 'M', player: null, entry: null });
  for (let i = 0; i < f.fwd; i++) arr.push({ pos: 'F', player: null, entry: null });
  return arr;
}

function allSlotsFilled() {
  return state.slots.every(s => s.player !== null);
}

function filledCount() {
  return state.slots.filter(s => s.player !== null).length;
}

function startSpin() {
  const remaining = state.draftPool.filter((_, i) => !state.usedPool.has(i));
  if (remaining.length === 0) return;

  let idx;
  do {
    idx = Math.floor(Math.random() * state.draftPool.length);
  } while (state.usedPool.has(idx));

  state.spinIndex = idx;
  state.currentSpin = state.draftPool[idx];
  state.phase = 'spin';
  render();
}

function acceptSpin() {
  if (!state.currentSpin) return;
  const entry = state.currentSpin;
  const pos = findNextOpenPosition();
  if (!pos) return;

  const candidates = entry.players.filter(p => p.pos === pos);
  if (candidates.length === 0) {
    autoRerollSpin();
    return;
  }

  state.usedPool.add(state.spinIndex);
  state.activeSlot = state.slots.findIndex(s => s.player === null && s.pos === pos);
  state.slots[state.activeSlot].entry = entry;
  renderPickView(document.getElementById('app'));
}

function findNextOpenPosition() {
  for (const s of state.slots) {
    if (s.player === null) return s.pos;
  }
  return null;
}

function autoRerollSpin() {
  state.currentSpin = null;
  startSpin();
}

function fillSlot(playerIdOrObj, slotIdx) {
  const slot = state.slots[slotIdx];
  if (!slot) return;
  const entry = slot.entry;
  if (!entry) return;

  const player = typeof playerIdOrObj === 'object' ? playerIdOrObj : entry.players.find(p => p.id === playerIdOrObj);
  if (!player) return;

  const rating = computePlayerRating(player);

  slot.player = {
    fullName: player.fullName,
    pos: player.pos,
    rating,
    id: player.id,
    clubName: entry.club.name,
    clubAbbr: entry.club.abbr,
    year: entry.year,
    era: entry.era,
  };

  state.activeSlot = -1;
  state.currentSpin = null;

  if (allSlotsFilled()) {
    finalizeDraft();
  } else {
    state.phase = 'draft';
    render();
  }
}

function finalizeDraft() {
  const ratings = state.slots.map(s => s.player.rating);
  state.squadRating = Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length);
  state.phase = 'season';
  initSeason();
  render();
}

function restart() {
  Object.assign(state, {
    phase: 'splash',
    difficulty: null,
    formation: null,
    slots: [],
    activeSlot: -1,
    draftPool: [],
    usedPool: new Set(),
    currentSpin: null,
    spinIndex: 0,
    squadRating: 0,
    rerolls: 1,
    games: [],
    currentGame: 0,
    record: { w: 0, d: 0, l: 0 },
    playerStats: {},
    matchSeed: '',
    watchActive: false,
    watchEvents: [],
    watchIndex: 0,
    watchTimer: null,
    teamBaseRatings: null,
    standings: null,
    userSeed: null,
    userConfSeed: null,
    playoffPhase: null,
    playoffRound: 0,
    playoffMatchupIdx: 0,
    seriesWins: { us: 0, them: 0 },
    seriesGames: [],
    currentPlayoffOpponent: null,
    playoffOppSeed: null,
    playoffRecord: { w: 0, l: 0 },
    wonPlayoffs: false,
    playoffLog: [],
    eastChamp: null,
  });
  render();
}

// ========== API ==========
function generateMatchEvents(match, userRating, oppRating, oppName, rng) {
  const events = [];
  const totalGoals = match.us + match.them;
  const minutes = [];

  if (totalGoals === 0) {
    events.push({ type: 'whistle', text: 'Full time. 0-0 draw.', min: 90 });
    return events;
  }

  const weighted = [];
  const userGoalShare = match.us / Math.max(totalGoals, 1);
  for (let i = 0; i < 90; i++) {
    const isUser = (rng() < userGoalShare);
    weighted.push({ min: i + 1, us: isUser, them: !isUser });
  }
  weighted.sort(() => rng() - 0.5);

  let usScored = 0, themScored = 0;
  const usGoalMin = Math.max(1, 90 / Math.max(match.us, 1));
  const themGoalMin = Math.max(1, 90 / Math.max(match.them, 1));

  for (let i = 0; i < 90 && (usScored < match.us || themScored < match.them); i++) {
    const w = weighted[i];
    if (!w) break;
    if (w.us && usScored < match.us) {
      usScored++;
      const min = Math.round(usScored * usGoalMin * (0.5 + rng() * 0.5));
      const scorer = getRandomScorer('F', rng);
      const assister = rng() < 0.6 ? getRandomScorer('M', rng) : null;
      events.push({
        type: 'goal',
        text: min + '\' GOAL! ' + scorer + (assister ? ' (assisted by ' + assister + ')' : '') + ' — ' + usScored + '-' + themScored,
        min,
        us: usScored,
        them: themScored,
      });
    } else if (w.them && themScored < match.them) {
      themScored++;
      const min = Math.round(themScored * themGoalMin * (0.5 + rng() * 0.5));
      events.push({
        type: 'goal',
        text: min + '\' GOAL! ' + oppName + ' scores — ' + usScored + '-' + themScored,
        min,
        us: usScored,
        them: themScored,
      });
    }
  }

  events.sort((a, b) => a.min - b.min);

  if (events.length && events[events.length - 1].min < 88) {
    const last = events[events.length - 1];
    events.push({ type: 'whistle', text: 'Full time. ' + match.us + '-' + match.them + '.', min: 90 });
  }

  return events;
}

function getRandomScorer(pos, rng) {
  const candidates = state.slots.filter(s => s.player && s.player.pos === pos);
  if (candidates.length === 0) {
    const fallback = state.slots.filter(s => s.player);
    if (fallback.length === 0) return 'Unknown';
    return fallback[Math.floor((rng || Math.random)() * fallback.length)].player.fullName;
  }
  return candidates[Math.floor((rng || Math.random)() * candidates.length)].player.fullName;
}

// ========== SEASON SIMULATION ==========
function initSeason() {
  const otherTeams = MLS_CLUBS.filter(t => t.id !== USER_TEAM_ID);

  state.teamBaseRatings = {};
  for (const t of otherTeams) {
    state.teamBaseRatings[t.id] = Math.round(40 + Math.random() * 35);
  }
  state.teamBaseRatings[USER_TEAM_ID] = state.squadRating;

  state.games = [];
  for (let i = 0; i < TOTAL_GAMES; i++) {
    const team = otherTeams[Math.floor(Math.random() * otherTeams.length)];
    const rating = state.teamBaseRatings[team.id];
    state.games.push({ team, rating, result: null, score: null, events: null });
  }

  state.currentGame = 0;
  state.record = { w: 0, d: 0, l: 0 };
  state.playerStats = {};
  for (const s of state.slots) {
    state.playerStats[s.player.id] = { goals: 0, assists: 0, cleanSheets: 0, motm: 0, pos: s.player.pos, name: s.player.fullName };
  }
}

function advanceGame() {
  const idx = state.currentGame;
  if (idx >= TOTAL_GAMES) return null;
  const game = state.games[idx];

  const seed = 'g' + idx + '-' + Date.now() + '-' + Math.random();
  const match = simulateMatch(state.squadRating, game.rating, DRAW_RATE, seed);
  game.score = { us: match.us, them: match.them };
  game.result = match.outcome;
  game.seed = seed;

  const rng = mulberry32(fnv1a(seed + '-events'));
  game.events = generateMatchEvents(match, state.squadRating, game.rating, game.team.name, rng);

  const motmId = distributeStats(match);
  game.motm = motmId;

  state.record[match.outcome === 'W' ? 'w' : match.outcome === 'D' ? 'd' : 'l']++;
  state.currentGame++;

  return { outcome: match.outcome, score: match, game };
}

function distributeStats(match) {
  const us = match.us;
  const cleanSheet = match.them === 0;
  const contrib = {};
  for (const s of state.slots) contrib[s.player.id] = { g: 0, a: 0 };

  const goalPool = [];
  for (const s of state.slots) {
    const w = { F: 65, M: 25, D: 8, G: 2 }[s.player.pos] || 0;
    for (let i = 0; i < w; i++) goalPool.push(s.player.id);
  }
  for (let i = 0; i < us; i++) {
    const id = goalPool[Math.floor(Math.random() * goalPool.length)];
    if (contrib[id]) contrib[id].g++;
  }

  const assistPool = [];
  for (const s of state.slots) {
    const w = { G: 2, D: 13, M: 50, F: 35 }[s.player.pos] || 0;
    for (let i = 0; i < w; i++) assistPool.push(s.player.id);
  }
  for (let i = 0; i < us; i++) {
    if (Math.random() < 0.6) {
      const id = assistPool[Math.floor(Math.random() * assistPool.length)];
      if (contrib[id]) contrib[id].a++;
    }
  }

  let motmId = null, motmScore = -1;
  for (const s of state.slots) {
    const pid = s.player.id;
    const c = contrib[pid] || { g: 0, a: 0 };
    const ps = state.playerStats[pid];
    if (!ps) continue;
    ps.goals += c.g;
    ps.assists += c.a;
    const cs = cleanSheet && (s.player.pos === 'G' || s.player.pos === 'D') ? 1 : 0;
    ps.cleanSheets += cs;
    const perf = c.g * 3 + c.a * 2 + cs * 2 + Math.random() * 3;
    if (perf > motmScore) { motmScore = perf; motmId = pid; }
  }
  if (motmId && state.playerStats[motmId]) state.playerStats[motmId].motm++;
  return motmId;
}

function isSeasonComplete() { return state.currentGame >= TOTAL_GAMES; }
function isPerfect() { return state.record.w === TOTAL_GAMES && state.record.d === 0 && state.record.l === 0; }

function simAll() {
  while (!isSeasonComplete()) { advanceGame(); }
  generateStandings();
  state.phase = 'result';
  render();
}

function closeModal() { document.getElementById('modal').classList.remove('active'); }

// ========== WATCH MODE ==========
function watchGame() {
  if (state.watchActive) return;
  const idx = state.currentGame;
  if (idx >= TOTAL_GAMES) return;

  const result = advanceGame();
  if (!result) return;

  state.watchActive = true;
  state.watchEvents = result.game.events || [];
  state.watchIndex = 0;

  const overlay = document.getElementById('watchOverlay');
  overlay.classList.add('active');
  renderWatchFrame();
}

function renderWatchFrame() {
  const overlay = document.getElementById('watchOverlay');
  const game = state.games[state.currentGame - 1];
  if (!game) { closeWatch(); return; }

  const score = game.score || { us: 0, them: 0 };
  const evts = state.watchEvents;
  const shown = evts.slice(0, state.watchIndex);
  const remaining = evts.length - state.watchIndex;

  const eventsHtml = shown.map(function(e) {
    return '<div class="watch-event ev-' + e.type + '">' + e.text + '</div>';
  }).join('');

  overlay.innerHTML = `
    <div class="watch-pitch">
      <div class="wp-field"></div>
      <div class="wp-midline"></div>
      <div class="wp-center"></div>
      <div class="wp-penalty-a"></div>
      <div class="wp-penalty-b"></div>
    </div>
    <div class="watch-score">
      <span class="ws-us">${score.us}</span>
      <span class="ws-sep">-</span>
      <span class="ws-them">${score.them}</span>
    </div>
    <div class="watch-progress">vs ${game.team.name} &middot; Game ${state.currentGame} of ${TOTAL_GAMES}</div>
    <div id="watchEvents" style="min-height:60px;">${eventsHtml}</div>
    <div style="margin-top:12px;display:flex;gap:12px;">
      ${remaining > 0
        ? '<button class="btn btn-primary" onclick="advanceWatch()">Next Event</button>'
        : '<button class="btn btn-gold" onclick="closeWatch()">Continue</button>'}
      <button class="btn btn-secondary" onclick="skipWatch()">Skip All</button>
    </div>
    ${remaining > 0 ? '<div style="color:var(--text-muted);font-size:0.7rem;margin-top:6px;">' + remaining + ' events remaining</div>' : ''}
  `;
}

function advanceWatch() {
  if (!state.watchActive) return;
  if (state.watchTimer) { clearTimeout(state.watchTimer); state.watchTimer = null; }
  if (state.watchIndex < state.watchEvents.length) {
    state.watchIndex++;
    renderWatchFrame();
  }
  if (state.watchIndex >= state.watchEvents.length) {
    state.watchTimer = setTimeout(function() {
      closeWatch();
    }, 2000);
  }
}

function skipWatch() {
  if (state.watchTimer) { clearTimeout(state.watchTimer); state.watchTimer = null; }
  closeWatch();
}

function closeWatch() {
  state.watchActive = false;
  if (state.watchTimer) { clearTimeout(state.watchTimer); state.watchTimer = null; }
  document.getElementById('watchOverlay').classList.remove('active');
  if (isSeasonComplete()) {
    generateStandings();
    state.phase = 'result';
    render();
  } else {
    render();
  }
}

// ========== STANDINGS GENERATION ==========
function generateStandings() {
  if (state.standings) return;
  const teams = MLS_CLUBS.map(function(t) {
    if (t.id === USER_TEAM_ID) {
      return { ...t, rating: state.squadRating, w: state.record.w, d: state.record.d, l: state.record.l, pts: state.record.w * 3 + state.record.d, userTeam: true };
    }
    const rating = state.teamBaseRatings[t.id] || 50;
    let w = 0, d = 0, l = 0;
    const others = MLS_CLUBS.filter(x => x.id !== t.id);
    for (let i = 0; i < TOTAL_GAMES; i++) {
      const opp = others[Math.floor(Math.random() * others.length)];
      const oppR = state.teamBaseRatings[opp.id] || 50;
      const result = simulateMatch(rating, oppR, DRAW_RATE, 's' + i + '-' + t.id).outcome;
      if (result === 'W') w++; else if (result === 'D') d++; else l++;
    }
    return { ...t, rating, w, d, l, pts: w * 3 + d, userTeam: false };
  });

  const east = teams.filter(t => t.conf === 'east').sort((a, b) => b.pts - a.pts || b.w - a.w);
  const west = teams.filter(t => t.conf === 'west').sort((a, b) => b.pts - a.pts || b.w - a.w);
  state.standings = { east, west };

  const userConf = teams.filter(t => t.conf === USER_CONF).sort((a, b) => b.pts - a.pts || b.w - a.w);
  for (let i = 0; i < userConf.length; i++) {
    if (userConf[i].userTeam) { state.userConfSeed = i + 1; state.userSeed = userConf[i]; break; }
  }
}

// ========== PLAYOFF SIMULATION ==========
function simPlayoffGame(userRating, oppRating, seed) {
  const rng = seed ? mulberry32(fnv1a(seed)) : Math.random;
  const lambdaUs = Math.max(0.2, userRating / oppRating * 0.9);
  const lambdaThem = Math.max(0.2, oppRating / userRating * 1.1);
  const us = Math.min(poissonRand(lambdaUs, rng), 6);
  const them = Math.min(poissonRand(lambdaThem, rng), 6);
  if (us > them) return 'W';
  if (them > us) return 'L';
  const extra = rng() < 0.5 ? 'W' : 'L';
  return extra;
}

function simPlayoffSeries(teamRating, oppRating, gamesToWin) {
  let ourWins = 0, theirWins = 0;
  while (ourWins < gamesToWin && theirWins < gamesToWin) {
    const seed = 'ps-' + ourWins + '-' + theirWins + '-' + Date.now();
    const result = simPlayoffGame(teamRating, oppRating, seed);
    if (result === 'W') ourWins++; else theirWins++;
  }
  return { ourWins, theirWins, won: ourWins > theirWins };
}

function simSinglePlayoffGame(userRating, oppRating) {
  const seed = 'ps-single-' + Date.now();
  const result = simPlayoffGame(userRating, oppRating, seed);
  return { result, won: result === 'W' };
}

function autoSimEastBracket() {
  const conf = state.standings.east;
  if (!conf || conf.length < 9) return null;

  const wc = simSinglePlayoffGame(conf[7].rating, conf[8].rating);
  const wcWinner = wc.won ? conf[7] : conf[8];

  const r1 = [
    { a: conf[0], b: wcWinner },
    { a: conf[1], b: conf[6] },
    { a: conf[2], b: conf[5] },
    { a: conf[3], b: conf[4] },
  ];
  const r1Winners = r1.map(m => {
    const res = simPlayoffSeries(m.a.rating, m.b.rating, 2);
    return res.won ? m.a : m.b;
  });

  const semi1 = simSinglePlayoffGame(r1Winners[0].rating, r1Winners[3].rating);
  const semi2 = simSinglePlayoffGame(r1Winners[1].rating, r1Winners[2].rating);
  const semiWinners = [semi1.won ? r1Winners[0] : r1Winners[3], semi2.won ? r1Winners[1] : r1Winners[2]];

  const confFinal = simSinglePlayoffGame(semiWinners[0].rating, semiWinners[1].rating);
  return confFinal.won ? semiWinners[0] : semiWinners[1];
}

function enterPlayoffs() {
  generateStandings();
  const conf = state.standings[USER_CONF];
  const seed = state.userConfSeed;
  if (!seed || seed > PLAYOFF_TEAMS) return;
  state.playoffRecord = { w: 0, l: 0 };
  state.playoffLog = [];

  if (seed >= 8) {
    const opp = seed === 8 ? conf[8] : conf[7];
    state.currentPlayoffOpponent = { team: opp, seed: seed === 8 ? 9 : 8 };
    state.playoffRound = -1;
  } else {
    const wc = simSinglePlayoffGame(conf[7].rating, conf[8].rating);
    const wcWinner = wc.won ? conf[7] : conf[8];
    const wcWinnerSeed = wc.won ? 8 : 9;
    const pairings = { 1: null, 2: 7, 3: 6, 4: 5, 5: 4, 6: 3, 7: 2 };
    let oppTeam, oppSeed;
    if (seed === 1) { oppTeam = wcWinner; oppSeed = wcWinnerSeed; }
    else { oppSeed = pairings[seed]; oppTeam = conf[oppSeed - 1]; }
    state.currentPlayoffOpponent = { team: oppTeam, seed: oppSeed };
    state.playoffRound = 0;
  }
  state.playoffPhase = 'pregame';
  state.seriesWins = { us: 0, them: 0 };
  state.seriesGames = [];
  state.phase = 'playoff';
  render();
}

function advancePlayoff() {
  const opp = state.currentPlayoffOpponent;
  if (!opp) return null;

  const isBo3 = state.playoffRound === 0;
  const userRating = state.squadRating;
  const oppRating = opp.team.rating;

  if (isBo3) {
    const seed = 'bo3-' + state.seriesGames.length + '-' + Date.now();
    const result = simPlayoffGame(userRating, oppRating, seed);
    const score = generatePlayoffScore(result, userRating, oppRating);
    state.seriesGames.push({ result, score });
    if (result === 'W') state.seriesWins.us++;
    else state.seriesWins.them++;

    if (state.seriesWins.us >= 2 || state.seriesWins.them >= 2) {
      const won = state.seriesWins.us >= 2;
      if (won) state.playoffRecord.w++; else state.playoffRecord.l++;
      state.playoffLog.push({ round: 'Round 1', opponent: opp.team.name, won, seriesWins: { ...state.seriesWins } });
      return { result, score, seriesOver: true, won, isBo3: true, seriesWins: { ...state.seriesWins }, gameNum: state.seriesGames.length };
    }
    return { result, score, seriesOver: false, won: result === 'W', isBo3: true, seriesWins: { ...state.seriesWins }, gameNum: state.seriesGames.length };
  } else {
    const seed = 'ko-' + state.playoffRound + '-' + Date.now();
    const result = simPlayoffGame(userRating, oppRating, seed);
    const score = generatePlayoffScore(result, userRating, oppRating);
    const won = result === 'W';
    if (won) state.playoffRecord.w++; else state.playoffRecord.l++;
    return { result, score, seriesOver: true, won, isBo3: false, seriesWins: { us: won ? 1 : 0, them: won ? 0 : 1 }, gameNum: 1 };
  }
}

function generatePlayoffScore(result, userRating, oppRating) {
  const diff = userRating - oppRating;
  const base = Math.max(1, Math.min(5, Math.round(1.5 + (diff / 25) + (Math.random() - 0.3))));
  if (result === 'W') {
    const ourGoals = Math.max(1, base + 1);
    const theirGoals = Math.max(0, Math.min(ourGoals - 1, Math.round(base * 0.3 + Math.random() * 0.5)));
    return { us: ourGoals, them: theirGoals };
  } else {
    const theirGoals = Math.max(1, base + 2);
    const ourGoals = Math.max(0, Math.min(theirGoals - 1, Math.round(base * 0.2 + Math.random() * 0.5)));
    return { us: ourGoals, them: theirGoals };
  }
}

function handlePlayoffAdvancement(won, silent) {
  const seed = state.userConfSeed;
  const conf = state.standings[USER_CONF];

  if (!won) {
    state.phase = 'champion';
    state.wonPlayoffs = false;
    state.playoffLog.push({ round: 'Eliminated', won: false });
    if (!silent) render();
    return false;
  }

  if (state.playoffRound === -1) {
    state.currentPlayoffOpponent = { team: conf[0], seed: 1 };
    state.seriesWins = { us: 0, them: 0 };
    state.seriesGames = [];
    state.playoffRound = 0;
    state.playoffLog.push({ round: 'Wild Card', opponent: conf[0].name, won: true });
    if (!silent) { state.playoffPhase = 'pregame'; render(); }
    return true;
  }

  if (state.playoffRound === 0) {
    const topHalfSeeds = [[1, 8], [4, 5]];
    const bottomHalfSeeds = [[2, 7], [3, 6]];
    let userHalf;
    if (seed <= 1 || seed === 8 || seed === 9 || seed === 4 || seed === 5) {
      userHalf = topHalfSeeds;
    } else {
      userHalf = bottomHalfSeeds;
    }
    const otherMatchup = userHalf.find(pair => !pair.includes(seed) && !(seed >= 8 && pair.includes(8)));
    let oppTeam;
    if (otherMatchup) {
      const a = conf[otherMatchup[0] - 1];
      const b = otherMatchup[1] <= conf.length ? conf[otherMatchup[1] - 1] : null;
      if (a && b) { const res = simPlayoffSeries(a.rating, b.rating, 2); oppTeam = res.won ? a : b; }
      else if (a) { oppTeam = a; }
    }
    state.currentPlayoffOpponent = { team: oppTeam, seed: null };
    state.seriesWins = { us: 0, them: 0 };
    state.seriesGames = [];
    state.playoffRound = 1;
    state.playoffLog.push({ round: 'Round 1', won: true });
    if (!silent) { state.playoffPhase = 'pregame'; render(); }
    return true;
  }

  if (state.playoffRound === 1) {
    state.playoffLog.push({ round: 'Conference Semifinal', won: true });
    const topHalfSeeds = [[1, 8], [4, 5]];
    const bottomHalfSeeds = [[2, 7], [3, 6]];
    let userHalf, otherHalf;
    if (seed <= 1 || seed === 8 || seed === 9 || seed === 4 || seed === 5) {
      userHalf = topHalfSeeds; otherHalf = bottomHalfSeeds;
    } else {
      userHalf = bottomHalfSeeds; otherHalf = topHalfSeeds;
    }
    const otherRes1 = otherHalf[0] ? simPlayoffSeries(conf[(otherHalf[0][0] || 2) - 1].rating, conf[Math.min(otherHalf[0][1] || 7, conf.length) - 1].rating, 2) : null;
    const otherRes2 = otherHalf[1] ? simPlayoffSeries(conf[(otherHalf[1][0] || 3) - 1].rating, conf[Math.min(otherHalf[1][1] || 6, conf.length) - 1].rating, 2) : null;
    const otherSemiA = otherRes1 ? (otherRes1.won ? conf[(otherHalf[0][0] || 2) - 1] : conf[Math.min(otherHalf[0][1] || 7, conf.length) - 1]) : null;
    const otherSemiB = otherRes2 ? (otherRes2.won ? conf[(otherHalf[1][0] || 3) - 1] : conf[Math.min(otherHalf[1][1] || 6, conf.length) - 1]) : null;
    const confFinal = otherSemiA && otherSemiB ? simSinglePlayoffGame(otherSemiA.rating, otherSemiB.rating) : null;
    const oppTeam = confFinal ? (confFinal.won ? otherSemiA : otherSemiB) : (otherSemiA || otherSemiB);
    state.currentPlayoffOpponent = { team: oppTeam, seed: null };
    state.playoffRound = 2;
    state.seriesWins = { us: 0, them: 0 };
    state.seriesGames = [];
    if (!silent) { state.playoffPhase = 'pregame'; render(); }
    return true;
  }

  if (state.playoffRound === 2) {
    state.playoffLog.push({ round: 'Conference Final', won: true });
    const eastChamp = autoSimEastBracket();
    state.currentPlayoffOpponent = { team: eastChamp, seed: 'E' };
    state.playoffRound = 3;
    state.seriesWins = { us: 0, them: 0 };
    state.seriesGames = [];
    if (!silent) { state.playoffPhase = 'pregame'; render(); }
    return true;
  }

  if (state.playoffRound === 3) {
    state.playoffLog.push({ round: 'MLS Cup', won: true });
    state.wonPlayoffs = true;
    state.phase = 'champion';
    if (!silent) render();
    return false;
  }

  state.phase = 'champion';
  if (!silent) render();
  return false;
}

function playPlayoffGame() {
  const result = advancePlayoff();
  if (!result) return;
  showPlayoffGameResult(result);
  setTimeout(function() {
    closeModal();
    if (result.seriesOver) {
      handlePlayoffAdvancement(result.won);
    } else {
      state.playoffPhase = 'pregame';
      render();
    }
  }, 2200);
}

function showPlayoffGameResult(result) {
  const modal = document.getElementById('modal');
  const color = result.won ? 'win' : 'loss';
  const label = result.won ? 'WIN' : 'LOSS';
  const opp = state.currentPlayoffOpponent;
  let seriesDetail = '';
  if (result.isBo3) {
    seriesDetail = '<div style="color:var(--text-secondary);font-size:0.75rem;margin-top:4px;">Series: ' + result.seriesWins.us + ' \u2013 ' + result.seriesWins.them + '</div>';
  }
  modal.innerHTML = `
    <div class="modal-box">
      <div class="m-result ${color}">${label}</div>
      <div class="m-score">${result.score.us} - ${result.score.them}</div>
      <div class="m-sub">vs ${opp.team.name} #${opp.seed}</div>
      ${seriesDetail}
      ${result.isBo3 && !result.seriesOver ? '<div style="color:var(--gold);font-size:0.8rem;margin-top:8px;">Next game in series...</div>' : ''}
      ${result.seriesOver ? '<div style="color:#4caf50;font-size:0.85rem;font-weight:700;margin-top:8px;">' + (result.won ? 'Series won!' : 'Eliminated') + '</div>' : ''}
    </div>
  `;
  modal.classList.add('active');
}

function simAllPlayoffs() {
  while (true) {
    const result = advancePlayoff();
    if (!result) break;
    if (!result.seriesOver) continue;
    const keepGoing = handlePlayoffAdvancement(result.won, true);
    if (!keepGoing) break;
  }
  render();
}

function showStandings() {
  generateStandings();
  state.phase = 'standings';
  render();
}

function showResult() { generateStandings(); state.phase = 'result'; render(); }


