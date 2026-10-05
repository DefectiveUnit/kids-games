/* Shared settings for every game: dark mode, English / Chinese text, and talking on/off.
 *
 * Text is passed around as messages: { en: 'How many cows?', zh: '有[yǒu|there are] 几头[jǐ tóu|how many] 牛[niú|cows]？' }
 * Each Chinese word is written  汉字[pinyin|english gloss]  and separated by spaces (spaces are not shown).
 * KG.t(msg) gives HTML (ruby pinyin + hover English), KG.say(msg) speaks it if talking is on.
 */
(function () {
  const KEY = 'kidsGames.settings';
  const settings = { theme: 'light', lang: 'en', voice: false };
  try { Object.assign(settings, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) { /* private mode etc. */ }
  // links can set things too, e.g. index.html?lang=zh&theme=dark
  const params = new URLSearchParams(location.search);
  if (['en', 'zh'].includes(params.get('lang'))) settings.lang = params.get('lang');
  if (['light', 'dark'].includes(params.get('theme'))) settings.theme = params.get('theme');

  const root = document.documentElement;
  function applyRoot() {
    root.dataset.theme = settings.theme;
    root.dataset.lang = settings.lang;
    root.lang = settings.lang === 'zh' ? 'zh-CN' : 'en';
  }
  applyRoot();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
  }

  /* ---------- messages ---------- */
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const TOKEN = /([^\s\[\]|，。！？、：；…（）]+)\[([^|\]]+)\|([^\]]*)\]|(\S)/gu;

  function tokens(zh) {
    const out = [];
    for (const m of zh.matchAll(TOKEN)) out.push(m[1] ? { h: m[1], p: m[2], g: m[3] } : { c: m[4] });
    return out;
  }
  const isMsg = m => m && typeof m === 'object' && 'en' in m;
  const M = (en, zh) => ({ en, zh });
  const zhOn = m => settings.lang === 'zh' && isMsg(m) && m.zh;

  // HTML for a message in the current language
  function t(m) {
    if (m == null) return '';
    if (!isMsg(m)) return esc(m);
    if (!zhOn(m)) return esc(m.en);
    return `<span class="zh-s" data-en="${esc(m.en)}">` + tokens(m.zh).map(k => k.h
      ? `<ruby class="zh-w" data-h="${esc(k.h)}" data-py="${esc(k.p)}" data-en="${esc(k.g)}">${esc(k.h)}<rt>${esc(k.p)}</rt></ruby>`
      : esc(k.c)).join('') + '</span>';
  }
  // plain text (characters only in Chinese)
  function plain(m) {
    if (!isMsg(m)) return String(m ?? '');
    return zhOn(m) ? tokens(m.zh).map(k => k.h || k.c).join('') : m.en;
  }
  // characters plus pinyin, for places that can't hold HTML (like <option>)
  function both(m) {
    if (!zhOn(m)) return plain(m);
    const tk = tokens(m.zh);
    return tk.map(k => k.h || k.c).join('') + ' (' + tk.filter(k => k.h).map(k => k.p).join(' ') + ')';
  }
  // pieces for SVG labels: { text, pinyin }
  function parts(m) {
    if (!zhOn(m)) return { text: plain(m), pinyin: '' };
    const tk = tokens(m.zh);
    return { text: tk.map(k => k.h || k.c).join(''), pinyin: tk.filter(k => k.h).map(k => k.p).join(' ') };
  }
  // fill every [data-t="key"] element from a table of messages
  function fill(table, scope = document) {
    scope.querySelectorAll('[data-t]').forEach(el => {
      const m = table[el.dataset.t];
      if (m) el.innerHTML = t(m);
    });
  }

  /* ---------- numbers ---------- */
  const NUM_EN = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
  const NUM_ZH = [['零', 'líng'], ['一', 'yī'], ['二', 'èr'], ['三', 'sān'], ['四', 'sì'], ['五', 'wǔ'],
    ['六', 'liù'], ['七', 'qī'], ['八', 'bā'], ['九', 'jiǔ'], ['十', 'shí']];
  function zhNum(n) {
    if (n <= 10) return NUM_ZH[n];
    if (n < 20) return ['十' + NUM_ZH[n - 10][0], 'shí ' + NUM_ZH[n - 10][1]];
    return ['二十', 'èr shí'];
  }
  const numWord = n => NUM_EN[n] || String(n);
  // "five" / 五 — for counting out loud and for sums
  const num = n => { const [h, p] = zhNum(n); return M(numWord(n), `${h}[${p}|${numWord(n)}]`); };
  // measure words: 一个, 两头, 三只 …
  const MW = {
    ge:  { h: '个', p: 'gè', tone4: true },
    tou: { h: '头', p: 'tóu' },
    zhi: { h: '只', p: 'zhī' },
    gen: { h: '根', p: 'gēn' },
    ke:  { h: '颗', p: 'kē' },
  };
  // zh token for "n <measure word>", e.g. 两头[liǎng tóu|two]
  function count(n, mw) {
    let [h, p] = zhNum(n);
    if (n === 2) { h = '两'; p = 'liǎng'; }
    if (n === 1) p = mw.tone4 ? 'yí' : 'yì';
    return `${h}${mw.h}[${p} ${mw.p}|${numWord(n)}]`;
  }
  const howMany = mw => `几${mw.h}[jǐ ${mw.p}|how many]`;

  /* ---------- speech ---------- */
  function say(m, opts = {}) {
    if (!('speechSynthesis' in window)) return;
    if (!settings.voice && !opts.force) return;
    const zh = !opts.english && zhOn(m);
    const text = zh ? plain(m) : (isMsg(m) ? m.en : String(m));
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = opts.rate ?? .85;
    u.pitch = opts.pitch ?? 1.1;
    if (zh) {
      u.lang = 'zh-CN';
      const v = speechSynthesis.getVoices().find(v => /^zh/i.test(v.lang));
      if (v) u.voice = v;
    }
    speechSynthesis.speak(u);
  }

  /* ---------- shared phrases ---------- */
  const common = {
    games:      M('← Games', '← 游戏[yóu xì|games]'),
    playAgain:  M('Play again', '再[zài|again] 玩[wán|play] 一次[yí cì|one time]'),
    tryAgain:   M('Try again!', '再[zài|again] 试[shì|try] 一次[yí cì|one time]！'),
    together:   M("Let's count together!", '我们[wǒ men|we] 一起[yì qǐ|together] 数[shǔ|count] 吧[ba|let\'s]！'),
    play:       M('🎯 Play', '🎯 玩[wán|play]'),
    learn:      M('📖 Learn', '📖 学习[xué xí|learn]'),
    canYouFind: M('Can you find…', '你[nǐ|you] 能[néng|can] 找到[zhǎo dào|find]…'),
    thatsA:     name => M(`That's ${name.en}`, `这是[zhè shì|this is] ${name.zh}`),
    praise: [
      M('Great job!',  '真[zhēn|really] 棒[bàng|great]！'),
      M('You got it!', '答[dá|answer] 对了[duì le|correct]！'),
      M('Awesome!',    '太[tài|so] 厉害了[lì hai le|awesome]！'),
      M('Super!',      '超级[chāo jí|super] 棒[bàng|great]！'),
      M('Brilliant!',  '好[hǎo|very] 极了[jí le|extremely]！'),
      M('Well done!',  '做得[zuò de|done] 好[hǎo|well]！'),
      M('Fantastic!',  '太[tài|so] 好了[hǎo le|good]！'),
    ],
  };
  const pick = list => list[Math.floor(Math.random() * list.length)];
  // join messages: KG.join(a, b, …) — strings may be plain glue for both languages
  function join(...parts) {
    return M(parts.map(p => isMsg(p) ? p.en : p).join(' ').replace(/\s+([!?.,])/g, '$1'),
             parts.map(p => isMsg(p) ? p.zh : p).join(' '));
  }

  /* ---------- settings buttons ---------- */
  function buildWidget() {
    const w = document.createElement('div');
    w.className = 'kg-settings';
    w.innerHTML = '<button data-k="theme"></button><button data-k="lang"></button><button data-k="voice"></button>';
    const label = () => {
      const dark = settings.theme === 'dark', zh = settings.lang === 'zh';
      const b = k => w.querySelector(`[data-k="${k}"]`);
      b('theme').textContent = dark ? '☀️' : '🌙';
      b('theme').title = dark ? 'Light mode' : 'Dark mode';
      b('lang').textContent = zh ? 'EN' : '中文';
      b('lang').title = zh ? 'Switch to English' : '切换到中文 (Chinese)';
      b('voice').textContent = settings.voice ? '🔊' : '🔇';
      b('voice').title = settings.voice ? 'Talking is on' : 'Talking is off';
    };
    w.addEventListener('click', e => {
      const k = e.target.closest('button')?.dataset.k;
      if (!k) return;
      if (k === 'theme') settings.theme = settings.theme === 'dark' ? 'light' : 'dark';
      if (k === 'voice') settings.voice = !settings.voice;
      if (k === 'lang') settings.lang = settings.lang === 'zh' ? 'en' : 'zh';
      save();
      if (k === 'lang') { location.reload(); return; } // games build their text on load
      applyRoot();
      label();
      if (k === 'voice') {
        if (settings.voice) say(M('Talking is on!', '说话[shuō huà|talking] 打开了[dǎ kāi le|is on]！'));
        else if ('speechSynthesis' in window) speechSynthesis.cancel();
      }
    });
    label();
    document.body.appendChild(w);
  }

  /* ---------- hover English for Chinese text ---------- */
  let tip, pressTimer, hideTimer;
  function showTip(target) {
    const s = target.closest?.('.zh-s');
    if (!s) return hideTip();
    const w = target.closest('.zh-w');
    tip ||= Object.assign(document.createElement('div'), { className: 'kg-tip' });
    if (!tip.isConnected) document.body.appendChild(tip);
    tip.replaceChildren();
    if (w) {
      const word = document.createElement('div');
      word.className = 'kg-tip-word';
      const b = document.createElement('b');
      b.textContent = `${w.dataset.h} ${w.dataset.py}`;
      word.append(b, ` = ${w.dataset.en}`);
      tip.appendChild(word);
    }
    const sent = document.createElement('div');
    sent.className = 'kg-tip-sent';
    sent.textContent = s.dataset.en;
    tip.appendChild(sent);
    tip.classList.add('show');

    const r = (w || s).getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = r.left + r.width / 2 - tw / 2;
    x = Math.max(8, Math.min(x, innerWidth - tw - 8));
    let y = r.top - th - 8;
    if (y < 8) y = r.bottom + 8;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }
  function hideTip() { tip?.classList.remove('show'); }

  document.addEventListener('mouseover', e => {
    if (settings.lang !== 'zh') return;
    if (e.target.closest?.('.zh-s')) showTip(e.target); else hideTip();
  });
  // touch: press and hold a word to see the English
  document.addEventListener('pointerdown', e => {
    if (settings.lang !== 'zh' || e.pointerType === 'mouse') return;
    clearTimeout(pressTimer);
    const target = e.target;
    pressTimer = setTimeout(() => {
      showTip(target);
      clearTimeout(hideTimer);
      hideTimer = setTimeout(hideTip, 2500);
    }, 450);
  });
  ['pointerup', 'pointercancel'].forEach(ev => document.addEventListener(ev, () => clearTimeout(pressTimer)));
  addEventListener('scroll', hideTip, { passive: true });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildWidget);
  else buildWidget();

  window.KG = {
    get lang() { return settings.lang; },
    get voice() { return settings.voice; },
    M, t, plain, both, parts, fill, say, join, pick,
    num, numWord, count, howMany, MW, common,
  };
})();
