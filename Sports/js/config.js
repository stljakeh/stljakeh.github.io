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
    }
  ]
};
