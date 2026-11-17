/* Полная проверка банка: node tools/audit.js (нужен playwright).
   Рисует каждое задание на ширине телефона (390px) и проверяет данные, вёрстку и автопроверку. */
const { chromium } = require('playwright');
const path = require('path');
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  p.on('requestfailed', r => errs.push('404: ' + r.url()));
  await p.goto(URL + '#/'); await p.waitForTimeout(300);
  // 1) статическая проверка данных
  const dataIssues = await p.evaluate(() => {
    const out = []; const B = OGE.BANK, ids = {};
    const bad = s => /undefined|NaN|\[object|null\b|\*\*|\{\{|&lt;|TODO|XXX/.test(String(s));
    const libOk = lib => { const [n, sec] = String(lib).split('#'); const L = OGE.LIBRARY[n]; if (!L) return false; return !sec || L.sections.some(s => s.id === sec); };
    B.forEach(t => {
      const e = m => out.push(t.id + ': ' + m), meta = OGE.NUMBERS[t.n];
      if (ids[t.id]) e('дубликат id'); ids[t.id] = 1;
      if (!meta) return e('нет номера ' + t.n);
      if (!t.code || !OGE.CODES[t.code]) e('код кодификатора ' + t.code + ' не найден');
      if (!t.source) e('нет источника');
      if (!t.lib || !libOk(t.lib)) e('ссылка на конспект не ведёт никуда: ' + t.lib);
      if (!String(t.text || '').trim()) e('пустой текст задания');
      if (t.textId && !OGE.TEXTS[t.textId]) e('нет текста ' + t.textId);
      if (bad(JSON.stringify(t))) e('подозрительная строка в данных');
      const a = meta.answer;
      if (a === 'digit') {
        const n = (t.options || []).length; const k = String(t.key);
        if (n < 2) e('нет вариантов ответа');
        if (!/^\d$/.test(k) || +k < 1 || +k > n) e('ключ ' + k + ' вне вариантов 1–' + n);
        if (new Set(t.options).size !== n) e('повторяются варианты');
        if (!t.why || !t.why[k]) e('нет пояснения к верному ответу');
        else for (let i = 1; i <= n; i++) if (!t.why[i]) e('нет пояснения к варианту ' + i);
      } else if (a === 'cols') {
        const n = (t.options || []).length, s = t.key && t.key.sim, d = t.key && t.key.diff;
        if (!s || !d || !s.length || !d.length) e('пустой ключ сходства/различия');
        else { [...s, ...d].forEach(x => { if (+x < 1 || +x > n) e('цифра ' + x + ' вне вариантов'); }); if (s.some(x => d.includes(x))) e('цифра и в сходстве, и в различии'); }
        if (!t.explain) e('нет пояснения');
      } else if (a === 'seq') {
        const P = t.pairs, k = String(t.key);
        if (!P || !P.left || !P.right) e('нет пар');
        else { if (k.length !== P.left.length) e('длина ключа ' + k.length + ' ≠ ' + P.left.length + ' букв'); [...k].forEach(x => { if (+x < 1 || +x > P.right.length) e('цифра ' + x + ' вне правого столбца'); }); }
        if (!t.explain) e('нет пояснения');
      } else if (a === 'word') {
        const k = Array.isArray(t.key) ? t.key : [t.key]; if (!k.length || k.some(x => !String(x).trim())) e('пустой ключ');
        if (!t.explain) e('нет пояснения');
      } else {
        if (!t.fields || !t.fields.length) e('нет полей ответа');
        if (!t.reference) e('нет эталона');
        if (!t.rubric) e('нет критериев');
      }
    });
    (OGE.VARIANTS || []).forEach(v => {
      const items = v.tasks || v.items || [];
      if (items.length !== 20) out.push('вариант ' + v.id + ': ' + items.length + ' заданий вместо 20');
      items.forEach((id, i) => { const t = B.find(x => x.id === id); if (!t) out.push('вариант ' + v.id + ': нет задания ' + id); else if (t.n !== i + 1) out.push('вариант ' + v.id + ': на месте ' + (i + 1) + ' стоит №' + t.n); });
    });
    return out;
  });
  // 2) отрисовка и автопроверка каждого задания
  const ids = await p.evaluate(() => OGE.BANK.map(t => [t.id, OGE.NUMBERS[t.n].answer]));
  const ui = [];
  for (const [id, a] of ids) {
    errs.length = 0;
    await p.goto(URL + '#/task/' + id); await p.waitForTimeout(80);
    await p.evaluate(() => document.querySelectorAll('details').forEach(d => d.open = true));
    const r = await p.evaluate(([id, a]) => {
      const out = [], t = OGE.BANK.find(x => x.id === id), box = document.querySelector('.task');
      if (!box) return ['задание не отрисовалось'];
      if (document.documentElement.scrollWidth > 392) out.push('горизонтальная прокрутка ' + document.documentElement.scrollWidth + 'px');
      box.querySelectorAll('*').forEach(el => { const R = el.getBoundingClientRect(); if (R.width && R.right > window.innerWidth + 1 && !el.closest('.tablewrap,.scrollx')) out.push('вылезает за экран: ' + el.tagName + '.' + el.className); });
      if (/undefined|NaN|\[object/.test(box.innerText)) out.push('в тексте «undefined/NaN»');
      box.querySelectorAll('img').forEach(i => { if (!i.complete || !i.naturalWidth) out.push('картинка не загрузилась ' + i.getAttribute('src')); if (!i.alt) out.push('картинка без alt'); });
      if (a === 'digit' || a === 'cols') { const n = box.querySelectorAll('.opt .onum').length; if (n !== t.options.length) out.push('пронумеровано ' + n + ' из ' + t.options.length + ' вариантов'); }
      if (a === 'seq' && box.querySelectorAll('.seqtbl input').length !== t.pairs.left.length) out.push('ячеек ответа меньше, чем букв');
      if (!box.querySelector('.minilink')) out.push('нет ссылки на конспект');
      return out;
    }, [id, a]);
    // правильный ответ → «Верно», неправильный → «Неверно» + ссылка на конспект
    if (a === 'digit' || a === 'cols' || a === 'seq' || a === 'word') {
      const res = await p.evaluate(async ([id, a]) => {
        const t = OGE.BANK.find(x => x.id === id), box = document.querySelector('.task'), out = [];
        const btn = [...box.querySelectorAll('button')].find(b => /Проверить/.test(b.textContent));
        const verdict = () => (box.querySelector('.verdict') || {}).textContent || '';
        const fill = right => {
          if (a === 'digit') { const k = +t.key, w = k === 1 ? 2 : 1; box.querySelectorAll('.opt')[(right ? k : w) - 1].click(); }
          else if (a === 'cols') { const ins = box.querySelectorAll('input.cols'); ins[0].value = ''; ins[1].value = ''; const tap = d => box.querySelectorAll('.opt')[d - 1].click();
            if (right) { t.key.sim.forEach(d => tap(+d)); t.key.diff.forEach(d => { tap(+d); tap(+d); }); } else { t.key.diff.forEach(d => tap(+d)); t.key.sim.forEach(d => { tap(+d); tap(+d); }); } }
          else if (a === 'seq') { const c = box.querySelectorAll('.seqtbl input'), k = String(t.key); c.forEach((x, i) => { x.value = right ? k[i] : String((+k[i] % t.pairs.right.length) + 1); }); }
          else { const i = box.querySelector('input.word'); i.value = right ? (Array.isArray(t.key) ? t.key[0] : t.key) : 'абракадабра'; }
        };
        fill(true); btn.click(); if (!/Верно/.test(verdict())) out.push('верный ответ не засчитан: «' + verdict() + '»');
        fill(false); btn.click(); const v = verdict(); if (!/Неверно|Почти/.test(v)) out.push('неверный ответ засчитан: «' + v + '»');
        if (!box.querySelector('.fb .liblink a')) out.push('при ошибке нет ссылки на конспект');
        if (a === 'digit' && !box.querySelector('.fb details')) out.push('при ошибке нет разбора вариантов');
        return out;
      }, [id, a]);
      r.push(...res);
    }
    r.push(...errs);
    if (r.length) ui.push(id + ': ' + [...new Set(r)].join('; '));
  }
  // 3) все страницы
  const routes = ['#/', '#/numbers', '#/variants', '#/library', '#/topics', '#/mistakes', '#/stats', '#/about', '#/glossary'];
  for (let n = 1; n <= 20; n++) routes.push('#/library/' + n, '#/n/' + n, '#/drill/' + n);
  const vids = await p.evaluate(() => (OGE.VARIANTS || []).map(v => v.id)); vids.forEach(v => routes.push('#/variant/' + v, '#/variant/' + v + '/exam'));
  const codes = await p.evaluate(() => Object.keys(OGE.CODES)); codes.forEach(c => routes.push('#/topic/' + c));
  const secs = await p.evaluate(() => Object.keys(OGE.LIBRARY).flatMap(n => OGE.LIBRARY[n].sections.map(s => '#/library/' + n + '/' + s.id))); routes.push(...secs);
  const pages = [];
  for (const rt of routes) {
    errs.length = 0; await p.goto(URL + rt); await p.waitForTimeout(80);
    await p.evaluate(async () => { document.querySelectorAll('img').forEach(i => i.loading = 'eager'); await new Promise(r => setTimeout(r, 300)); });
    const r = await p.evaluate(() => { const o = [], m = document.getElementById('app');
      if (document.documentElement.scrollWidth > 392) o.push('горизонтальная прокрутка');
      if (!m.innerText.trim() || /не найден|404/i.test(m.innerText.slice(0, 200))) o.push('пустая/не найдена');
      if (/undefined|NaN|\[object/.test(m.innerText)) o.push('undefined/NaN в тексте');
      m.querySelectorAll('a[href^="#/"]').forEach(a => { if (!a.textContent.trim() && !a.getAttribute('aria-label')) o.push('пустая ссылка ' + a.getAttribute('href')); });
      m.querySelectorAll('img').forEach(i => { if (!i.naturalWidth) o.push('картинка ' + i.getAttribute('src')); });
      return o; });
    r.push(...errs); if (r.length) pages.push(rt + ': ' + [...new Set(r)].join('; '));
  }
  console.log('Заданий: ' + ids.length + ', страниц: ' + routes.length);
  console.log('ДАННЫЕ (' + dataIssues.length + ')\n' + dataIssues.join('\n'));
  console.log('ЗАДАНИЯ (' + ui.length + ')\n' + ui.join('\n'));
  console.log('СТРАНИЦЫ (' + pages.length + ')\n' + pages.join('\n'));
  await b.close();
  process.exit(dataIssues.length + ui.length + pages.length ? 1 : 0);
})();
