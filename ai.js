import { SAM } from './cast.js';

const LORE = `
GAME CHANGER (Dropout, hosted by Sam Reich) is "the game show where the game changes every episode."
Players never know the premise going in; the real rules are often hidden and revealed mid-show with a twist.
Sam awards points arbitrarily, sometimes absurdly, and is open about it. The crew, cameras, and budget are part of the joke.
Famous episodes for TONE ONLY (never copy them): Sam Says, Escape Room, Noise Boys / Make Some Noise (improv prompts),
Like Share Subscribe, Bingo, Beat the Buzzer, Rulette (spin a wheel of rules), Kangaroo Court, Count the Rice,
Don't Wake Standards & Practices, Night Shift, Earwigs, I Spy, What's the Catch, Last Talent Standing.
`;

const THEMES = [
  'a heist', 'a cooking competition', 'a nature documentary', 'a corporate retreat', 'a haunted house', 'a wedding',
  'a space mission', 'a pirate ship', 'a murder mystery', 'a children\'s TV show', 'a sports broadcast', 'a support group',
  'a medieval court', 'a self-help seminar', 'a time machine', 'an infomercial', 'a soap opera', 'a museum tour',
  'a job interview', 'a funeral for a prop', 'a dating show', 'a theme park', 'a laundromat', 'an airport',
  'a magic show', 'a submarine', 'a talent agency', 'a spelling bee', 'a robot uprising', 'a parent-teacher conference',
];
const MECHANICS = [
  'points secretly depend on a hidden word or behavior', 'the rules flip halfway through',
  'the players are secretly competing for the crew\'s approval', 'one rule gets added every round',
  'the "real" game was happening the whole time in the background', 'the scoring is reversed at the end',
  'the prompts are secretly all connected into one story', 'there is a hidden judge',
];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

async function ask(system, user, schema) {
  const completion = await websim.chat.completions.create({
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    schema,
  });
  return JSON.parse(completion.content);
}

const castLines = (cast) => cast.map((c, i) => `${i}: ${c.persona}`).join('\n');

export async function writeEpisode(cast, playerIdx, history) {
  const seed = `${pick(THEMES)} + ${pick(MECHANICS)} + ${pick(THEMES)}`;
  const system = `You are the writers' room for Game Changer. ${LORE}
Host: ${SAM.persona}
Players (index: persona):
${castLines(cast)}
Write ONE brand-new episode. Every round must be an IMPROV performance round where any player can buzz in and perform a bit
in a sentence or three (spoken or typed). Prompts should be specific, funny, and open (in the spirit of "Make some noise...",
"Pitch...", "Give us...", "Be the...", "Narrate...", etc. — vary the formats). Rounds should escalate.
secretRule is a hidden scoring rule that players can stumble into while improvising (e.g. "mentioning a body of water",
"speaking as if you're very old", "rhyming", "saying Sam's name"), not something impossible. It is revealed after round 2 as the GAME CHANGER.
Sam's lines should be short, dry, spoken out loud (no stage directions, no emojis). Keep it PG-13.`;
  const user = `Inspiration seed (twist it, don't be literal): ${seed}.
Avoid these past titles: ${history.join(', ') || 'none'}.
The human plays index ${playerIdx}.`;
  return ask(system, user, {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Episode title, 1-4 words' },
      cold_open: { type: 'string', description: 'Sam welcomes everyone, introduces the show and the three players by name, teases nothing. 2-3 sentences.' },
      secretRule: { type: 'string', description: 'The hidden scoring rule, plainly stated' },
      twistReveal: { type: 'string', description: 'Sam reveals the Game Changer: what was really going on. 2-3 sentences, dramatic and smug.' },
      prize: { type: 'string', description: 'An absurd, low-budget prize for the winner' },
      rounds: {
        type: 'array', minItems: 3, maxItems: 3,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            intro: { type: 'string', description: 'Sam explains the round in 1-2 sentences' },
            prompts: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'string', description: 'The improv prompt as Sam says it' } },
          },
          required: ['name', 'intro', 'prompts'], additionalProperties: false,
        },
      },
    },
    required: ['title', 'cold_open', 'secretRule', 'twistReveal', 'prize', 'rounds'],
    additionalProperties: false,
  });
}

// Pre-writes the AI players' bits for a round so they can buzz in without a wait.
export async function writeRivalBits(ep, roundIdx, cast, rivals, revealed) {
  const r = ep.rounds[roundIdx];
  const system = `You write improv for Game Changer. ${LORE}
Host: ${SAM.persona}
Players:
${castLines(cast)}
Hidden scoring rule: "${ep.secretRule}" ${revealed ? '(now REVEALED to the players — they actively try to exploit it)' : '(players do NOT know it; sometimes, by accident, a bit happens to satisfy it)'}.
Write each player's performance in their voice: 1-3 punchy sentences, committed, genuinely funny, no stage directions in brackets.
Then Sam's short dry reaction (1-2 sentences) and the points he awards (integer, usually 1-5, occasionally 0, negative, or a ridiculous number).`;
  const user = `Round "${r.name}": ${r.intro}
Prompts:
${r.prompts.map((p, i) => `${i}. ${p}`).join('\n')}
Write bits for player indexes ${rivals.join(' and ')} on EVERY prompt.`;
  const out = await ask(system, user, {
    type: 'object',
    properties: {
      bits: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            prompt: { type: 'integer' },
            player: { type: 'integer' },
            text: { type: 'string' },
            reaction: { type: 'string' },
            points: { type: 'integer' },
            ruleHit: { type: 'boolean' },
          },
          required: ['prompt', 'player', 'text', 'reaction', 'points', 'ruleHit'], additionalProperties: false,
        },
      },
    },
    required: ['bits'], additionalProperties: false,
  });
  return out.bits;
}

export async function judge(ep, roundIdx, prompt, cast, playerIdx, text, revealed, log) {
  const c = cast[playerIdx];
  const system = `You are ${SAM.persona}
${LORE}
Hidden scoring rule: "${ep.secretRule}" ${revealed ? '(revealed — reward it generously when exploited)' : '(secret — never mention it; quietly award extra when it is satisfied)'}.
React to the player's improv in 1-2 short spoken sentences, dry and specific to what they actually said, maybe a meta joke.
Award arbitrary but fair-feeling points: usually 1-5; reward commitment and big swings; a weak or empty bit can get 0 or negative;
very rarely an absurd number. Judge on comedy, not on correctness.`;
  const user = `Round "${ep.rounds[roundIdx].name}". Prompt: "${prompt}"
Earlier in the show: ${log.slice(-4).join(' | ') || 'nothing yet'}
${c.name} (${c.short}) performs: "${text || '(nothing — they froze)'}"`;
  return ask(system, user, {
    type: 'object',
    properties: { reaction: { type: 'string' }, points: { type: 'integer' }, ruleHit: { type: 'boolean' } },
    required: ['reaction', 'points', 'ruleHit'], additionalProperties: false,
  });
}
