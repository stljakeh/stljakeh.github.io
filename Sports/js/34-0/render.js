function render() {
  const app = document.getElementById('app');
  switch (state.phase) {
    case 'splash': renderSplash(app); break;
    case 'formation': renderFormation(app); break;
    case 'draft': renderDraft(app); break;
    case 'spin': renderSpin(app); break;
    case 'season': renderSeason(app); break;
    case 'result': renderResult(app); break;
    case 'standings': renderStandings(app); break;
    case 'playoff': renderPlayoff(app); break;
    case 'champion': renderChampion(app); break;
  }
}

function renderSplash(app) {
  app.innerHTML = `
    <div class="splash">
      <h1>34-0</h1>
      <p class="tagline">Draft &middot; Simulate &middot; Conquer</p>
      <p class="goal">Spin club-era reels to draft a 34-game MLS squad, then simulate using our Poisson match engine. Can you go perfect?</p>
      <div style="max-width:500px;margin:0 auto;">
        <div class="formation-grid">
          <div class="formation-card" onclick="selectDifficulty('easy')">
            <div class="f-name">Easy</div>
            <div class="f-detail">Generous pool, higher ratings, weaker opponents</div>
          </div>
          <div class="formation-card" onclick="selectDifficulty('normal')">
            <div class="f-name">Normal</div>
            <div class="f-detail">Balanced challenge</div>
          </div>
          <div class="formation-card" onclick="selectDifficulty('hard')">
            <div class="f-name">Hard</div>
            <div class="f-detail">Limited pool, lower ratings, stronger opponents</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function selectDifficulty(key) {
  state.difficulty = key;
  state.phase = 'formation';
  render();
}

function renderFormation(app) {
  const cards = Object.entries(FORMATIONS).map(function(kv) {
    const key = kv[0], f = kv[1];
    return '<div class="formation-card" onclick="selectFormation(\'' + key + '\')"><div class="f-name">' + f.label + '</div><div class="f-detail">' + f.desc + '</div></div>';
  }).join('');
  app.innerHTML = `
    <div class="page-title"><h1>34-0</h1></div>
    <p class="subtitle">Choose your formation</p>
    <div class="formation-grid">${cards}</div>
  `;
}

async function selectFormation(key) {
  state.formation = FORMATIONS[key];
  state.slots = createSlots(state.formation);
  const app = document.getElementById('app');
  app.innerHTML = '<div class="loading"><div class="lds-ring"><div></div></div>Generating club-era draft pool...</div>';

  const poolSize = { easy: 30, normal: 20, hard: 14 }[state.difficulty] || 20;
  state.draftPool = await generateDraftPool(poolSize);
  if (state.draftPool.length < state.slots.length) {
    app.innerHTML = '<div style="text-align:center;padding:60px;color:var(--mls-red);">Couldn\'t build a valid draft pool. <button class="btn btn-primary" onclick="selectFormation(\'' + key + '\')">Retry</button></div>';
    return;
  }
  state.usedPool = new Set();
  state.currentSpin = null;
  state.rerolls = 1;
  state.phase = 'draft';
  render();
}

// ========== DRAFT RENDER ==========
function renderDraft(app) {
  const filled = filledCount();
  const total = state.slots.length;
  const remaining = state.draftPool.length - state.usedPool.size;

  if (!state.currentSpin && filled < total) {
    startSpin();
    return;
  }

  app.innerHTML = `
    <div class="page-title"><h1>34-0</h1></div>
    <p class="subtitle">Draft — tap a slot or spin the reels</p>

    <div class="pitch-header">
      <div class="ph-info">Filled: <strong>${filled}/${total}</strong></div>
      <div class="ph-info">Pool: <strong>${remaining}</strong> club-eras remaining</div>
      <div class="ph-info">Rerolls: <strong style="color:var(--gold);">${state.rerolls}</strong></div>
    </div>

    <div class="pitch">
      ${buildFormationRows()}
    </div>

    <div style="text-align:center;margin-top:12px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
      <button class="btn btn-primary" onclick="startSpin()">Spin Reel</button>
      <button class="btn btn-reroll" onclick="useReroll()" ${state.rerolls <= 0 ? 'disabled' : ''}>Reroll (${state.rerolls})</button>
    </div>

    ${allSlotsFilled()
      ? '<div style="text-align:center;margin-top:12px;"><button class="btn btn-gold" onclick="finalizeDraft()">Start Season</button></div>'
      : remaining === 0
        ? '<div style="text-align:center;margin-top:12px;color:var(--mls-red);font-size:0.85rem;">Pool exhausted — <button class="btn btn-secondary" onclick="selectFormation(state.formation.label)">Re-roll Pool</button></div>'
        : ''}
  `;
}

function buildFormationRows() {
  const slotHtml = function(idx) {
    const s = state.slots[idx];
    const color = POS_COLORS[s.pos];
    const label = POS_LABELS[s.pos];
    const filled = s.player !== null;
    return '<div class="pitch-slot ' + (filled ? 'filled' : 'empty') + '" style="border-color:' + color + '"><div class="ps-pos" style="color:' + color + '">' + label + '</div>' + (filled ? '<div class="ps-name">' + s.player.fullName + '</div><div class="ps-rating">' + s.player.rating + '</div>' : '<div class="ps-empty">empty</div>') + '</div>';
  };

  const rows = [];
  const gkSlots = state.slots.filter(s => s.pos === 'G');
  const dSlots = state.slots.filter(s => s.pos === 'D');
  const mSlots = state.slots.filter(s => s.pos === 'M');
  const fSlots = state.slots.filter(s => s.pos === 'F');

  let idx = 0;
  if (gkSlots.length > 0) {
    let html = '<div class="pitch-row gk-row">';
    for (let i = 0; i < gkSlots.length; i++) { html += slotHtml(idx); idx++; }
    html += '</div>';
    rows.push(html);
  }
  if (dSlots.length > 0) {
    let html = '<div class="pitch-row">';
    for (let i = 0; i < dSlots.length; i++) { html += slotHtml(idx); idx++; }
    html += '</div>';
    rows.push(html);
  }
  if (mSlots.length > 0) {
    let html = '<div class="pitch-row">';
    for (let i = 0; i < mSlots.length; i++) { html += slotHtml(idx); idx++; }
    html += '</div>';
    rows.push(html);
  }
  if (fSlots.length > 0) {
    let html = '<div class="pitch-row">';
    for (let i = 0; i < fSlots.length; i++) { html += slotHtml(idx); idx++; }
    html += '</div>';
    rows.push(html);
  }
  return rows.join('');
}

// ========== SPIN RENDER ==========
function renderSpin(app) {
  const spin = state.currentSpin;
  if (!spin) { state.phase = 'draft'; render(); return; }

  const tier = spin.tier;
  const tierClass = tier.key;
  const nextPos = findNextOpenPosition();
  const posLabel = nextPos ? POS_LABELS[nextPos] : '?';

  app.innerHTML = `
    <div class="page-title"><h1>34-0</h1></div>
    <p class="subtitle">Club-Era Spin — need a <strong>${posLabel}</strong></p>

    <div class="reel-container">
      <div class="reel-label">Club</div>
      <div class="reel-slot"><div class="reel-item" style="animation-delay:0s;">${spin.club.name}</div></div>
      <div class="reel-label">Era</div>
      <div class="reel-slot"><div class="reel-item" style="animation-delay:0.15s;">${spin.era}s — ${spin.year}</div></div>
      <div class="reel-label">Squad Rating · Tier</div>
      <div class="reel-slot"><div class="reel-item" style="animation-delay:0.3s;"><span class="sh-tier ${tierClass}">${tier.label}</span> (${spin.avgRating})</div></div>
    </div>

    <div class="spin-header">
      <div class="sh-left">
        <div class="sh-badge">${spin.club.abbr}</div>
        <div>
          <div class="sh-name">${spin.club.name}</div>
          <div class="sh-year">${spin.era}s — ${spin.year} Season</div>
        </div>
      </div>
      <span class="sh-tier ${tierClass}">${tier.label}</span>
    </div>

    <div style="text-align:center;margin-top:16px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
      <button class="btn btn-primary" onclick="acceptSpin()">Draft from This Club</button>
      <button class="btn btn-secondary" onclick="rejectSpin()">Skip</button>
      <button class="btn btn-reroll" onclick="useReroll()" ${state.rerolls <= 0 ? 'disabled' : ''}>Reroll (${state.rerolls})</button>
    </div>
  `;
}

function rejectSpin() {
  state.currentSpin = null;
  state.phase = 'draft';
  render();
}

// ========== PICK VIEW ==========
function renderPickView(app) {
  const slot = state.slots[state.activeSlot];
  if (!slot || !slot.entry) { state.activeSlot = -1; state.phase = 'draft'; render(); return; }
  const entry = slot.entry;

  const candidates = entry.players.filter(p => p.pos === slot.pos)
    .sort(function(a, b) { return (b.apps - a.apps) || (b.goals - a.goals); })
    .slice(0, 5);

  const rePick = slot.player !== null;

  app.innerHTML = `
    <div class="page-title"><h1>34-0</h1></div>
    <p class="subtitle">${rePick ? 'Re-pick' : 'Pick'} — ${POS_LABELS[slot.pos]}</p>

    <div class="pick-header">
      <div class="pick-team-info">
        <div class="pti-badge">${entry.club.abbr}</div>
        <div>
          <div class="pti-name">${entry.club.name}</div>
          <div class="pti-year">${entry.year} Season</div>
        </div>
      </div>
      <span class="sh-tier ${entry.tier.key}">${entry.tier.label}</span>
    </div>

    <div class="player-grid">
      ${candidates.length === 0
        ? '<div style="text-align:center;padding:20px;color:var(--text-muted);">No players available for this position.</div>'
        : candidates.map(function(p) {
            const rating = computePlayerRating(p);
            return '<div class="player-card" onclick="fillSlot(\'' + p.id + '\', ' + state.activeSlot + ')"><div><span class="pc-name">' + p.fullName + '</span><span class="pc-pos">' + p.pos + '</span></div><div class="pc-rating">' + rating + '</div></div>';
          }).join('')}
    </div>

    <div style="text-align:center;margin-top:16px;">
      <button class="btn btn-secondary" onclick="cancelPick()">Back to Draft</button>
    </div>
  `;
}

function cancelPick() {
  state.activeSlot = -1;
  state.phase = 'draft';
  render();
}

// ========== SEASON RENDER ==========
function renderSeason(app) {
  let gamePreview = '';
  let playBtn = '';

  if (!isSeasonComplete()) {
    const game = state.games[state.currentGame];
    const winProb = state.squadRating / (state.squadRating + game.rating);
    gamePreview = `
      <div class="game-preview">
        <div class="gp-num">Game ${state.currentGame + 1} of ${TOTAL_GAMES}</div>
        <div class="gp-matchup">${state.squadRating} vs ${game.team.abbr} (${game.rating})</div>
        <div class="gp-detail">Your squad: ${state.squadRating} avg · Opponent: ${game.rating}</div>
        <div class="gp-win-prob">Win probability: <strong>${(winProb * 100).toFixed(0)}%</strong></div>
      </div>
    `;
    playBtn = `<div style="text-align:center;margin-top:8px;display:flex;gap:10px;justify-content:center;">
      <button class="btn btn-primary" onclick="playGame()">Play Next Game</button>
      <button class="btn btn-secondary" onclick="watchGame()">Watch</button>
      <button class="btn btn-secondary" onclick="simAll()">Sim All</button>
    </div>`;
  } else {
    gamePreview = '<div class="game-preview"><div class="gp-num">Season Complete!</div></div>';
    playBtn = '<div style="text-align:center;margin-top:8px;"><button class="btn btn-gold" onclick="showResult()">View Results</button></div>';
  }

  const gameCells = state.games.map(function(g, i) {
    let cls = 'game-cell';
    if (g.result) {
      const rcls = g.result === 'W' ? 'win' : g.result === 'D' ? 'draw' : 'loss';
      cls += ' ' + rcls;
      return '<div class="' + cls + '"><div class="gc-num">Game ' + (i + 1) + '</div><div class="gc-opp">' + g.team.abbr + '</div><div class="gc-result ' + rcls + '">' + g.result + ' ' + g.score.us + '-' + g.score.them + '</div></div>';
    } else if (i === state.currentGame) {
      cls += ' current';
      return '<div class="' + cls + '"><div class="gc-num">Game ' + (i + 1) + '</div><div class="gc-opp">' + g.team.abbr + '</div><div class="gc-result" style="color:var(--text-secondary);">?</div></div>';
    } else {
      cls += ' upcoming';
      return '<div class="' + cls + '"><div class="gc-num">Game ' + (i + 1) + '</div><div class="gc-opp">?</div></div>';
    }
  }).join('');

  const teamHtml = state.slots.map(function(s) {
    return '<span class="rt-player">' + POS_LABELS[s.pos] + ' ' + s.player.fullName + ' (' + s.player.rating + ')</span>';
  }).join('');

  const ps = state.playerStats;
  const topScorer = Object.values(ps).sort(function(a, b) { return b.goals - a.goals; })[0];
  const topAssist = Object.values(ps).sort(function(a, b) { return b.assists - a.assists; })[0];
  const topCS = Object.values(ps).sort(function(a, b) { return b.cleanSheets - a.cleanSheets; })[0];
  const topMotm = Object.values(ps).sort(function(a, b) { return b.motm - a.motm; })[0];

  const statsBar = `
    <div class="stats-bar">
      <span>Goals: <strong>${topScorer ? topScorer.name + ' (' + topScorer.goals + ')' : '0'}</strong></span>
      <span>Assists: <strong>${topAssist ? topAssist.name + ' (' + topAssist.assists + ')' : '0'}</strong></span>
      <span>CS: <strong>${topCS ? topCS.name + ' (' + topCS.cleanSheets + ')' : '0'}</strong></span>
      <span>MOTM: <strong>${topMotm ? topMotm.name + ' (' + topMotm.motm + ')' : '0'}</strong></span>
    </div>
  `;

  const tier = computeSquadTier();

  app.innerHTML = `
    <div class="page-title"><h1>34-0</h1></div>
    <p class="subtitle">${tier.label} · ${state.formation.label} · ${state.squadRating} avg</p>

    <div class="season-header">
      <div class="record-display">
        <div class="r-item r-win"><div class="r-num">${state.record.w}</div><div class="r-label">Wins</div></div>
        <div class="r-item r-draw"><div class="r-num">${state.record.d}</div><div class="r-label">Draws</div></div>
        <div class="r-item r-loss"><div class="r-num">${state.record.l}</div><div class="r-label">Losses</div></div>
      </div>
      <div style="display:flex;gap:16px;font-size:0.8rem;color:var(--text-secondary);">
        <span>Rating: <strong style="color:var(--text-primary);">${state.squadRating}</strong></span>
        <span>Games: <strong style="color:var(--text-primary);">${state.currentGame}/${TOTAL_GAMES}</strong></span>
      </div>
    </div>

    ${statsBar}
    ${gamePreview}
    ${playBtn}

    <div class="result-team" style="margin-top:8px;">
      ${teamHtml}
    </div>

    <div class="game-grid">${gameCells}</div>
  `;
}

function playGame() {
  const result = advanceGame();
  if (!result) return;
  showGameResult(result);
  setTimeout(function() {
    closeModal();
    if (isSeasonComplete()) { generateStandings(); state.phase = 'result'; render(); }
    else { render(); }
  }, 2000);
}

function showGameResult(result) {
  const modal = document.getElementById('modal');
  const labels = { W: 'WIN', D: 'DRAW', L: 'LOSS' };
  const colors = { W: 'win', D: 'draw', L: 'loss' };
  const game = state.games[state.currentGame - 1];
  const motmName = game.motm ? (state.playerStats[game.motm] ? state.playerStats[game.motm].name : '') : '';
  modal.innerHTML = `
    <div class="modal-box">
      <div class="m-result ${colors[result.outcome]}">${labels[result.outcome]}</div>
      <div class="m-score">${result.score.us} - ${result.score.them}</div>
      <div class="m-sub">vs ${game.team.name} · Record: ${state.record.w}W-${state.record.d}D-${state.record.l}L</div>
      ${motmName ? '<div style="color:var(--gold);font-size:0.8rem;margin-top:8px;">MOTM: ' + motmName + '</div>' : ''}
      <div style="color:var(--text-muted);font-size:0.7rem;margin-top:4px;">Game ${state.currentGame} of ${TOTAL_GAMES}</div>
    </div>
  `;
  modal.classList.add('active');
}

// ========== RESULT RENDER ==========
function renderResult(app) {
  const perfect = isPerfect();
  const recordStr = state.record.w + 'W-' + state.record.d + 'D-' + state.record.l + 'L';
  const teamHtml = state.slots.map(function(s) {
    return '<span class="rt-player">' + POS_LABELS[s.pos] + ' ' + s.player.fullName + ' (' + s.player.rating + ') \u00b7 ' + s.player.clubAbbr + ' ' + s.player.year + '</span>';
  }).join('');

  const seed = state.userConfSeed;
  const qualified = seed && seed <= PLAYOFF_TEAMS;
  const playoffBtn = qualified
    ? '<button class="btn btn-primary" onclick="showStandings()">View Standings</button>'
    : '<div style="color:var(--mls-red);font-size:0.85rem;margin-bottom:8px;">Missed playoffs — finished #' + seed + ' in conference</div>';

  app.innerHTML = `
    <div class="result-screen">
      <div class="big-record ${perfect ? 'perfect' : 'normal'}">${recordStr}</div>
      <div class="result-title">${perfect ? 'Perfect Season!' : 'Season Complete'}</div>
      <div class="result-detail">
        ${perfect ? 'You did it. A flawless season. Every game. Every opponent. Undefeated.' : 'Your ' + state.formation.label + ' squad finished ' + recordStr + '.'}
        ${qualified ? '<br><br><span style="color:var(--gold);">Qualified for playoffs as #' + seed + ' seed in the West!</span>' : ''}
        <br><br>
        <span style="color:var(--text-muted);">${state.formation.label} · Squad rating: ${state.squadRating}</span>
      </div>

      <div class="result-team">${teamHtml}</div>
      <div class="result-actions">
        ${playoffBtn}
        <button class="btn btn-secondary" onclick="restart()">Try Again</button>
        <button class="btn btn-secondary" onclick="downloadShareImage()">Share Result</button>
      </div>
    </div>
  `;
}

// ========== STANDINGS RENDER ==========
function renderStandings(app) {
  generateStandings();
  const { east, west } = state.standings;
  const seed = state.userConfSeed;
  const qualified = seed && seed <= PLAYOFF_TEAMS;

  function tableHtml(conf, label) {
    const rows = conf.map(function(t, i) {
      const s = i + 1;
      const isUser = t.userTeam;
      const isCutoff = s === PLAYOFF_TEAMS;
      return '<tr class="' + (isUser ? 'user-row' : '') + '"><td class="s-seed">' + s + '</td><td class="s-team">' + t.abbr + '</td><td>' + t.w + '\u2013' + t.d + '\u2013' + t.l + '</td><td class="s-pts">' + t.pts + '</td><td class="s-rating">' + t.rating + '</td></tr>' + (isCutoff ? '<tr class="playoff-line"><td colspan="5"></td></tr>' : '');
    }).join('');
    return '<div class="standings-conf"><h2>' + label + '</h2><table class="standings-table"><tr><th>#</th><th class="s-team">Team</th><th>W-D-L</th><th>Pts</th><th>Rtg</th></tr>' + rows + '</table></div>';
  }

  const userInfo = qualified
    ? '<div style="text-align:center;margin-bottom:16px;color:var(--gold);font-size:0.9rem;">You finished #' + seed + ' in the West — qualified for playoffs!</div>'
    : '<div style="text-align:center;margin-bottom:16px;color:var(--mls-red);font-size:0.9rem;">You finished #' + seed + ' in the West — missed the playoffs.</div>';

  app.innerHTML = `
    <div class="page-title"><h1>34-0</h1></div>
    <p class="subtitle">Final Standings</p>
    ${userInfo}
    <div class="standings-wrap">
      ${tableHtml(west, 'Western Conference')}
      ${tableHtml(east, 'Eastern Conference')}
    </div>
    <div style="text-align:center;margin-top:16px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
      ${qualified ? '<button class="btn btn-primary" onclick="enterPlayoffs()">Enter Playoffs</button>' : ''}
      <button class="btn btn-secondary" onclick="restart()">Try Again</button>
    </div>
  `;
}

// ========== PLAYOFF RENDER ==========
function renderPlayoff(app) {
  const opp = state.currentPlayoffOpponent;
  if (!opp || !opp.team) { state.phase = 'result'; render(); return; }

  const seed = state.userConfSeed;
  const roundLabels = { '-1': 'Wild Card', '0': 'Round 1', '1': 'Conference Semifinal', '2': 'Conference Final', '3': 'MLS Cup' };
  const roundLabel = roundLabels[String(state.playoffRound)] || 'Playoff';
  const isBo3 = state.playoffRound === 0;
  const seriesGames = state.seriesGames.length;
  const seriesTotal = isBo3 ? ' (Game ' + (seriesGames + 1) + ' of up to 3)' : '';

  const oppRating = opp.team.rating || 50;
  const winProb = state.squadRating / (state.squadRating + oppRating);
  const seedDisplay = opp.seed !== null && opp.seed !== undefined ? '#' + opp.seed : '';

  let seriesScoreHtml = '';
  if (isBo3) {
    const svg = '<span class="series-badge ' + (state.seriesWins.us > 0 ? 'active' : '') + '">' + state.seriesWins.us + '</span>';
    const ovg = '<span class="series-badge ' + (state.seriesWins.them > 0 ? (state.seriesWins.them >= 2 ? 'eliminated' : 'active') : '') + '">' + state.seriesWins.them + '</span>';
    seriesScoreHtml = '<div style="text-align:center;font-size:1rem;margin-bottom:12px;">Series: ' + svg + ' \u2013 ' + ovg + '</div>';
  }

  app.innerHTML = `
    <div class="page-title"><h1>34-0</h1></div>
    <p class="subtitle">${roundLabel}</p>

    ${seriesScoreHtml}

    <div class="game-preview">
      <div class="gp-num">${roundLabel}${seriesTotal}</div>
      <div class="gp-matchup">#${seed} ${state.squadRating} vs ${seedDisplay} ${opp.team.abbr} (${oppRating})</div>
      <div class="gp-detail">${opp.team.name} · Your rating: ${state.squadRating} · Opponent rating: ${oppRating}</div>
      <div class="gp-win-prob">Win probability: <strong>${(winProb * 100).toFixed(0)}%</strong></div>
    </div>

    <div style="text-align:center;margin-top:8px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
      <button class="btn btn-primary" onclick="playPlayoffGame()">Play Game</button>
      <button class="btn btn-secondary" onclick="simAllPlayoffs()">Sim All</button>
    </div>

    <div style="margin-top:16px;">
      <div class="stats-bar">
        <span>Playoff Record: <strong>${state.playoffRecord.w}W \u2013 ${state.playoffRecord.l}L</strong></span>
        <span>Round: <strong>${roundLabel}</strong></span>
      </div>
    </div>

    <div class="result-team" style="margin-top:12px;">
      ${state.slots.map(function(s) { return '<span class="rt-player">' + POS_LABELS[s.pos] + ' ' + s.player.fullName + ' (' + s.player.rating + ')</span>'; }).join('')}
    </div>
  `;
}

// ========== CHAMPION RENDER ==========
function renderChampion(app) {
  const won = state.wonPlayoffs;
  const recordStr = state.record.w + 'W-' + state.record.d + 'D-' + state.record.l + 'L';
  const playoffStr = state.playoffRecord.w + 'W \u2013 ' + state.playoffRecord.l + 'L';
  const teamHtml = state.slots.map(function(s) {
    return '<span class="rt-player">' + POS_LABELS[s.pos] + ' ' + s.player.fullName + ' (' + s.player.rating + ') \u00b7 ' + s.player.clubAbbr + ' ' + s.player.year + '</span>';
  }).join('');

  let title, detail, bigClass;
  if (won) {
    title = 'MLS Cup Champions';
    detail = 'You did it. From the draft to the final — champions.';
    bigClass = 'champion';
  } else {
    const lastRound = state.playoffLog.filter(function(r) { return r.round !== 'Eliminated'; }).pop();
    const round = lastRound ? lastRound.round : 'Playoffs';
    title = 'Eliminated \u2014 ' + round;
    detail = 'Your run ended in the ' + round + '. Playoff record: ' + playoffStr;
    bigClass = 'normal';
  }

  app.innerHTML = `
    <div class="result-screen">
      <div class="big-record ${bigClass}">${won ? 'Champions' : recordStr}</div>
      <div class="result-title">${title}</div>
      <div class="result-detail">
        ${detail}
        <br><br>
        <span style="color:var(--text-muted);">Season: ${recordStr} · Playoffs: ${playoffStr} · ${state.formation.label}</span>
      </div>

      <div class="result-team">${teamHtml}</div>
      <div class="result-actions">
        <button class="btn btn-primary" onclick="restart()">Try Again</button>
        <button class="btn btn-secondary" onclick="downloadShareImage()">Share Result</button>
      </div>
    </div>
  `;
}


