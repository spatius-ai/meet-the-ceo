// The brain of Meet the CEO: a personal welcome from a made-up CEO for every new hire, then questions.
// Plain functions with no network, no avatar and no web server, so you can copy this file
// into any app or agent (your own backend, a LiveKit or Agora agent) and keep the same behaviour.
//
//   sectionsOf(text)                      -> [{ id, title, text }]   the company story cut into sections, in code
//   teamSection(sections, team)           -> the section about this person's team, found in code (or null)
//   personOf(p) / peopleOf(text)          -> a new hire { name, role, team, start }, or a list of them from lines of text
//   startText(start, lang)                -> "Monday 1 December", written out in code for the CEO to say
//   welcomeMessages(ceo, story, person)   -> messages for the personal welcome (JSON)
//   readWelcome(raw, story, person)       -> { say, link, quote, title }   checked in code: name, facts, numbers
//   answerMessages(ceo, story, ask)       -> messages for one answer, only from the story, with the exact words used
//   readAnswer(raw, story)                -> { say, found, section, title, quote }   the quote is checked in code
//   hearingHint(lang), voiceStyle(lang)
//
// A "story" is { company, text, sections, lang }. A "ceo" is { name, title }.

export const LANGS = { en: 'English', es: 'Spanish', zh: 'Chinese (Simplified)', ar: 'Arabic', fr: 'French' };
export const CEO = { name: 'Amara', title: 'CEO' };
const LOCALE = { en: 'en-GB', es: 'es-ES', zh: 'zh-CN', ar: 'ar', fr: 'fr-FR' };

export const SAMPLE_COMPANY = 'Tallyfield';
export const SAMPLE_STORY = `## Why we started
Tallyfield is a made-up company for this demo. Amara started it in 2019 after ten years as an accountant at a small firm, where she spent her evenings copying numbers between spreadsheets. She wanted the people at small accounting firms to spend their time on their clients, not on typing.

## Our mission
Give small accounting firms their evenings back.

## Our values
Customers first: we listen to the accountants who use Tallyfield every day, and we fix what slows them down.
Say it plainly: we write and speak simply, to customers and to each other.
Leave it better: every person improves one small thing each week.

## This year
Today about 2,000 accounting firms use Tallyfield. This year our goal is to make month-end closing take one day instead of five, for every customer.

## What each team does
### Customer success
Customer success helps each firm get started and stay happy. They train new customers, check in every month, and bring what customers say back to the rest of us.
### Product
Product decides what we build next. They talk to customers every week and turn their problems into clear plans.
### Engineering
Engineering builds and runs Tallyfield. They keep it fast, safe and working, every day of the month-end rush.
### Sales
Sales finds the firms that need Tallyfield most, and helps them see how much time they will save.
### People and operations
People and operations hires, welcomes and looks after everyone at Tallyfield, and keeps the office and our tools running.`;

// New hires, one per line: name, role, team, start date (YYYY-MM-DD)
export const SAMPLE_PEOPLE = `Sam Rivera, Customer success manager, Customer success, 2026-12-01
Priya Nair, Software engineer, Engineering, 2026-12-01
Leo Martin, Account executive, Sales, 2026-12-08`;

const HINTS = {
  en: 'A new employee asks the CEO about the company: its story, mission, values and goals.',
  es: 'Una persona nueva pregunta a la CEO por la empresa: su historia, misión, valores y objetivos.',
  zh: '新员工向 CEO 询问公司：创业故事、使命、价值观和目标。',
  ar: 'موظف جديد يسأل المديرة التنفيذية عن الشركة: قصتها ورسالتها وقيمها وأهدافها.',
  fr: "Une nouvelle recrue pose des questions à la PDG sur l'entreprise : son histoire, sa mission, ses valeurs et ses objectifs.",
};
export const hearingHint = (lang) => HINTS[lang] || HINTS.en;
export const voiceStyle = (lang) => `Speak ${LANGS[lang] || 'English'} as a warm, confident founder and CEO welcoming a new colleague personally: unhurried, sincere and upbeat, with short pauses. Never like an assistant or an advert.`;

const L = (lang) => LANGS[lang] || 'English';
const parse = (raw) => { try { return typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {}; } catch { return {}; } };
const norm = (t) => String(t || '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// ---------- the story, cut into sections in code (sub-headings such as "### Sales" become their own sections) ----------
const HEADING = /^(#{1,4}\s+\S.*|\d+(\.\d+)*[.)]?\s+\S.{0,70}|[A-Z][^.!?:]{2,60}:?)$/;
export function sectionsOf(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const out = []; let cur = null; let parent = '';
  const isHeading = (l, next) => {
    const t = l.trim();
    if (!t || t.length > 80) return false;
    if (/^#{1,4}\s/.test(t)) return true;
    return HEADING.test(t) && !/[.!?;,]$/.test(t) && !!(next || '').trim() && (next || '').trim().length > t.length;
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (isHeading(l, lines[i + 1])) {
      const title = l.replace(/^#{1,4}\s+/, '').trim();
      if (/^#{1,2}\s/.test(l.trim()) || !/^#{3,4}\s/.test(l.trim())) parent = title;
      cur = { title, parent: /^#{3,4}\s/.test(l.trim()) ? parent : '', text: '' }; out.push(cur); continue;
    }
    if (!l.trim()) { if (cur) cur.text += '\n'; continue; }
    if (!cur) { cur = { title: 'Introduction', parent: '', text: '' }; out.push(cur); }
    cur.text += `${l.trim()}\n`;
  }
  return out.map((s) => ({ title: s.title.slice(0, 90), parent: s.parent, text: s.text.trim() })).filter((s) => s.text).slice(0, 60)
    .map((s, i) => ({ id: `s${i + 1}`, ...s, text: s.text.slice(0, 4000) }));
}
export function pickSections(sections, question, max = 12000) {
  const total = sections.reduce((n, s) => n + s.title.length + s.text.length, 0);
  if (total <= max) return sections;
  const words = new Set(norm(question).split(' ').filter((w) => w.length > 2).map((w) => w.replace(/s$/, '')));
  const score = (s) => { const t = norm(`${s.title} ${s.title} ${s.text}`).split(' ').map((w) => w.replace(/s$/, '')); return t.reduce((n, w) => n + (words.has(w) ? 1 : 0), 0) / Math.sqrt(t.length + 20); };
  const out = []; let size = 0;
  for (const s of [...sections].sort((a, b) => score(b) - score(a))) { if (size + s.text.length > max) break; out.push(s); size += s.text.length + s.title.length; }
  return out.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
}
/** The section about a team: the title that shares the most words with the team's name ("Sales", "People and operations"). */
export function teamSection(sections, team) {
  const want = norm(team).split(' ').filter((w) => w.length > 2 && w !== 'team' && w !== 'and');
  if (!want.length) return null;
  let best = null, bestScore = 0;
  for (const s of sections) {
    const have = norm(s.title).split(' ');
    const score = want.filter((w) => have.some((h) => h === w || h.replace(/s$/, '') === w.replace(/s$/, ''))).length / want.length;
    if (score > bestScore) { best = s; bestScore = score; }
  }
  return bestScore >= 0.5 ? best : null;
}

// ---------- new hires ----------
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, max);
export function personOf(p = {}) {
  const start = /^\d{4}-\d{2}-\d{2}$/.test(String(p.start || '')) ? String(p.start) : '';
  return { name: clean(p.name, 60), role: clean(p.role, 80), team: clean(p.team, 60), start };
}
/** A list of new hires: one per line, "name, role, team, start date" (commas or | between them). */
export const peopleOf = (text) => String(text || '').split('\n').map((l) => l.split(/\s*[|,]\s*/)).filter((p) => p[0] && p[0].trim())
  .slice(0, 50).map(([name, role, team, start]) => personOf({ name, role, team, start })).filter((p) => p.name);
/** The start date, written out in the language, in code: "Monday 1 December". */
export function startText(start, lang = 'en') {
  if (!start) return '';
  const d = new Date(`${start}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  try { return new Intl.DateTimeFormat(LOCALE[lang] || 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(d); } catch { return start; }
}

// ---------- the personal welcome ----------
export function welcomeMessages(ceo, story, person) {
  const team = teamSection(story.sections, person.team);
  const when = startText(person.start, story.lang);
  return [{ role: 'system', content: `You are ${ceo.name}, the ${ceo.title} of ${story.company || 'this company'}. Write the personal welcome you will say out loud, in ${L(story.lang)}, to a new hire on their first day: about 110 to 160 words, warm, sincere and plain, in your own voice as a founder; never like an advert.
THE NEW HIRE: ${person.name}${person.role ? `, joining as ${person.role}` : ''}${person.team ? ` in the ${person.team} team` : ''}${when ? `, starting on ${when}` : ''}.
Use ONLY facts from THE COMPANY STORY below. Never add numbers, names, dates, customers, products, feelings or events that are not in it.
Never assume the new hire's gender from their name: use gender-neutral wording (in Spanish, French and Arabic, choose phrasings that do not mark gender).
In this order:
1. Greet ${person.name} by name, and say you are glad they are here${when ? ` (mention ${when})` : ''}.
2. One short true thing about why the company exists (from the story).
3. The mission, in your own words.
4. ONE sentence that links their own work${person.team ? ` in ${person.team}` : ''} to the mission. ${team ? `Use what THEIR TEAM'S SECTION says the team does.` : 'The story says nothing about their team, so link their role to the mission in general terms, without saying what the team does.'}
5. One value from the story that will matter in their first weeks, and a warm close that invites them to ask you anything.

Return JSON only:
{"say": the whole welcome,
 "link": the ONE sentence from "say" that links their work to the mission, copied exactly,
 "quote": the exact words from the story (at most 25 words) that the link is based on, copied character for character}
${team ? `\nTHEIR TEAM'S SECTION (${team.title}):\n${team.text}\n` : ''}
THE COMPANY STORY:
${story.sections.map((s) => `[${s.id}] ${s.parent ? `${s.parent} > ` : ''}${s.title}\n${s.text}`).join('\n\n')}` }];
}
/** True when the quoted words really are in the text (allowing small slips in copying). */
function inText(quote, text) {
  const q = norm(quote), all = norm(text);
  if (!q) return false;
  if (all.includes(q)) return true;
  const words = q.split(' ').filter((w) => w.length > 2);
  const have = new Set(all.split(' '));
  return words.length >= 3 && words.filter((w) => have.has(w)).length / words.length >= 0.85;
}
const GREET = { en: (n) => `Welcome, ${n}!`, es: (n) => `¡Te damos la bienvenida, ${n}!`, zh: (n) => `欢迎你，${n}！`, ar: (n) => `أهلًا وسهلًا يا ${n}!`, fr: (n) => `Bienvenue, ${n} !` };
const sentencesOf = (t) => String(t || '').match(/[^.!?。！？]+[.!?。！？]*["”»]?\s*/g) || [];
/**
 * The welcome, checked in code: any sentence with a number that is not in the story or the start date is dropped;
 * the person's name must be in it; the link sentence and its quote are kept only if they are really there.
 */
export function readWelcome(raw, story, person) {
  const o = parse(raw);
  const known = new Set([...(story.text.match(/\d+(?:[.,]\d+)*/g) || []), ...(startText(person.start, story.lang).match(/\d+/g) || []), ...(person.start.match(/\d+/g) || [])].map((x) => x.replace(/[.,]/g, '')));
  const fine = (s) => (s.match(/\d+(?:[.,]\d+)*/g) || []).every((x) => known.has(x.replace(/[.,]/g, '')));
  let say = sentencesOf(o.say).filter(fine).join('').trim().slice(0, 1400);
  const first = norm(person.name).split(' ')[0];
  if (first && !norm(say).includes(first)) say = `${(GREET[story.lang] || GREET.en)(person.name.split(' ')[0])} ${say}`;
  let link = String(o.link || '').trim();
  if (!link || !norm(say).includes(norm(link)) || !fine(link)) link = '';
  const quote = String(o.quote || '').trim().slice(0, 300);
  const section = quote ? story.sections.find((s) => inText(quote, s.text)) : null;
  return { say: say || (GREET[story.lang] || GREET.en)(person.name), link: link.slice(0, 400), quote: section ? quote : '', title: section ? section.title : '', text: section ? section.text : '' };
}

// ---------- questions after the welcome ----------
export function answerMessages(ceo, story, ask) {
  return [{ role: 'system', content: `You are ${ceo.name}, the ${ceo.title} of ${story.company || 'this company'}, talking with a new hire${ask.person?.name ? ` called ${ask.person.name}` : ''} on their first day. Speak ${L(story.lang)}, out loud, warmly and plainly, as yourself, in 1 to 3 short sentences.
Answer ONLY from THE COMPANY STORY below. Never invent numbers, plans, names, dates or opinions that are not in it.
If the story does not answer the exact question, say honestly that you won't make something up, and offer to talk about it in person. Never mention "the story", "the document" or "information": speak as yourself.
Never assume the new hire's gender: use gender-neutral wording.
Return JSON only:
{"found": true if the story answers the exact question, else false,
 "section": the id of the section the answer comes from (like "s4"), or "",
 "quote": the exact words from that section that answer it, copied character for character (at most 30 words), or "",
 "say": your spoken answer in ${L(story.lang)}}

THE COMPANY STORY:
${ask.sections.map((s) => `[${s.id}] ${s.parent ? `${s.parent} > ` : ''}${s.title}\n${s.text}`).join('\n\n')}` },
  ...(ask.history || []).slice(-6).map((h) => ({ role: h.who === 'ceo' ? 'assistant' : 'user', content: String(h.text || '').slice(0, 600) })),
  { role: 'user', content: String(ask.question || '').slice(0, 600) }];
}
const UNSURE = {
  en: "I'd rather not guess about that. Let's talk about it in person this week.", es: 'Prefiero no adivinar sobre eso. Hablemos de ello en persona esta semana.',
  zh: '这个我不想乱猜。我们这周当面聊聊吧。', ar: 'أفضّل ألا أخمّن في ذلك. لنتحدث عنه وجهًا لوجه هذا الأسبوع.', fr: "Je préfère ne pas deviner. Parlons-en de vive voix cette semaine.",
};
/** The answer, checked in code: if it claims the story says so, the quoted words must really be in it. */
export function readAnswer(raw, story) {
  const o = parse(raw);
  const quote = String(o.quote || '').trim().slice(0, 300);
  let section = story.sections.find((s) => s.id === o.section);
  if (quote && !(section && inText(quote, section.text))) section = story.sections.find((s) => inText(quote, s.text));
  const checked = !!(quote && section);
  const found = o.found === true && checked;
  const say = o.found === true && !checked ? UNSURE[story.lang] || UNSURE.en : String(o.say || '').trim().slice(0, 600) || '…';
  return { say, found, section: found ? section.id : '', title: found ? section.title : '', text: found ? section.text : '', quote: found ? quote : '' };
}
