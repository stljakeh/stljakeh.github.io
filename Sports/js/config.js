window.STL = window.STL || {};

STL.config = {
  CITY2_CP: 'https://proxy.cors.sh/',
  WEST_CONF: new Set([
    'eV5Dw4EMKn','gOMnJnOMwN','eVq3Z0D5WO','2lqRX1AMr0',
    'ljqE94Vqx0','2vQ14GKqrA','7VqG1oWMvW',
    'zeQZe4DqKw','4wM4E4d5jB','2vQ1XzlqrA',
    'Oa5wDy8q14','BLMv6m3Mxe','KXMe8Z2Q64','N6MmWV0qEG'
  ]),
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
      id: 'eVq3Z0D5WO',
      name: 'CITY2',
      league: 'MLS Next Pro',
      leagueFull: 'Western Conference',
      sport: 'soccer',
      leagueSlug: 'mlsnp',
      cardClass: 'city2',
      icon: 'CITY',
      customFetch: true,
      winsOffset: 1,
      links: [
        { text: 'Official Site', href: 'https://www.stlcitysc.com/city2/' },
        { text: 'Schedule', href: 'https://www.mlsnextpro.com/clubs/st-louis-city2/schedule/' },
      ]
    }
  ]
};
