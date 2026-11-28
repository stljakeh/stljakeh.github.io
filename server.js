import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const COACHES_DATA_PATH = path.join(__dirname, 'Sports', 'data', 'coaches.json');
const COACHES_CACHE_TTL_MS = 10 * 60 * 1000;
let coachesCache = { at: 0, payload: null };

function normalizeName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function initialsFor(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function cleanWikiValue(raw) {
  if (!raw) return '';
  let s = String(raw)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/<ref[^>]*\/>/gi, '')
    .replace(/<br\s*\/?>/gi, ', ')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/'''?/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[,;\s]+|[,;\s]+$/g, '')
    .trim();
  if (/^(vacant|tbd|tba|none|n\/a|-+|—+)$/i.test(s)) return '';
  return s;
}

function parseInfoboxField(wikitext, fields) {
  if (!wikitext) return { value: '', linkTitle: '' };
  for (const field of fields) {
    const re = new RegExp('^\\|\\s*' + field + '\\s*=\\s*(.+)$', 'im');
    const m = wikitext.match(re);
    if (!m) continue;
    const raw = m[1].split(/\n\|/)[0].trim();
    const linkMatch = raw.match(/\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/);
    const linkTitle = linkMatch ? linkMatch[1].trim() : '';
    const value = cleanWikiValue(raw);
    if (value) return { value, linkTitle };
  }
  return { value: '', linkTitle: '' };
}

function parseBirthDate(wikitext) {
  if (!wikitext) return '';
  const m = wikitext.match(/\{\{birth\s+date(?:\s+and\s+age)?\|(?:[^|{}]*\|)*?(\d{4})\|(\d{1,2})\|(\d{1,2})/i);
  if (!m) return '';
  const y = m[1];
  const mo = String(m[2]).padStart(2, '0');
  const d = String(m[3]).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

async function fetchJson(url, ms = 6000) {
  const resp = await fetch(url, {
    signal: AbortSignal.timeout(ms),
    headers: { 'User-Agent': 'stljakeh.github.io-coaches/1.0' }
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function detectCoachForTeam(coach) {
  const src = coach.sources || {};
  let detected = null;
  let sourceLabel = '';

  // 1. Official MLB Stats API for Cardinals Manager
  if (src.mlbCoaches) {
    try {
      const data = await fetchJson(src.mlbCoaches);
      const mgr = (data.roster || []).find(
        (r) => r.jobId === 'MNGR' || /^manager$/i.test(r.job || '')
      );
      if (mgr && mgr.person && mgr.person.fullName) {
        detected = { name: mgr.person.fullName.trim(), linkTitle: '' };
        sourceLabel = 'MLB Stats API';
      }
    } catch {}
  }

  // 2. ESPN Roster API for NHL / MLB head coach
  if (!detected && src.espnRoster) {
    try {
      const data = await fetchJson(src.espnRoster);
      const c0 = Array.isArray(data.coach) ? data.coach[0] : null;
      if (c0 && (c0.firstName || c0.lastName)) {
        detected = {
          name: [c0.firstName, c0.lastName].filter(Boolean).join(' ').trim(),
          linkTitle: ''
        };
        sourceLabel = 'ESPN Roster API';
      }
    } catch {}
  }

  // 3. Wikipedia team infobox (primary for MLS/UFL, fallback for NHL/MLB)
  if (!detected && src.wikiTitle) {
    try {
      const url =
        'https://en.wikipedia.org/w/api.php?action=query&titles=' +
        encodeURIComponent(src.wikiTitle) +
        '&redirects=1&prop=revisions&rvprop=content&rvslots=main&rvsection=0&format=json';
      const data = await fetchJson(url);
      const pages = Object.values(data.query?.pages || {});
      const wikitext = pages[0]?.revisions?.[0]?.slots?.main?.['*'] || '';
      const parsed = parseInfoboxField(wikitext, src.wikiFields || ['coach', 'head_coach', 'manager']);
      if (parsed.value) {
        detected = { name: parsed.value, linkTitle: parsed.linkTitle };
        sourceLabel = 'Wikipedia';
      }
    } catch {}
  }

  return detected ? { ...detected, sourceLabel } : null;
}

async function fetchLiveTeamRecord(coach) {
  const src = coach.sources || {};
  if (!src.espnTeam) return null;
  try {
    const data = await fetchJson(src.espnTeam);
    const team = data.team;
    const item = team?.record?.items?.[0];
    if (!item || !Array.isArray(item.stats)) return null;
    const stat = (name) => {
      const s = item.stats.find((x) => x.name === name);
      return s && typeof s.value === 'number' ? s.value : null;
    };
    return {
      wins: stat('wins'),
      losses: stat('losses'),
      ties: stat('ties'),
      otLosses: stat('otLosses'),
      gamesPlayed: stat('gamesPlayed'),
      points: stat('points'),
      winPercent: stat('winPercent'),
      summary: item.summary || '',
      standingSummary: team.standingSummary || ''
    };
  } catch {
    return null;
  }
}

async function fetchNewCoachProfile(baseCoach, detected, liveRecord) {
  const wikiLookup = detected.linkTitle || detected.name;
  let birthDate = '';
  let birthPlace = '—';
  let almaMater = '—';
  let bio = `${detected.name} was detected via ${detected.sourceLabel} as the ${baseCoach.role.toLowerCase()} of the ${baseCoach.team}.`;
  let headshot = '';
  let careerRows = [];

  try {
    const [infoRes, sumRes] = await Promise.allSettled([
      fetchJson(
        'https://en.wikipedia.org/w/api.php?action=query&titles=' +
          encodeURIComponent(wikiLookup) +
          '&redirects=1&prop=revisions&rvprop=content&rvslots=main&rvsection=0&format=json'
      ),
      fetchJson(
        'https://en.wikipedia.org/api/rest_v1/page/summary/' +
          encodeURIComponent(wikiLookup.replace(/\s+/g, '_'))
      )
    ]);

    if (infoRes.status === 'fulfilled') {
      const pages = Object.values(infoRes.value.query?.pages || {});
      const wt = pages[0]?.revisions?.[0]?.slots?.main?.['*'] || '';
      birthDate = parseBirthDate(wt);
      const bp = parseInfoboxField(wt, ['birth_place']);
      if (bp.value) birthPlace = bp.value;
      const am = parseInfoboxField(wt, ['alma_mater', 'college', 'education']);
      if (am.value) almaMater = am.value;
      const prev = parseInfoboxField(wt, ['coached_for', 'past_teams', 'former_teams']);
      if (prev.value) {
        careerRows.push({ label: 'Prior Coaching / Playing', value: prev.value });
      }
    }
    if (sumRes.status === 'fulfilled' && sumRes.value) {
      if (sumRes.value.extract) {
        const sentences = sumRes.value.extract.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ');
        if (sentences) bio = sentences;
      }
      const rawImg = sumRes.value.thumbnail?.source || sumRes.value.originalimage?.source || '';
      if (rawImg) headshot = rawImg.split('?')[0];
    }
  } catch {}

  const todayIso = new Date().toISOString().slice(0, 10);
  const todayDisp = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  const recStr = liveRecord && liveRecord.wins != null
    ? (baseCoach.sport === 'hockey'
        ? `${liveRecord.wins}–${liveRecord.losses}–${liveRecord.otLosses || 0}`
        : baseCoach.sport === 'soccer'
          ? `${liveRecord.wins}–${liveRecord.losses}–${liveRecord.ties || 0}`
          : `${liveRecord.wins}–${liveRecord.losses}`)
    : '0–0';

  return {
    ...baseCoach,
    initials: initialsFor(detected.name),
    headshot,
    name: detected.name,
    aliases: [detected.name],
    franchiseNumber: `Appointed ${todayDisp} (auto-detected via ${detected.sourceLabel})`,
    hiredDate: todayIso,
    hiredDisplay: todayDisp,
    birthDate: birthDate || '',
    birthPlace,
    almaMater,
    contractNote: `Replaces ${baseCoach.name} · Detected via ${detected.sourceLabel}`,
    headlineRecord: recStr,
    headlineLabel: 'CURRENT TENURE',
    rateValue: liveRecord?.winPercent != null ? `.${Math.round(liveRecord.winPercent * 1000).toString().padStart(3, '0')}` : 'New Hire',
    rateSub: liveRecord?.standingSummary || 'Newly appointed',
    postseasonValue: '—',
    postseasonSub: 'First season in STL',
    highlightTag: 'New Coach Detected',
    autoUpdated: true,
    detectedSource: detected.sourceLabel,
    previousCoach: {
      name: baseCoach.name,
      record: baseCoach.headlineRecord,
      hiredDisplay: baseCoach.hiredDisplay
    },
    bio,
    seasons: [
      {
        season: 'Current',
        record: recStr,
        rate: '—',
        finish: liveRecord?.standingSummary || 'Active tenure',
        live: true,
        w: liveRecord?.wins || 0,
        l: liveRecord?.losses || 0,
        t: baseCoach.sport === 'hockey' ? (liveRecord?.otLosses || 0) : (liveRecord?.ties || 0)
      }
    ],
    seasonTotal: {
      record: recStr,
      rate: '—',
      finish: liveRecord?.standingSummary || 'New coaching tenure'
    },
    careerRows: careerRows.length
      ? careerRows
      : [{ label: 'Prior Tenure', value: `Succeeded ${baseCoach.name} (${baseCoach.headlineRecord})` }],
    honors: [`Auto-updated from ${detected.sourceLabel} upon coaching change detection`]
  };
}

function applyLiveRecordToCoach(coach, liveRecord) {
  if (!liveRecord || liveRecord.wins == null || !Array.isArray(coach.seasons)) return coach;
  const liveIdx = coach.seasons.findIndex((s) => s.live === true);
  if (liveIdx === -1) return coach;

  // Only overwrite active season row for teams actively tracked in-season (NHL Blues)
  if (coach.sport !== 'hockey') return coach;

  const w = liveRecord.wins || 0;
  const l = liveRecord.losses || 0;
  const otl = liveRecord.otLosses || 0;
  const gp = liveRecord.gamesPlayed || (w + l + otl);
  const ptsPct = gp > 0 ? ((w * 2 + otl) / (gp * 2)).toFixed(3).replace(/^0/, '') : '.000';

  const updatedSeasons = coach.seasons.map((s, idx) => {
    if (idx !== liveIdx) return s;
    return {
      ...s,
      w,
      l,
      t: otl,
      record: `${w}–${l}–${otl}`,
      rate: ptsPct,
      finish: `In progress (${gp} GP)`
    };
  });

  const totW = updatedSeasons.reduce((acc, s) => acc + (s.w || 0), 0);
  const totL = updatedSeasons.reduce((acc, s) => acc + (s.l || 0), 0);
  const totT = updatedSeasons.reduce((acc, s) => acc + (s.t || 0), 0);
  const totGp = totW + totL + totT;
  const totRate = totGp > 0 ? ((totW * 2 + totT) / (totGp * 2)).toFixed(3).replace(/^0/, '') : '.000';

  return {
    ...coach,
    headlineRecord: `${totW}–${totL}–${totT}`,
    rateValue: `${totRate} PTS%`,
    rateSub: `${totGp} games coached`,
    seasons: updatedSeasons,
    seasonTotal: {
      ...coach.seasonTotal,
      record: `${totW}–${totL}–${totT}`,
      rate: totRate,
      finish: `${totGp} GP · 3–4 Postseason`
    }
  };
}

async function buildLiveCoachesPayload() {
  const raw = JSON.parse(fs.readFileSync(COACHES_DATA_PATH, 'utf8'));
  const baseCoaches = Array.isArray(raw.coaches) ? raw.coaches : [];
  let changedAny = false;

  const updatedCoaches = await Promise.all(
    baseCoaches.map(async (coach) => {
      const [detected, liveRecord] = await Promise.all([
        detectCoachForTeam(coach),
        fetchLiveTeamRecord(coach)
      ]);

      if (detected) {
        const normDetected = normalizeName(detected.name);
        const known = [coach.name, ...(coach.aliases || [])].map(normalizeName);
        if (normDetected && !known.includes(normDetected)) {
          changedAny = true;
          return fetchNewCoachProfile(coach, detected, liveRecord);
        }
      }

      const synced = applyLiveRecordToCoach(coach, liveRecord);
      return {
        ...synced,
        verifiedAt: new Date().toISOString(),
        verifiedSource: detected ? detected.sourceLabel : 'Baseline'
      };
    })
  );

  const payload = {
    generated_at: raw.generated_at,
    checked_at: new Date().toISOString(),
    coaching_change_detected: changedAny,
    coaches: updatedCoaches
  };

  if (changedAny) {
    try {
      fs.writeFileSync(
        COACHES_DATA_PATH,
        JSON.stringify({ generated_at: payload.checked_at, coaches: updatedCoaches }, null, 2) + '\n',
        'utf8'
      );
    } catch {}
  }

  return payload;
}

app.get('/api/coaches', async (req, res) => {
  const forceRefresh = req.query.refresh === '1';
  const now = Date.now();
  if (!forceRefresh && coachesCache.payload && now - coachesCache.at < COACHES_CACHE_TTL_MS) {
    return res.json(coachesCache.payload);
  }
  try {
    const payload = await buildLiveCoachesPayload();
    coachesCache = { at: Date.now(), payload };
    return res.json(payload);
  } catch (err) {
    try {
      const fallback = JSON.parse(fs.readFileSync(COACHES_DATA_PATH, 'utf8'));
      return res.json({ ...fallback, checked_at: new Date().toISOString(), fallback: true });
    } catch {
      return res.status(500).json({ error: 'Unable to load coaches data' });
    }
  }
});

app.use('/Sports', express.static(path.join(__dirname, 'Sports')));

const rootAssets = ['index.html', 'favicon.ico', 'favicon.svg', 'apple-touch-icon.png'];
for (const file of rootAssets) {
  app.get('/' + file, (_req, res) => {
    res.sendFile(path.join(__dirname, file));
  });
}

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});
