// Meet the CEO: a made-up CEO avatar gives each new hire a personal welcome, links their team to the mission,
// and answers questions from your company story. Each new hire can get their own welcome link.
import './ceo.css';
import { canDraw, initSdk, loadSeat, type Seat } from './seat';

type Lang = 'en' | 'es' | 'zh' | 'ar' | 'fr';
type Person = { name: string; role: string; team: string; start: string };
type Welcome = { say: string; link: string; quote: string; title: string; text: string; error?: string };
type Answer = { say: string; found: boolean; section: string; title: string; text: string; quote: string; error?: string };
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const $$ = <T extends HTMLElement = HTMLElement>(s: string) => [...document.querySelectorAll(s)] as T[];
const esc = (t: string) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const track = (name: string, props: Record<string, unknown> = {}) => { if (parent !== window) parent.postMessage({ type: 'spatius-event', demo: 'meet-the-ceo', name, props }, '*'); };
const SESSION_SECONDS = 180;

const TRIES: Record<Lang, string[]> = {
  en: ['Why did you start the company?', 'What is our goal this year?', 'What matters most here?'],
  es: ['¿Por qué empezaste la empresa?', '¿Cuál es nuestro objetivo este año?', '¿Qué es lo más importante aquí?'],
  zh: ['你为什么创办这家公司？', '我们今年的目标是什么？', '这里最重要的是什么？'],
  ar: ['لماذا أسستِ الشركة؟', 'ما هدفنا هذا العام؟', 'ما الأهم هنا؟'],
  fr: ["Pourquoi avez-vous créé l'entreprise ?", 'Quel est notre objectif cette année ?', "Qu'est-ce qui compte le plus ici ?"],
};

const st = {
  lang: 'en' as Lang, company: '', story: '', own: false, people: [] as Person[],
  history: [] as { who: 'you' | 'ceo'; text: string }[], busy: false, live: false, ends: 0, sessionSeconds: SESSION_SECONDS,
};
const stage = $('#stage'), stateEl = $('#state');
let cfg: { appId: string; region: string; ceo: { name: string; title: string; avatarId: string }; company: string; story: string; people: string; sampleStory: string; samplePeople: string; teams: string[]; choices?: { lang: Lang }; sessionSeconds?: number } | null = null;
let seat: Seat | null = null, seatLoading: Promise<Seat | null> | null = null, drawable = true, clockT = 0, plainCtx: AudioContext | null = null;

// ---------- the avatar: seated behind the desk ----------
const FIT = { x: 0, y: 0.1, scale: 0.72 };
function fitAvatar(view: any, tries = 40) { try { view.avatarTransform = FIT; } catch { if (tries > 0) setTimeout(() => fitAvatar(view, tries - 1), 150); } }
function getSeat(): Promise<Seat | null> {
  if (!cfg || !drawable) return Promise.resolve(null);
  return (seatLoading ??= (async () => {
    $('#load').textContent = `${cfg!.ceo.name} is joining…`; $('#load').classList.add('on');
    try {
      const r = await fetch('api/session', { method: 'POST' }); const s = await r.json();
      if (!r.ok) throw new Error(s.error || 'No session.');
      await initSdk(s);
      const { start, view } = await loadSeat($('#avatar'), cfg!.ceo.avatarId, (f) => ($('#load').textContent = `${cfg!.ceo.name} is joining… ${Math.round(f * 100)}%`));
      (window as any).__pv = view; fitAvatar(view);
      seat = await start(); void seat.connect().catch(() => undefined);
      $('#avatarBox').classList.add('live');
      return seat;
    } catch (e) { console.warn('[ceo] voice only', e); drawable = false; return null; }
    finally { $('#load').classList.remove('on'); }
  })());
}

// ---------- the voice: PCM16 24 kHz straight from the server to the avatar ----------
async function voice(text: string) {
  const r = await fetch('api/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, lang: st.lang }) });
  if (!r.ok || !r.body) throw new Error((await r.json().catch(() => ({}))).error || 'The voice did not come through.');
  const reader = r.body.getReader(); let held = new Uint8Array(0); let ended = false;
  return async (): Promise<Int16Array | null> => {
    for (;;) {
      if (held.length >= 9600 || (ended && held.length >= 2)) { const whole = held.length - (held.length % 2); const out = new Int16Array(held.slice(0, whole).buffer); held = held.slice(whole); return out; }
      if (ended) return null;
      const { value, done } = await reader.read();
      if (done) { ended = true; continue; }
      const n = new Uint8Array(held.length + value.length); n.set(held); n.set(value, held.length); held = n;
    }
  };
}
async function playPlain(next: () => Promise<Int16Array | null>) {
  const ctx = new AudioContext({ sampleRate: 24000 }); plainCtx = ctx; let at = ctx.currentTime + 0.05;
  for (let c = await next(); c && ctx.state !== 'closed'; c = await next()) { const buf = ctx.createBuffer(1, c.length, 24000); const ch = buf.getChannelData(0); for (let i = 0; i < c.length; i++) ch[i] = c[i] / 32768; const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination); src.start(at); at += buf.duration; }
  if (ctx.state !== 'closed') await new Promise((r) => setTimeout(r, Math.max(0, (at - ctx.currentTime) * 1000)));
}
let sayRun = 0; // each new line, or hush(), ends the pieces of the one before
function hush() { sayRun++; stage.classList.remove('film'); seat?.interrupt(); if (plainCtx && plainCtx.state !== 'closed') void plainCtx.close(); plainCtx = null; }
const setState = (t: string) => { stateEl.textContent = t; };
/** Cut a long text into short spoken pieces (one or two sentences), so the subtitle never covers the face. */
function pieces(text: string, max = 150) {
  const out: string[] = [];
  for (const s of text.match(/[^.!?。！？]+[.!?。！？]*["”»]?\s*/g) || [text]) {
    const last = out[out.length - 1];
    if (last && (last + s).length <= max) out[out.length - 1] = last + s; else out.push(s);
  }
  return out.map((x) => x.trim()).filter(Boolean);
}
/** Speak piece by piece: the next piece's voice is fetched while this one plays. */
async function say(text: string) {
  if (!text) return;
  st.history.push({ who: 'ceo', text }); setState('Speaking');
  const parts = pieces(text); const run = ++sayRun;
  try {
    let next = voice(parts[0]);
    for (let i = 0; i < parts.length; i++) {
      const stream = await next;
      if (i + 1 < parts.length) next = voice(parts[i + 1]);
      showSaid(parts[i], true);
      const s = await getSeat(); if (s) await s.stream(stream).done; else await playPlain(stream);
      if (!st.live || run !== sayRun) break; // ended, or cut off by a new question
    }
  } catch (e) { console.warn(e); }
  finally { if (st.live) setState('Ask anything'); }
}
function showSaid(text: string, ceo: boolean) {
  $('#who').textContent = ceo ? `${cfg?.ceo.name || 'Amara'} · ${cfg?.ceo.title || 'CEO'}` : 'You';
  $('#said').textContent = text;
}

// ---------- the new hire ----------
const person = (): Person => ({ name: $<HTMLInputElement>('#hName').value.trim(), role: $<HTMLInputElement>('#hRole').value.trim(), team: $<HTMLInputElement>('#hTeam').value.trim(), start: $<HTMLInputElement>('#hStart').value });
/** The blanks in the letter grow with what is typed in them. */
function fitBlanks() { $$<HTMLInputElement>('.blank:not(.date)').forEach((i) => { i.style.width = `${Math.max(5, Math.ceil((i.value || i.placeholder).length * 0.84) + 1)}ch`; }); }
document.addEventListener('input', (e) => { if ((e.target as HTMLElement).classList?.contains('blank')) fitBlanks(); });
function usePerson(p: Partial<Person>) {
  $<HTMLInputElement>('#hName').value = p.name || ''; $<HTMLInputElement>('#hRole').value = p.role || '';
  $<HTMLInputElement>('#hTeam').value = p.team || ''; $<HTMLInputElement>('#hStart').value = /^\d{4}-\d{2}-\d{2}$/.test(p.start || '') ? p.start! : '';
  $$('#names button').forEach((b) => b.setAttribute('aria-pressed', String(b.textContent === p.name)));
  $('#mission').hidden = true; fitBlanks();
}
/** A list of new hires: one per line, "name, role, team, start date". */
function useList(text: string) {
  st.people = text.split('\n').map((l) => l.split(/\s*[|,]\s*/)).filter((p) => p[0]?.trim()).slice(0, 50).map(([name, role = '', team = '', start = '']) => ({ name: name.trim(), role: role.trim(), team: team.trim(), start: start.trim() }));
  const box = $('#names'); box.hidden = !st.people.length;
  box.innerHTML = st.people.map((p, k) => `<button type="button" data-k="${k}" aria-pressed="false">${esc(p.name)}</button>`).join('');
}
/** The welcome link: this page, with the new hire in the address. Nothing is stored anywhere. */
function welcomeLink(p: Person) {
  const q = new URLSearchParams({ name: p.name }); if (p.role) q.set('role', p.role); if (p.team) q.set('team', p.team); if (p.start) q.set('start', p.start); if (st.lang !== 'en') q.set('lang', st.lang);
  return `${location.origin}${location.pathname}?${q}`;
}

/** The start date for the name card, in the page's language: "Tuesday 1 December". */
const LOCALES: Record<Lang, string> = { en: 'en-GB', es: 'es-ES', zh: 'zh-CN', ar: 'ar', fr: 'fr-FR' };
function startLabel(start: string) { try { return new Intl.DateTimeFormat(LOCALES[st.lang], { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${start}T12:00:00Z`)); } catch { return start; } }

// ---------- the panel ----------
function showTries() { $('#tries').innerHTML = TRIES[st.lang].map((t) => `<button type="button" dir="auto">${esc(t)}</button>`).join(''); }
function highlight(text: string, quote: string) {
  const t = esc(text); if (!quote) return t;
  const q = esc(quote.trim().replace(/[.。]$/, ''));
  const at = t.toLowerCase().indexOf(q.toLowerCase());
  if (at >= 0) return `${t.slice(0, at)}<mark>${t.slice(at, at + q.length)}</mark>${t.slice(at + q.length)}`;
  const words = new Set(q.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
  const parts = t.split(/(?<=[.!?。])\s+/);
  let best = -1, bi = -1; parts.forEach((p, i) => { const n = p.toLowerCase().split(/\s+/).filter((w) => words.has(w)).length; if (n > best) { best = n; bi = i; } });
  return parts.map((p, i) => (i === bi && best > 1 ? `<mark>${p}</mark>` : p)).join(' ');
}
/** The conversation under the stage: your question, then Amara's answer with the words from the story it is based on. */
function bubble(cls: string, html: string) {
  const t = $('#thread'); t.querySelector('.empty')?.remove();
  t.insertAdjacentHTML('beforeend', `<div class="bub ${cls}">${html}</div>`); t.scrollTop = t.scrollHeight;
}
function answerBubble(a: Answer) {
  const src = a.found
    ? `<details class="src"><summary>From the company story · ${esc(a.title)}</summary><p dir="auto">${highlight(a.text, a.quote)}</p></details>`
    : '<span class="src no">Not in the company story: she will not make it up</span>';
  bubble('ceo', `<img src="assets/ceo/amara.webp" alt=""><div class="txt"><p dir="auto">${esc(a.say)}</p>${src}</div>`);
}

// ---------- the welcome and the questions ----------
function clock(left: number) { $('#clock').textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`; }
const body = (extra: Record<string, unknown>) => JSON.stringify({ lang: st.lang, company: st.company, story: st.story, person: person(), ...extra });
async function post<T>(path: string, extra: Record<string, unknown> = {}): Promise<T> {
  const r = await fetch(`api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body(extra) });
  const d = await r.json().catch(() => ({})); if (!r.ok || d.error) throw new Error(d.error || 'Something went wrong. Please try again.');
  return d as T;
}
function goLive() {
  if (st.live) return;
  st.live = true; stage.classList.add('oncall'); window.clearInterval(clockT);
  if (st.sessionSeconds) { st.ends = Date.now() + st.sessionSeconds * 1000; clockT = window.setInterval(() => { const left = Math.max(0, Math.round((st.ends - Date.now()) / 1000)); clock(left); if (!left) end(); }, 500); }
}
async function playWelcome() {
  if (st.busy) return;
  const p = person();
  if (!p.name) { showSaid('Add the new hire\'s name first.', false); $('#hName').focus(); return; }
  hush(); st.busy = true; st.history = []; void getSeat(); goLive();
  setState('Writing the welcome'); showSaid(`A welcome for ${p.name}…`, false);
  stage.scrollIntoView({ behavior: 'smooth', block: 'center' });
  try {
    const w = await post<Welcome>('welcome');
    if (w.link) {
      $('#missionK').textContent = `How ${p.name.split(' ')[0]}'s work fits the mission`;
      $('#missionText').textContent = w.link;
      $('#missionFrom').textContent = w.title ? `From the company story · ${w.title}` : '';
      $('#mission').hidden = false;
    }
    track('welcome', { team: !!p.team, start: !!p.start, own: st.own, lang: st.lang });
    // the welcome plays like a video message: the room widens and a name card shows; the panel comes back after
    $('#ncName').textContent = p.name;
    $('#ncMeta').textContent = [p.team || p.role, p.start ? `starts ${startLabel(p.start)}` : ''].filter(Boolean).join(' · ');
    stage.classList.add('film');
    await say(w.say);
    stage.classList.remove('film');
    $('#q').focus();
  } catch (e) { showSaid((e as Error).message, false); }
  finally { st.busy = false; if (st.live && stateEl.textContent === 'Writing the welcome') setState('Ask anything'); }
}
async function send(text: string) {
  text = text.trim(); if (!text || st.busy) return;
  hush(); st.busy = true; void getSeat(); goLive();
  showSaid(text, false); setState('Thinking'); st.history.push({ who: 'you', text });
  try {
    bubble('you', `<p dir="auto">${esc(text)}</p>`);
    const a = await post<Answer>('ask', { question: text, history: st.history.slice(-6) });
    answerBubble(a); track('ask', { found: a.found });
    await say(a.say);
  } catch (e) { showSaid((e as Error).message, false); }
  finally { st.busy = false; if (st.live && stateEl.textContent === 'Thinking') setState('Ask anything'); }
}
function end() {
  if (!st.live) return;
  st.live = false; window.clearInterval(clockT); hush(); stage.classList.remove('oncall'); setState('Ended'); clock(st.sessionSeconds || SESSION_SECONDS);
  track('session_end', { turns: st.history.length });
}
$('#start').onclick = () => void playWelcome();
$('#play').onclick = () => void playWelcome();
$('#end').onclick = () => end();
$('#copy').onclick = async () => {
  const p = person(); if (!p.name) { $('#copied').textContent = 'Add a name first.'; return; }
  const link = welcomeLink(p);
  try { await navigator.clipboard.writeText(link); $('#copied').textContent = 'Link copied'; } catch { window.prompt('Copy this welcome link:', link); }
  track('copy_link'); setTimeout(() => ($('#copied').textContent = ''), 2500);
};
$('#names').addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('button'); if (b) { usePerson(st.people[Number(b.dataset.k)]); track('pick_from_list'); } });
$('#tries').addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('button'); if (b) { track('try_chip'); void send(b.textContent || ''); } });
$('#ask').onsubmit = (e) => { e.preventDefault(); const q = $<HTMLInputElement>('#q'); const v = q.value; q.value = ''; void send(v); };

// ---------- microphone ----------
let rec: MediaRecorder | null = null;
$('#mic').onclick = async () => {
  const mic = $('#mic');
  if (rec) { rec.stop(); return; }
  if (st.busy) return;
  let stream: MediaStream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
  catch { showSaid('Allow the microphone, or type.', false); return; }
  hush(); void getSeat();
  const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
  const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined); rec = r;
  const parts: Blob[] = []; r.ondataavailable = (e) => e.data.size && parts.push(e.data);
  const ac = new AudioContext(); const an = ac.createAnalyser(); an.fftSize = 1024; ac.createMediaStreamSource(stream).connect(an);
  const buf = new Float32Array(an.fftSize); let heard = false, quiet = performance.now(); const began = performance.now();
  const tick = window.setInterval(() => {
    an.getFloatTimeDomainData(buf); const rms = Math.sqrt(buf.reduce((n, x) => n + x * x, 0) / buf.length);
    if (rms > 0.02) { heard = true; quiet = performance.now(); }
    const now = performance.now();
    if ((heard && now - quiet > 1500) || now - began > 25000 || (!heard && now - began > 7000)) r.stop();
  }, 100);
  r.onstop = async () => {
    window.clearInterval(tick); void ac.close(); stream.getTracks().forEach((t) => t.stop()); rec = null;
    mic.classList.remove('on'); mic.setAttribute('aria-pressed', 'false');
    if (!heard || !parts.length) { setState(st.live ? 'Ask anything' : 'Ready'); return; }
    setState('Listening');
    const res = await fetch('api/hear', { method: 'POST', headers: { 'Content-Type': r.mimeType || 'audio/webm', 'x-lang': st.lang }, body: new Blob(parts, { type: r.mimeType || 'audio/webm' }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.text) { showSaid(d.error || "I didn't catch that. Try again, or type it.", false); setState(st.live ? 'Ask anything' : 'Ready'); return; }
    void send(d.text);
  };
  r.start(250); mic.classList.add('on'); mic.setAttribute('aria-pressed', 'true'); setState('Listening');
};

// ---------- the story and the language ----------
function useStory(text: string) {
  st.story = text.trim().slice(0, 30000); st.own = !!st.story && st.story !== cfg?.sampleStory;
  st.company = st.own ? '' : cfg?.company || 'Tallyfield';
  $('#letterCo').textContent = st.company || 'the company';
  $('#storyName').innerHTML = st.own ? `<b>Your company story</b> · ${st.story.length.toLocaleString()} characters` : '<b>Tallyfield</b> · why we started, mission, values, teams (sample)';
  // teams from "### Team" headings, for the team field
  const teams = st.own ? [...st.story.matchAll(/^#{3,4}\s+(.+)$/gm)].map((m) => m[1].trim()) : cfg?.teams || [];
  $('#teams').innerHTML = teams.map((t) => `<option value="${esc(t)}"></option>`).join('');
  track('story', { own: st.own });
}
const toggle = (id: string, focus: string) => { const box = $(id); box.hidden = !box.hidden; if (!box.hidden) $(focus).focus(); };
$('#storyBtn').onclick = () => toggle('#storyBox', '#storyText');
$('#listBtn').onclick = () => toggle('#listBox', '#listText');
$('#storyText').addEventListener('change', () => useStory($<HTMLTextAreaElement>('#storyText').value || cfg?.sampleStory || ''));
$('#storyReset').onclick = () => { $<HTMLTextAreaElement>('#storyText').value = ''; useStory(cfg?.sampleStory || ''); };
$('#listText').addEventListener('input', () => useList($<HTMLTextAreaElement>('#listText').value));
$('#langs').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button'); if (!b || b.dataset.lang === st.lang) return;
  st.lang = b.dataset.lang as Lang; $$('#langs button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.lang === st.lang)));
  document.querySelector('.subs')!.setAttribute('dir', st.lang === 'ar' ? 'rtl' : 'ltr'); $<HTMLInputElement>('#q').dir = st.lang === 'ar' ? 'rtl' : 'auto';
  showTries(); track('lang_pick', { lang: st.lang });
});
$$<HTMLButtonElement>('.info-btn').forEach((b) => (b.onclick = () => { const box = document.getElementById(b.getAttribute('aria-controls')!)!; const open = b.getAttribute('aria-expanded') !== 'true'; b.setAttribute('aria-expanded', String(open)); box.hidden = !open; }));

// ---------- build it (only on the demo page): the download starts in the language ----------
// "Build it" at the top of the demo page: jump to the Build it section (when the demo sits inside another page, that page scrolls)
document.getElementById('goBuild')?.addEventListener('click', () => {
  const el = document.getElementById('build'); if (!el) return;
  if (parent !== window) parent.postMessage({ type: 'spatius-scroll', y: el.getBoundingClientRect().top + window.scrollY }, '*');
  else el.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('#download')?.addEventListener('click', (e) => {
  (e.currentTarget as HTMLAnchorElement).href = `api/download?${new URLSearchParams({ lang: st.lang })}`;
  track('download', { lang: st.lang });
});
$('#deploy')?.addEventListener('click', () => track('deploy_click'));
$('#github')?.addEventListener('click', () => track('github_click'));

// ---------- start: a welcome link fills in the new hire ----------
fetch('api/config').then((r) => r.json()).then(async (c) => {
  cfg = c; st.sessionSeconds = c.sessionSeconds === 0 ? 0 : Number(c.sessionSeconds) || SESSION_SECONDS;
  const q = new URLSearchParams(location.search);
  const lang = q.get('lang'); const want = (lang && /^(en|es|zh|ar|fr)$/.test(lang) ? lang : c.choices?.lang) || 'en';
  if (want !== 'en') document.querySelector<HTMLButtonElement>(`#langs [data-lang="${want}"]`)?.click();
  if (c.story) $<HTMLTextAreaElement>('#storyText').value = c.story;
  useStory(c.story || c.sampleStory);
  $<HTMLTextAreaElement>('#listText').value = c.people || c.samplePeople; useList(c.people || c.samplePeople);
  const fromLink = q.get('name');
  if (fromLink) {
    usePerson({ name: fromLink.slice(0, 60), role: (q.get('role') || '').slice(0, 80), team: (q.get('team') || '').slice(0, 60), start: q.get('start') || '' });
    const first = fromLink.split(' ')[0];
    $('#start').textContent = `Play your welcome, ${first}`; $('#play').textContent = `Play your welcome, ${first}`;
    showSaid(`${first}, Amara has a welcome for you. Press Play your welcome.`, true);
    track('opened_from_link');
  } else usePerson(st.people[0] || {});
  showTries(); clock(st.sessionSeconds || SESSION_SECONDS);
  drawable = await canDraw();
}).catch(() => { drawable = false; });
const report = () => parent !== window && parent.postMessage({ type: 'spatius-embed-height', demo: 'meet-the-ceo', height: document.documentElement.scrollHeight }, '*');
new ResizeObserver(report).observe(document.body);
