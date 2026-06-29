async function fetchRoster(teamId, season) {
  const url = 'https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/teams/' + teamId + '/roster?season=' + season;
  const resp = await fetch(url);
  if (!resp.ok) return null;
  const data = await resp.json();
  if (!data.athletes || data.athletes.length === 0) return null;
  return data.athletes;
}

function extractStat(athlete, name) {
  const stats = athlete.statistics;
  if (!stats) return 0;
  for (const sk in stats) {
    const splits = stats[sk];
    if (!splits || !splits.categories) continue;
    for (const cat of splits.categories) {
      if (!cat.stats) continue;
      for (const s of cat.stats) {
        if (s.name === name && s.value != null) return s.value;
      }
    }
  }
  return 0;
}


