window.STL = window.STL || {};

STL.config = {
  // MLS season id is per-season; next year's comes from mlssoccer.com's currentSeasonSportecId.
  MLS_SEASON_ID: 'MLS-SEA-0001KA',
  MLS_COMPETITION_ID: 'MLS-COM-000001',
  // Western Conference: MLS three-letter code -> ESPN team id. Codes verified 2026-09-25 (LAG = 'LA').
  MLSWEST: [
    { code: 'COL', espn: '184' },
    { code: 'DAL', espn: '185' },
    { code: 'SKC', espn: '186' },
    { code: 'LA', espn: '187' },
    { code: 'HOU', espn: '6077' },
    { code: 'RSL', espn: '4771' },
    { code: 'SJ', espn: '191' },
    { code: 'POR', espn: '9723' },
    { code: 'SEA', espn: '9726' },
    { code: 'VAN', espn: '9727' },
    { code: 'MIN', espn: '17362' },
    { code: 'LAFC', espn: '18966' },
    { code: 'ATX', espn: '20906' },
    { code: 'STL', espn: '21812' },
    { code: 'SD', espn: '22529' }
  ],

  TEAMS: [
    {
      id: '24',
      name: 'Cardinals',
      league: 'MLB',
      leagueFull: 'National League Central',
      sport: 'baseball',
      leagueSlug: 'mlb',
      cardClass: 'cardinals',
      icon: 'STL',
      links: [
        { text: 'Official Site', href: 'https://www.mlb.com/cardinals' },
        { text: 'Schedule', href: 'https://www.mlb.com/cardinals/schedule' },
        { text: 'Tickets', href: 'https://www.mlb.com/cardinals/tickets' },
      ]
    },
    {
      id: '19',
      name: 'Blues',
      league: 'NHL',
      leagueFull: 'Central Division',
      sport: 'hockey',
      leagueSlug: 'nhl',
      cardClass: 'blues',
      icon: 'STL',
      links: [
        { text: 'Official Site', href: 'https://www.nhl.com/blues' },
        { text: 'Schedule', href: 'https://www.nhl.com/blues/schedule' },
        { text: 'Tickets', href: 'https://www.nhl.com/blues/tickets' },
      ]
    },
    {
      id: '21812',
      name: 'CITY SC',
      league: 'MLS',
      leagueFull: 'Western Conference',
      sport: 'soccer',
      leagueSlug: 'usa.1',
      cardClass: 'city-sc',
      icon: 'CITY',
      links: [
        { text: 'Official Site', href: 'https://www.stlcitysc.com' },
        { text: 'Schedule', href: 'https://www.stlcitysc.com/schedule' },
        { text: 'Tickets', href: 'https://www.stlcitysc.com/tickets' },
        { text: 'Datavizer', href: 'https://www.soccerdatavizer.com' },
      ]
    },
    {
      id: '112651',
      name: 'BattleHawks',
      league: 'UFL',
      leagueFull: 'UFL',
      sport: 'football',
      leagueSlug: 'ufl',
      cardClass: 'battlehawks',
      icon: 'STL',
      standingOverride: '2nd in UFL',
      links: [
        { text: 'Official Site', href: 'https://www.theufl.com/teams/st-louis' },
        { text: 'Schedule', href: 'https://www.theufl.com/teams/st-louis/schedule' },
        { text: 'Tickets', href: 'https://www.theufl.com/teams/st-louis/tickets' },
      ]
    }
  ],

  // Farm-system affiliates shown as dropdowns on the parent card.
  // MiLB live data: MLB Stats API (statsapi.mlb.com), ids hardcoded
  // (verified 2026-09-30). hydrate=record goes empty in the offseason, so
  // the record comes from schedule-last-final with a standings fallback
  // (see STL.api.fetchMilbAffiliate).
  // AHL/ECHL live data: HockeyTech LeagueStat, prefetched server-side to
  // Sports/data/blues-affiliates.json (see STL.api.fetchAffPrefetch) with a
  // CORS-proxy live fallback (see STL.api.HT).
  AFFILIATES: {
    cardinals: [
      { name: 'Memphis Redbirds', level: 'AAA', id: 235, leagueId: 117, sportId: 11, site: 'https://www.milb.com/memphis' },
      { name: 'Springfield Cardinals', level: 'AA', id: 440, leagueId: 109, sportId: 12, site: 'https://www.milb.com/springfield' },
      { name: 'Peoria Chiefs', level: 'High-A', id: 443, leagueId: 118, sportId: 13, site: 'https://www.milb.com/peoria' },
      { name: 'Palm Beach Cardinals', level: 'Single-A', id: 279, leagueId: 123, sportId: 14, site: 'https://www.milb.com/palm-beach' },
      { name: 'FCL Cardinals', level: 'Rookie', id: 1370, leagueId: 124, sportId: 16, site: 'https://www.milb.com/florida-complex-league' },
    ],
    blues: [
      { name: 'Springfield Thunderbirds', level: 'AHL', league: 'ahl', site: 'https://www.springfieldthunderbirds.com' },
      { name: 'Worcester Railers', level: 'ECHL', league: 'echl', site: 'https://railershc.com' },
    ]
  },

  // Second page ("others.html"). Same card schema as TEAMS.
  // IDs verified via espn.com team pages 2026-09-30 except where noted.
  // KBO/NPB have no ESPN endpoints — NPB via npb-result API, KBO via live
  // scrape of eng.koreabaseball.com with a manualFallback seed.
  OTHER_TEAMS: [
    {
      id: '23',
      name: 'Steelers',
      league: 'NFL',
      leagueFull: 'AFC North',
      sport: 'football',
      leagueSlug: 'nfl',
      cardClass: 'steelers',
      icon: 'PIT',
      links: [
        { text: 'Official Site', href: 'https://www.steelers.com' },
        { text: 'Schedule', href: 'https://www.steelers.com/schedule' },
        { text: 'Tickets', href: 'https://www.steelers.com/tickets' },
      ]
    },
    {
      id: '132',
      name: 'Bayern Munich',
      league: 'Bundesliga',
      leagueFull: 'German Bundesliga',
      sport: 'soccer',
      leagueSlug: 'ger.1',
      cardClass: 'bayern',
      icon: 'FCB',
      links: [
        { text: 'Official Site', href: 'https://fcbayern.com' },
        { text: 'Schedule', href: 'https://fcbayern.com/en/matches/profis/schedule' },
        { text: 'Tickets', href: 'https://fcbayern.com/en/tickets' },
      ]
    },
    {
      id: '393',
      name: 'Nottingham Forest',
      league: 'EPL',
      leagueFull: 'English Premier League',
      sport: 'soccer',
      leagueSlug: 'eng.1',
      cardClass: 'forest',
      icon: 'NFO',
      links: [
        { text: 'Official Site', href: 'https://www.nottinghamforest.co.uk' },
        { text: 'Schedule', href: 'https://www.nottinghamforest.co.uk/fixtures' },
        { text: 'Tickets', href: 'https://www.nottinghamforest.co.uk/tickets' },
      ]
    },
    {
      id: '7108',
      name: 'Nagoya Grampus',
      league: 'J1 League',
      leagueFull: 'Japanese J1 League',
      sport: 'soccer',
      leagueSlug: 'jpn.1',
      cardClass: 'grampus',
      icon: 'NAG',
      logo: 'https://assets.football-logos.cc/logos/japan/512x512/nagoya-grampus.627e921e.png',
      links: [
        { text: 'Official Site', href: 'https://nagoya-grampus.jp' },
        { text: 'Schedule', href: 'https://nagoya-grampus.jp/match' },
        { text: 'Tickets', href: 'https://nagoya-grampus.jp/ticket' },
      ]
    },
    {
      id: '22028',
      name: 'Al Kholood',
      league: 'SPL',
      leagueFull: 'Saudi Pro League',
      sport: 'soccer',
      leagueSlug: 'ksa.1',
      cardClass: 'kholood',
      icon: 'KHO',
      links: [
        { text: 'Official Site', href: 'https://www.spl.com.sa/en/teams/3111/al-kholood/overview' },
        { text: 'Schedule', href: 'https://www.espn.com/soccer/team/fixtures/_/id/22028/al-kholood' },
        { text: 'Table', href: 'https://www.espn.com/soccer/table/_/league/ksa.1' },
      ]
    },
    {
      id: '660',
      name: 'USMNT',
      league: 'International',
      leagueFull: "US Men's National Team",
      sport: 'soccer',
      leagueSlug: 'fifa.world',
      cardClass: 'usmnt',
      icon: 'USA',
      hideWhenIdle: true,
      links: [
        { text: 'Official Site', href: 'https://www.ussoccer.com/mens-national-team' },
        { text: 'Schedule', href: 'https://www.ussoccer.com/mens-national-team/schedule' },
        { text: 'Tickets', href: 'https://www.ussoccer.com/tickets' },
      ]
    },
    {
      id: '481',
      name: 'Germany MNT',
      league: 'International',
      leagueFull: "Germany Men's National Team",
      sport: 'soccer',
      leagueSlug: 'fifa.world',
      cardClass: 'germany',
      icon: 'GER',
      hideWhenIdle: true,
      links: [
        { text: 'Official Site', href: 'https://www.dfb.de/en/national-teams/mens-national-team' },
        { text: 'Schedule', href: 'https://www.dfb.de/en/national-teams/mens-national-team/matches' },
        { text: 'Tickets', href: 'https://tickets.dfb.de' },
      ]
    },
    {
      id: '2565',
      name: 'SIUE Cougars',
      league: "NCAA Men's Basketball",
      leagueFull: 'OVC',
      sport: 'basketball',
      leagueSlug: 'mens-college-basketball',
      cardClass: 'cougars',
      icon: 'SIUE',
      links: [
        { text: 'Official Site', href: 'https://www.siuecougars.com/sports/mens-basketball' },
        { text: 'Schedule', href: 'https://www.siuecougars.com/sports/mens-basketball/schedule' },
        { text: 'Roster', href: 'https://www.siuecougars.com/sports/mens-basketball/roster' },
      ]
    },
    {
      id: '17412',
      name: "SIUE Men's Soccer",
      league: "NCAA Men's Soccer",
      leagueFull: 'OVC',
      sport: 'soccer',
      leagueSlug: 'usa.ncaa.m.1',
      cardClass: 'cougars-soccer',
      icon: 'SIUE',
      links: [
        { text: 'Official Site', href: 'https://www.siuecougars.com/sports/mens-soccer' },
        { text: 'Schedule', href: 'https://www.siuecougars.com/sports/mens-soccer/schedule' },
        { text: 'Roster', href: 'https://www.siuecougars.com/sports/mens-soccer/roster' },
      ]
    },
    {
      id: 'dinos',
      name: 'NC Dinos',
      league: 'KBO',
      leagueFull: 'KBO League',
      sport: 'baseball',
      leagueSlug: 'kbo',
      cardClass: 'dinos',
      icon: 'NC',
      logo: 'https://logotyp.us/file/nc-dinos.svg',
      kbo: true,
      kboName: 'NC',
      // Fallback seed if the live KBO scrape is unreachable (CORS). Verified
      // 2026-09-30 from eng.koreabaseball.com/Standings/TeamStandings.aspx.
      manualFallback: {
        wins: 62, losses: 71, ties: 2, pct: '.466',
        rank: 6, leagueName: 'KBO League', gb: '21.0', streak: 'L2',
        note: 'as of Sep 30 · official KBO'
      },
      links: [
        { text: 'Official Site', href: 'https://www.ncdinos.com' },
        { text: 'Stats', href: 'https://mykbostats.com/teams/9-NC-Dinos' },
        { text: 'Standings', href: 'https://eng.koreabaseball.com/Standings/TeamStandings.aspx' },
      ]
    },
    {
      id: 'eagles-npb',
      name: 'Rakuten Eagles',
      league: 'NPB',
      leagueFull: 'Pacific League',
      sport: 'baseball',
      leagueSlug: 'npb',
      cardClass: 'rakuten',
      icon: 'RAK',
      logo: 'https://commons.wikimedia.org/wiki/Special:FilePath/Rakuten%20eagles%202024%20logo.svg',
      npbName: '楽天',
      links: [
        { text: 'Official Site', href: 'https://www.rakuteneagles.jp/en' },
        { text: 'Schedule', href: 'https://npb.jp/en/scores' },
        { text: 'Stats', href: 'https://npb.jp/en/stats' },
      ]
    }
  ]
};
