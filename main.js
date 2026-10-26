import { CAST, SAM } from './cast.js';
import * as S from './scene.js';
import { writeEpisode, writeRivalBits, judge } from './ai.js';

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);

/* ---------- audio ---------- */
const sfx = {};
for (const n of ['buzz', 'ding', 'sting', 'laugh', 'fanfare']) sfx[n] = new Audio(`sfx/${n}.wav`);
const play = (n, vol = 0.8) => { const a = sfx[n].cloneNode(); a.volume = vol; a.play().catch(() => {}); };
let voices = true;
$('mute').onclick = () => {
  voices = !voices;
  $('mute').textContent = voices ? '🔊' : '🔈';
  if (!voices) speechSynthesis?.cancel();
};

/* ---------- state ---------- */
let me = 0, scores = [0, 0, 0], hits = [0, 0, 0], log = [];
const rivalsOf = (i) => [0, 1, 2].filter((j) => j !== i);
const who = (id) => (id === 'sam' ? SAM : CAST.find((c) => c.id === id));

/* ---------- talking ---------- */
async function say(id, text, shot = id) {
  if (!text) return;
  const c = who(id);
  if (shot) S.setShot(shot);
  S.setSpeaker(id);
  $('caption').classList.remove('hidden');
  $('caption').style.setProperty('--cc', id === 'sam' ? '#ffd23f' : c.color);
  $('cap-name').textContent = c.name;
  $('cap-text').textContent = text;
  const readMs = 900 + text.length * 48;
  if (voices) {
    await Promise.race([
      Promise.all([websim.textToSpeech({ text, voice: c.voice }).catch(() => {}), sleep(Math.min(readMs, 1500))]),
      sleep(readMs * 1.8 + 3000),
    ]);
    await sleep(250);
  } else {
    await sleep(readMs);
  }
  S.setSpeaker(null);
}

function award(i, pts, ruleHit) {
  scores[i] += pts;
  if (ruleHit) hits[i]++;
  S.setScore(i, scores[i]);
  play(pts > 0 ? 'ding' : 'buzz', 0.6);
  if (pts >= 4) setTimeout(() => play('laugh', 0.5), 300);
}

/* ---------- buzzing ---------- */
let buzzResolve = null;
function openBuzz(ms, rivalPick) {
  return new Promise((resolve) => {
    const start = performance.now();
    document.body.classList.add('buzz-open');
    $('buzzer').classList.toggle('hidden', rivalPick.playerDone);
    let rivalTimer = null, iv = null;
    const finish = (res) => {
      buzzResolve = null;
      clearTimeout(rivalTimer); clearInterval(iv);
      document.body.classList.remove('buzz-open');
      $('buzzer').classList.add('hidden');
      S.setTimer(null);
      resolve(res);
    };
    buzzResolve = () => finish('me');
    if (rivalPick.idx != null) rivalTimer = setTimeout(() => finish(rivalPick.idx), rivalPick.delay);
    iv = setInterval(() => {
      const left = 1 - (performance.now() - start) / ms;
      if (left <= 0) finish(null); else S.setTimer(left);
    }, 100);
  });
}
function pressBuzzer() {
  if (!buzzResolve || $('buzzer').classList.contains('hidden')) return;
  play('buzz');
  S.buzz(me, CAST[me].id);
  buzzResolve();
}
$('buzzer').addEventListener('pointerdown', (e) => { e.preventDefault(); pressBuzzer(); });

/* ---------- responding (type or speak) ---------- */
const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!Rec) $('mic').classList.add('hidden');
let rec = null, respondResolve = null;

function stopMic() {
  if (rec) { rec.onend = null; rec.stop(); rec = null; }
  $('mic').classList.remove('live');
  $('mic').querySelector('span').textContent = 'Speak';
}
$('mic').onclick = () => {
  if (rec) return stopMic();
  rec = new Rec();
  rec.lang = 'en-US'; rec.interimResults = true; rec.continuous = true;
  const before = $('answer').value ? $('answer').value.trim() + ' ' : '';
  rec.onresult = (e) => {
    let t = '';
    for (const r of e.results) t += r[0].transcript;
    $('answer').value = before + t;
  };
  rec.onend = stopMic;
  rec.onerror = stopMic;
  rec.start();
  $('mic').classList.add('live');
  $('mic').querySelector('span').textContent = 'Listening…';
};

function respond(prompt, ms = 35000) {
  return new Promise((resolve) => {
    document.body.classList.add('responding');
    $('respond').style.setProperty('--me', CAST[me].color);
    $('respond-prompt').textContent = prompt;
    $('answer').value = '';
    $('respond').classList.remove('hidden');
    if (matchMedia('(hover: hover)').matches) $('answer').focus();
    const fill = $('timer-fill');
    fill.style.transition = 'none'; fill.style.transform = 'scaleX(1)';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      fill.style.transition = `transform ${ms}ms linear`; fill.style.transform = 'scaleX(0)';
    }));
    const to = setTimeout(() => respondResolve(), ms);
    respondResolve = () => {
      clearTimeout(to);
      stopMic();
      respondResolve = null;
      document.body.classList.remove('responding');
      $('respond').classList.add('hidden');
      $('answer').blur();
      resolve($('answer').value.trim());
    };
  });
}
$('done').onclick = () => respondResolve?.();
$('answer').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); respondResolve?.(); }
});
addEventListener('keydown', (e) => {
  if (e.code === 'Space' && document.activeElement !== $('answer')) { e.preventDefault(); pressBuzzer(); }
});

/* ---------- the show ---------- */
const NOBODY = [
  'Nobody? Wow. I wrote that one myself.',
  'Silence. The editors will love this.',
  'Okay. We will cut this part.',
  'The crew is very disappointed in all of you.',
];

async function retry(fn, n = 3) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) { if (i >= n - 1) throw e; await sleep(800); }
  }
}

async function playEpisode() {
  scores = [0, 0, 0]; hits = [0, 0, 0]; log = [];
  CAST.forEach((_, i) => S.setScore(i, 0));
  $('end').classList.add('hidden');
  $('standby').classList.remove('hidden');
  S.setShot('wide');
  S.setScreen({ mode: 'logo', body: 'Please stand by', timer: null });

  const history = JSON.parse(localStorage.getItem('gc-history') || '[]');
  let ep;
  try {
    ep = await retry(() => writeEpisode(CAST, me, history));
  } catch (e) {
    console.error(e);
    $('standby').classList.add('hidden');
    await say('sam', 'We seem to be having technical difficulties. Our budget is mostly snacks. Let\'s try that again.');
    return playEpisode();
  }
  localStorage.setItem('gc-history', JSON.stringify([ep.title, ...history].slice(0, 25)));
  $('standby').classList.add('hidden');
  $('hud').classList.remove('hidden');

  const rivals = rivalsOf(me);
  const bitsFor = [];
  const fetchBits = (r, revealed) => (bitsFor[r] = retry(() => writeRivalBits(ep, r, CAST, rivals, revealed), 2).catch(() => []));
  fetchBits(0, false);
  fetchBits(1, false);

  play('fanfare', 0.5);
  S.setScreen({ mode: null, kicker: 'Tonight on Game Changer', title: ep.title, body: '' });
  $('round-tag').textContent = ep.title;
  await sleep(1400);
  await say('sam', ep.cold_open);
  S.setShot('players');
  await sleep(1200);

  let revealed = false;
  for (let r = 0; r < ep.rounds.length; r++) {
    const round = ep.rounds[r];
    $('round-tag').textContent = `${ep.title} · Round ${r + 1}`;
    S.setScreen({ mode: revealed ? 'twist' : null, kicker: `Round ${r + 1}`, title: round.name, body: round.intro });
    await say('sam', round.intro, 'screen');
    await sleep(400);

    for (let p = 0; p < round.prompts.length; p++) {
      const prompt = round.prompts[p];
      S.setScreen({ kicker: round.name, title: `Prompt ${p + 1}`, body: prompt });
      await say('sam', prompt, 'sam');
      S.setShot('players');

      const done = new Set();
      for (let slot = 0; slot < 2; slot++) {
        const bits = await bitsFor[r];
        const avail = rivals.filter((i) => !done.has(i) && bits.some((b) => b.prompt === p && b.player === i));
        const rival = avail.length ? avail[Math.floor(Math.random() * avail.length)] : null;
        const playerDone = done.has(me);
        const delay = playerDone ? rand(1200, 2600) : slot === 0 ? rand(6000, 10000) : rand(4500, 7500);
        const winner = await openBuzz(slot === 0 ? 13000 : 10000, { idx: rival, delay, playerDone });

        if (winner == null) {
          if (slot === 0) await say('sam', NOBODY[Math.floor(Math.random() * NOBODY.length)]);
          break;
        }
        if (winner === 'me') {
          done.add(me);
          S.setActivePodium(me);
          S.setShot(CAST[me].id);
          const text = await respond(prompt);
          await say(CAST[me].id, text || '…', CAST[me].id);
          $('caption').classList.remove('hidden');
          $('cap-name').textContent = SAM.name;
          $('cap-text').textContent = '…';
          S.setShot('sam');
          let verdict;
          try { verdict = await retry(() => judge(ep, r, prompt, CAST, me, text, revealed, log), 2); }
          catch { verdict = { reaction: 'I have no notes. Here are some points.', points: 2, ruleHit: false }; }
          await say('sam', verdict.reaction);
          award(me, verdict.points, verdict.ruleHit);
          await say('sam', ptsLine(CAST[me].short, verdict.points), null);
          log.push(`${CAST[me].short}: ${text}`);
        } else {
          const bit = bits.find((b) => b.prompt === p && b.player === winner);
          done.add(winner);
          play('buzz');
          S.buzz(winner, CAST[winner].id);
          S.setActivePodium(winner);
          await sleep(500);
          await say(CAST[winner].id, bit.text);
          await say('sam', bit.reaction);
          award(winner, bit.points, bit.ruleHit);
          await say('sam', ptsLine(CAST[winner].short, bit.points), null);
          log.push(`${CAST[winner].short}: ${bit.text}`);
        }
        S.setActivePodium(null);
      }
    }

    if (r === 1) {
      fetchBits(2, true);
      await theTwist(ep);
      revealed = true;
    }
  }

  await finale(ep);
}

function ptsLine(name, pts) {
  if (pts === 0) return `${name}, zero points.`;
  if (pts < 0) return `${name}, minus ${-pts}.`;
  if (pts === 1) return `One point to ${name}.`;
  return `${pts} points to ${name}.`;
}

async function theTwist(ep) {
  play('sting', 0.9);
  S.twistFx();
  S.setShot('twist');
  S.setScreen({ mode: 'twist', kicker: '⚠ the game has changed ⚠', title: 'GAME CHANGER', body: '' });
  $('round-tag').textContent = 'GAME CHANGER';
  await sleep(2600);
  S.setScreen({ mode: 'twist', kicker: 'The real game', title: 'GAME CHANGER', body: ep.secretRule });
  await say('sam', ep.twistReveal);
  for (let i = 0; i < 3; i++) {
    const bonus = hits[i] * 3;
    S.setActivePodium(i);
    if (bonus) {
      award(i, bonus, false);
      await say('sam', `${CAST[i].short}, you did it ${hits[i] === 1 ? 'once' : hits[i] + ' times'}. That's ${bonus} bonus points.`, CAST[i].id);
    } else {
      await say('sam', `${CAST[i].short}, you never did it. Not once.`, CAST[i].id);
    }
  }
  S.setActivePodium(null);
  hits = [0, 0, 0];
  await say('sam', 'Final round. Now you know the rule. It counts double. Good luck.', 'sam');
}

async function finale(ep) {
  // rule hits in the final round are worth double
  hits.forEach((h, i) => h && award(i, h * 6, false));
  const best = Math.max(...scores);
  const winners = CAST.filter((_, i) => scores[i] === best);
  const names = winners.map((w) => w.short).join(' and ');
  S.setScreen({ mode: null, kicker: 'Tonight\'s winner', title: names, body: `Prize: ${ep.prize}` });
  S.setShot('wide');
  play('fanfare', 0.8);
  S.burstConfetti();
  await sleep(800);
  await say('sam', `And the winner of ${ep.title} is ${names}, with ${best} points. You win ${ep.prize}.`, 'screen');
  await say('sam', `I've been Sam Reich. This has been Game Changer. Goodnight.`, 'sam');
  S.setShot('wide');
  $('caption').classList.add('hidden');

  $('end-title').textContent = winners.some((w) => w === CAST[me]) ? 'You won!' : `${names} wins`;
  $('end-scores').innerHTML = CAST.map((c, i) =>
    `<div class="score-chip" style="--c:${c.color}">${c.short}${i === me ? ' (you)' : ''}<b>${scores[i]}</b></div>`).join('');
  $('end').classList.remove('hidden');
}
$('again').onclick = () => playEpisode();

/* ---------- boot ---------- */
$('cards').innerHTML = CAST.map((c, i) =>
  `<button class="card" data-i="${i}" style="--c:${c.color}"><div class="face">${c.face}</div><b>${c.short}</b><small>${c.blurb}</small></button>`).join('');
$('cards').addEventListener('click', (e) => {
  const card = e.target.closest('.card');
  if (!card) return;
  me = +card.dataset.i;
  $('select').classList.add('hidden');
  Object.values(sfx).forEach((a) => a.load());
  playEpisode();
});

S.initScene($('stage'), CAST, SAM).then(() => S.setShot('wide'));
