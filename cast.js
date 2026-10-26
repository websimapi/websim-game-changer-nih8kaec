// The players and their host. Looks are stylized, built from primitives in scene.js.
export const CAST = [
  {
    id: 'brennan',
    name: 'Brennan Lee Mulligan',
    short: 'Brennan',
    face: '🐉',
    color: '#ff3d8b',
    blurb: 'Dungeon Master energy. Goes enormous, every time.',
    persona:
      'Brennan Lee Mulligan: theatrical, booming, wildly articulate, speaks in sweeping monologues, Dungeon Master energy, ' +
      'gets sincerely emotional about bits, escalates everything into an epic, loves a big swing and a big vocabulary. Pronouns he/him.',
    look: { skin: '#e9b896', shirt: '#7a2f8f', hair: '#3b2416', hairStyle: 'curly', beard: true, glasses: false },
    voice: 'en-male',
  },
  {
    id: 'lou',
    name: 'Lou Wilson',
    short: 'Lou',
    face: '😎',
    color: '#2de2e6',
    blurb: 'Smooth, fast, and unbearably confident.',
    persona:
      'Lou Wilson: smooth, charismatic, quick-witted, deadpan swagger, lands one-liners with total confidence, ' +
      'fiercely competitive and loves to roast the other players and Sam. Pronouns he/him.',
    look: { skin: '#6b4430', shirt: '#13707a', hair: '#141010', hairStyle: 'buzz', beard: true, glasses: false },
    voice: 'en-male',
  },
  {
    id: 'ally',
    name: 'Ally Beardsley',
    short: 'Ally',
    face: '🌀',
    color: '#ffd23f',
    blurb: 'Pure chaos. Commits to the weirdest possible choice.',
    persona:
      'Ally Beardsley: chaotic, surreal, gleefully unpredictable, commits to bizarre characters and voices, ' +
      'vulnerable-goofy, frequently derails the game in delightful ways. Pronouns they/them.',
    look: { skin: '#f1c9a8', shirt: '#c98a12', hair: '#c9a36b', hairStyle: 'mop', beard: false, glasses: false },
    voice: 'en-female',
  },
];

export const SAM = {
  id: 'sam',
  name: 'Sam Reich',
  short: 'Sam',
  color: '#ffffff',
  persona:
    'Sam Reich, host of Game Changer on Dropout: dry, deadpan, impish, quietly delighted by the players\' suffering, ' +
    'awards points arbitrarily and owns it, never reveals the true premise until he wants to, ' +
    'loves a fourth-wall break and a meta joke about the show, the crew, or Dropout\'s budget.',
  look: { skin: '#eab99a', shirt: '#1b1d2e', hair: '#2a1d14', hairStyle: 'short', beard: true, glasses: false, blazer: true },
  voice: 'en-male',
};
