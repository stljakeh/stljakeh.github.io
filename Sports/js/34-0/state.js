const state = {
  phase: 'splash',
  difficulty: null,
  formation: null,
  slots: [],
  activeSlot: -1,

  // Draft pool (club-era spins)
  draftPool: [],
  usedPool: new Set(),
  currentSpin: null,
  spinIndex: 0,
  squadRating: 0,

  // Reroll
  rerolls: 1,

  // Season
  games: [],
  currentGame: 0,
  record: { w: 0, d: 0, l: 0 },
  playerStats: {},
  matchSeed: '',

  // Watch mode
  watchActive: false,
  watchEvents: [],
  watchIndex: 0,
  watchTimer: null,

  // Playoff
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
};

// ========== REROLL ==========
function useReroll() {
  if (state.rerolls <= 0) return false;
  if (!state.currentSpin) return false;
  state.rerolls--;
  state.usedPool.delete(state.spinIndex);
  state.currentSpin = null;
  render();
  return true;
}


