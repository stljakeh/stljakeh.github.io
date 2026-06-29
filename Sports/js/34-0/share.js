function downloadShareImage() {
  const W = 600, H = 850;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  function drawPitch(px, py, pw, ph) {
    ctx.fillStyle = '#0e1a30';
    roundRect(px, py, pw, ph, 4); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1.5;
    roundRect(px, py, pw, ph, 4); ctx.stroke();

    const cx = px + pw / 2, cy = py + ph / 2;
    ctx.beginPath(); ctx.moveTo(px, cy); ctx.lineTo(px + pw, cy); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 40, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();

    const paW = pw * 0.6, paH = ph * 0.2;
    roundRect(px + (pw - paW) / 2, py, paW, paH, 2); ctx.stroke();
    roundRect(px + (pw - paW) / 2, py + ph - paH, paW, paH, 2); ctx.stroke();

    const gW = pw * 0.18, gH = 8;
    roundRect(px + (pw - gW) / 2, py - gH, gW, gH, 2); ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fill(); ctx.stroke();
    roundRect(px + (pw - gW) / 2, py + ph, gW, gH, 2); ctx.fill(); ctx.stroke();
  }

  function drawCard(cx, cy, cw, ch, slot, st) {
    const x = cx - cw / 2, y = cy - ch / 2;
    const pos = slot.pos;
    const colors = { G: '#E2231A', D: '#1C3570', M: '#c0c0c0', F: '#E2231A' };
    const col = colors[pos] || '#888';
    const name = (slot.player.fullName || '').split(' ').pop().substring(0, 12);
    const rat = slot.player.rating;

    roundRect(x, y, cw, ch, 6);
    ctx.fillStyle = '#111827'; ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 1.5;
    roundRect(x, y, cw, ch, 6); ctx.stroke();

    roundRect(x + 2, y + 5, 3, ch - 10, 1.5);
    ctx.fillStyle = col; ctx.fill();

    ctx.fillStyle = col;
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(POS_LABELS[pos], x + 10, y + 6);

    const rcX = x + cw - 16, rcY = y + 10, rcR = 11;
    ctx.beginPath(); ctx.arc(rcX, rcY, rcR, 0, Math.PI * 2);
    ctx.fillStyle = '#f6c945'; ctx.fill();
    ctx.fillStyle = '#080e1a';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(rat, rcX, rcY);

    ctx.fillStyle = '#ecfdf5';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(name, cx, y + 23);

    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    if (pos === 'G') {
      ctx.fillStyle = '#E2231A';
      ctx.fillText('CS:' + st.cleanSheets + '  M:' + st.motm, cx, y + 48);
    } else {
      ctx.fillStyle = '#f6c945';
      ctx.fillText('G:' + st.goals + '  A:' + st.assists, cx, y + 48);
    }
  }

  // Background
  ctx.fillStyle = '#080e1a';
  ctx.fillRect(0, 0, W, H);

  // Header
  ctx.fillStyle = '#E2231A';
  ctx.font = 'bold 28px sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText('34-0', 30, 16);

  const recordStr = state.record.w + 'W-' + state.record.d + 'D-' + state.record.l + 'L';
  ctx.fillStyle = '#ecfdf5';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(recordStr, W - 30, 20);

  const perfect = isPerfect();
  const champion = state.wonPlayoffs;
  let verdict;
  if (champion && perfect) verdict = 'PERFECT SEASON & MLS CUP CHAMPIONS!';
  else if (champion) verdict = 'MLS CUP CHAMPIONS!';
  else if (perfect) verdict = 'PERFECT SEASON! 34-0-0!';
  else verdict = state.record.w >= 20 ? 'A strong season!' : state.record.w >= 10 ? 'A respectable campaign.' : 'Tough season.';
  ctx.fillStyle = (perfect || champion) ? '#f6c945' : 'rgba(236,253,245,0.6)';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(verdict, W / 2, 52);

  const infoLine = state.formation.label + ' \u00b7 ' + state.squadRating + ' avg';
  ctx.fillStyle = 'rgba(236,253,245,0.35)';
  ctx.font = '11px sans-serif';
  ctx.fillText(infoLine, W / 2, 68);

  // Pitch
  const pX = 50, pY = 96, pW = 500, pH = 460;
  drawPitch(pX, pY, pW, pH);

  // Player cards
  const rows = [
    { pos: 'F', pct: 0.14 },
    { pos: 'M', pct: 0.36 },
    { pos: 'D', pct: 0.60 },
    { pos: 'G', pct: 0.84 },
  ];
  for (const r of rows) {
    const slots = state.slots.filter(s => s.pos === r.pos);
    if (!slots.length) continue;
    const cW = Math.min(155, Math.floor((pW - 16) / slots.length - 6));
    const cH = 74;
    const totalW = slots.length * cW + (slots.length - 1) * 6;
    const startX = pX + (pW - totalW) / 2 + cW / 2;
    const cY = pY + pH * r.pct;
    for (let i = 0; i < slots.length; i++) {
      const st = state.playerStats[slots[i].player.id] || { goals: 0, assists: 0, cleanSheets: 0, motm: 0 };
      drawCard(startX + i * (cW + 6), cY, cW, cH, slots[i], st);
    }
  }

  // Leaders
  const ps = state.playerStats;
  const topScorer = Object.values(ps).sort(function(a, b) { return b.goals - a.goals; })[0];
  const topAssist = Object.values(ps).sort(function(a, b) { return b.assists - a.assists; })[0];
  const topCS = Object.values(ps).sort(function(a, b) { return b.cleanSheets - a.cleanSheets; })[0];
  const topMotm = Object.values(ps).sort(function(a, b) { return b.motm - a.motm; })[0];

  ctx.fillStyle = 'rgba(28,53,112,0.4)';
  ctx.fillRect(30, 590, W - 60, 1);
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  var leaders = [];
  if (topScorer) leaders.push('Goals: ' + topScorer.name + ' (' + topScorer.goals + ')');
  if (topAssist) leaders.push('Assists: ' + topAssist.name + ' (' + topAssist.assists + ')');
  if (topCS) leaders.push('CS: ' + topCS.name + ' (' + topCS.cleanSheets + ')');
  if (topMotm) leaders.push('MOTM: ' + topMotm.name + ' (' + topMotm.motm + ')');
  ctx.fillStyle = 'rgba(236,253,245,0.6)';
  ctx.fillText(leaders.join('  \u00b7  '), W / 2, 600);

  // Playoff result
  if (state.wonPlayoffs) {
    ctx.fillStyle = '#f6c945';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('MLS CUP CHAMPIONS', W / 2, 635);
  } else if (state.playoffRecord.w > 0 || state.playoffRecord.l > 0) {
    const playoffRec = state.playoffRecord.w + 'W-' + state.playoffRecord.l + 'L';
    const lastRound = state.playoffLog.filter(function(r) { return r.round !== 'Eliminated'; }).pop();
    ctx.fillStyle = 'rgba(236,253,245,0.6)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Playoffs: ' + playoffRec + '  |  ' + (lastRound ? lastRound.round : ''), W / 2, 635);
  }

  // Footer
  ctx.fillStyle = 'rgba(236,253,245,0.35)';
  ctx.font = '10px sans-serif';
  ctx.fillText('stljakeh.github.io/Sports/34-0.html', W / 2, 830);

  // Show in modal
  var dataUrl = canvas.toDataURL('image/png');
  var modal = document.getElementById('modal');
  modal.innerHTML = `
    <div class="modal-box" style="max-width:660px;padding:20px;">
      <img src="` + dataUrl + `" style="width:100%;border-radius:8px;display:block;" alt="34-0 Result">
      <div style="text-align:center;margin-top:12px;color:var(--text-secondary);font-size:0.75rem;">
        Press and hold on iOS to save · <a download="34-0-result.png" href="` + dataUrl + `" style="color:var(--mls-red);text-decoration:none;font-weight:600;">Download</a>
      </div>
    </div>
  `;
  modal.classList.add('active');
}

// ========== INIT ==========
render();

