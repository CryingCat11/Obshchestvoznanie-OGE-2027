/* Тренажёр ОГЭ-2027 по обществознанию — интерфейс (одностраничное приложение на hash-маршрутах). */
(function () {
  "use strict";
  var C = OGE.check;
  var $app = document.getElementById("app");
  var BYID = {};
  OGE.BANK.forEach(function (t) { BYID[t.id] = t; });
  Object.keys(OGE.TEXTS).forEach(function (k) { OGE.TEXTS[k].plain = OGE.TEXTS[k].paras.join(" "); });

  /* ---------------- Хранилище ---------------- */
  var KEY = "oge27-obsh-progress", DRAFT = "oge27-obsh-draft";
  var storageOk = true;
  function load(key, def) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : def; }
    catch (e) { storageOk = false; return def; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); }
    catch (e) { storageOk = false; showStorageWarning(); }
  }
  var P = load(KEY, null) || { v: 1, att: {}, mistakes: {}, variants: [] };
  try { localStorage.setItem("oge27-test", "1"); localStorage.removeItem("oge27-test"); } catch (e) { storageOk = false; }
  function persist() { save(KEY, P); }
  function showStorageWarning() {
    var b = document.getElementById("storage-warning");
    if (b) b.hidden = false;
  }
  if (!storageOk) showStorageWarning();

  function record(task, score, max, mode, answer) {
    (P.att[task.id] = P.att[task.id] || []).push({ t: Date.now(), s: score, m: max, mode: mode, a: answer });
    if (score < max) P.mistakes[task.id] = 1; else delete P.mistakes[task.id];
    persist();
  }
  function lastAtt(id) { var a = P.att[id]; return a && a.length ? a[a.length - 1] : null; }

  /* ---------------- Утилиты ---------------- */
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === "html") el.innerHTML = v;
      else if (k === "text") el.textContent = v;
      else if (k.indexOf("on") === 0) el.addEventListener(k.slice(2), v);
      else if (k === "class") el.className = v;
      else el.setAttribute(k, v === true ? "" : v);
    });
    (children || []).forEach(function (c) { if (c != null) el.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return el;
  }
  function pts(n) { n = Math.abs(n); var m10 = n % 10, m100 = n % 100; return (m10 === 1 && m100 !== 11) ? "балл" : (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) ? "балла" : "баллов"; }
  function tasksOf(n) { return OGE.BANK.filter(function (t) { return t.n === n; }); }
  function libHref(lib) { var p = String(lib || "").split("#"); return "#/library/" + p[0] + (p[1] ? "/" + p[1] : ""); }
  function setTitle(t) { document.title = t + " · ОГЭ-2027 · Обществознание"; }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
  var LET = ["А", "Б", "В", "Г", "Д", "Е"];

  /* Статистика по номеру: по последней попытке каждого задания */
  function numStats(n) {
    var list = tasksOf(n), done = 0, got = 0, max = 0;
    list.forEach(function (t) { var a = lastAtt(t.id); if (a) { done++; got += a.s; max += a.m; } });
    return { total: list.length, done: done, got: got, max: max, pct: max ? Math.round(100 * got / max) : null };
  }

  /* ---------------- Диаграмма (SVG) ---------------- */
  var COLORS = ["#1f4e9c", "#e07a1f", "#2e8b57", "#9b3fb5", "#c23b3b", "#5b6b7a"];
  function chart(mat) {
    var W = 640, H = 300, L = 40, B = 34, T = 14, R = 10;
    var all = []; mat.series.forEach(function (s) { all = all.concat(s.values); });
    var top = Math.max(10, Math.ceil(Math.max.apply(null, all) / 10) * 10);
    var gw = (W - L - R) / mat.groups.length, bw = Math.min(34, (gw - 30) / mat.series.length);
    var y = function (v) { return T + (H - T - B) * (1 - v / top); };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Диаграмма: результаты опроса" class="chart">';
    for (var v = 0; v <= top; v += 10) s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" class="grid"/><text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" class="ax" text-anchor="end">' + v + '</text>';
    mat.groups.forEach(function (g, gi) {
      var x0 = L + gi * gw + (gw - bw * mat.series.length) / 2;
      mat.series.forEach(function (se, si) {
        var val = se.values[gi], x = x0 + si * bw;
        s += '<rect x="' + x + '" y="' + y(val) + '" width="' + (bw - 3) + '" height="' + (y(0) - y(val)) + '" fill="' + COLORS[si % COLORS.length] + '"><title>' + se.name + ": " + val + mat.unit + '</title></rect>';
        s += '<text x="' + (x + (bw - 3) / 2) + '" y="' + (y(val) - 4) + '" class="val" text-anchor="middle">' + val + '</text>';
      });
      s += '<text x="' + (L + gi * gw + gw / 2) + '" y="' + (H - 10) + '" class="grp" text-anchor="middle">' + g + '</text>';
    });
    s += "</svg>";
    var legend = '<ul class="legend">' + mat.series.map(function (se, si) { return '<li><span class="sw" style="background:' + COLORS[si % COLORS.length] + '"></span>' + se.name + '</li>'; }).join("") + "</ul>";
    var table = '<details class="tbl"><summary>Показать данные таблицей</summary><table class="mini"><tr><th>Вариант ответа</th>' + mat.groups.map(function (g) { return "<th>" + g + "</th>"; }).join("") + "</tr>" +
      mat.series.map(function (se) { return "<tr><td>" + se.name + "</td>" + se.values.map(function (v) { return "<td>" + v + mat.unit + "</td>"; }).join("") + "</tr>"; }).join("") + "</table></details>";
    return h("figure", { class: "chartbox", html: s + legend + table });
  }

  function material(t) {
    var m = t.material; if (!m) return null;
    if (m.type === "table") {
      return h("table", { class: "mat", html: "<tr>" + m.head.map(function (x) { return "<th>" + x + "</th>"; }).join("") + "</tr>" +
        m.rows.map(function (r) { return "<tr>" + r.map(function (x) { return "<td>" + x + "</td>"; }).join("") + "</tr>"; }).join("") });
    }
    if (m.type === "image") {
      return h("figure", { class: "photo" }, [h("img", { src: m.src, alt: m.alt, loading: "lazy" }), h("figcaption", { text: m.credit })]);
    }
    if (m.type === "bars") return chart(m);
    return null;
  }

  function textBlock(textId) {
    var tx = OGE.TEXTS[textId]; if (!tx) return null;
    return h("details", { class: "textsrc", open: true }, [
      h("summary", { text: "Текст к заданиям 18–20" }),
      h("div", { class: "textbody", html: tx.paras.map(function (p) { return "<p>" + p + "</p>"; }).join("") + '<p class="author">(' + tx.author + ")</p>" }),
      h("p", { class: "src", text: "Источник: " + tx.source })
    ]);
  }

  /* ---------------- Задание: отрисовка и проверка ---------------- */
  // opts: {mode: "train"|"exam", num: номер в варианте, saved: сохранённый ответ, onChange}
  function taskView(t, opts) {
    opts = opts || {};
    var meta = OGE.NUMBERS[t.n];
    var box = h("article", { class: "task", id: "task-" + t.id });
    box.appendChild(h("header", { class: "task-head" }, [
      h("span", { class: "num", text: String(t.n) }),
      h("span", { class: "tmeta", text: meta.title + " · " + meta.pts + " " + pts(meta.pts) + (t.model ? " · модель " + t.model : "") }),
      h("a", { class: "minilink", href: libHref(t.n), text: "Конспект №" + t.n })
    ]));
    if (t.textId && (opts.mode !== "exam" || opts.showText)) { var tb = textBlock(t.textId); if (tb) box.appendChild(tb); }
    box.appendChild(h("div", { class: "qtext", html: t.text }));
    var mat = material(t); if (mat) box.appendChild(mat);

    var get, setVal;
    var saved = opts.saved;
    function changed() { if (opts.onChange) opts.onChange(get()); }

    if (meta.answer === "digit") {
      var list = h("ol", { class: "opts" });
      t.options.forEach(function (o, i) { list.appendChild(h("li", { html: o })); });
      box.appendChild(list);
      var inp = h("input", { class: "ans one", inputmode: "numeric", maxlength: "3", autocomplete: "off", "aria-label": "Ответ: номер верного варианта", oninput: changed });
      if (saved) inp.value = saved;
      box.appendChild(h("label", { class: "ansrow" }, [h("span", { text: "Ответ:" }), inp]));
      get = function () { return inp.value; };
    } else if (meta.answer === "word") {
      var w = h("input", { class: "ans word", autocomplete: "off", "aria-label": "Ответ: слово или словосочетание", oninput: changed });
      if (saved) w.value = saved;
      box.appendChild(h("label", { class: "ansrow" }, [h("span", { text: "Ответ:" }), w]));
      get = function () { return w.value; };
    } else if (meta.answer === "cols") {
      var ol = h("ol", { class: "opts" }); t.options.forEach(function (o) { ol.appendChild(h("li", { html: o })); }); box.appendChild(ol);
      var a1 = h("input", { class: "ans cols", inputmode: "numeric", autocomplete: "off", oninput: changed });
      var a2 = h("input", { class: "ans cols", inputmode: "numeric", autocomplete: "off", oninput: changed });
      if (saved) { a1.value = saved.sim || ""; a2.value = saved.diff || ""; }
      box.appendChild(h("div", { class: "colsrow" }, [
        h("label", {}, [h("span", { text: "Черты сходства" }), a1]),
        h("label", {}, [h("span", { text: "Черты различия" }), a2])
      ]));
      get = function () { return { sim: a1.value, diff: a2.value }; };
    } else if (meta.answer === "seq") {
      var p = t.pairs;
      var grid = h("div", { class: "pairs" }, [
        h("div", {}, [h("h4", { text: p.leftTitle })].concat(p.left.map(function (x, i) { return h("p", { html: "<b>" + LET[i] + ")</b> " + x }); }))),
        h("div", {}, [h("h4", { text: p.rightTitle })].concat(p.right.map(function (x, i) { return h("p", { html: "<b>" + (i + 1) + ")</b> " + x }); })))
      ]);
      box.appendChild(grid);
      var cells = p.left.map(function (x, i) {
        var c = h("input", { class: "cell", inputmode: "numeric", maxlength: "1", autocomplete: "off", "aria-label": "Цифра под буквой " + LET[i],
          oninput: function () { c.value = C.digitsOnly(c.value).slice(0, 1); if (c.value && cells[i + 1]) cells[i + 1].focus(); changed(); } });
        if (saved && saved[i]) c.value = saved[i];
        return c;
      });
      var tbl = h("table", { class: "seqtbl" }, [
        h("tr", {}, p.left.map(function (x, i) { return h("th", { text: LET[i] }); })),
        h("tr", {}, cells.map(function (c) { return h("td", {}, [c]); }))
      ]);
      box.appendChild(h("div", { class: "ansrow" }, [h("span", { text: "Ответ:" }), tbl]));
      get = function () { return cells.map(function (c) { return c.value || " "; }).join("").replace(/\s+$/, ""); };
    } else {
      var areas = {};
      t.fields.forEach(function (f) {
        var ta = h("textarea", { rows: f.rows || 3, placeholder: f.placeholder || "", oninput: changed });
        if (saved && saved[f.id]) ta.value = saved[f.id];
        areas[f.id] = ta;
        box.appendChild(h("label", { class: "field" }, [h("span", { text: f.label }), ta]));
      });
      get = function () { var o = {}; Object.keys(areas).forEach(function (k) { o[k] = areas[k].value; }); return o; };
    }
    box.getAnswer = function () { return get(); };

    if (opts.mode === "train") {
      var out = h("div", { class: "feedback", "aria-live": "polite" });
      var btn = h("button", { class: "btn primary", text: meta.answer === "open" ? "Проверить и сверить с эталоном" : "Проверить", onclick: function () {
        out.innerHTML = "";
        if (meta.answer === "open") out.appendChild(openReview(t, get(), function (score, flags) {
          record(t, score, meta.pts, "train", get());
          if (opts.onDone) opts.onDone(score);
        }));
        else {
          var r = C.checkShort(t, get());
          record(t, r.score, r.max, "train", get());
          out.appendChild(shortFeedback(t, get(), r));
          if (opts.onDone) opts.onDone(r.score);
        }
      } });
      box.appendChild(h("div", { class: "actions" }, [btn]));
      box.appendChild(out);
    }
    return box;
  }

  function keyText(t) {
    var meta = OGE.NUMBERS[t.n];
    if (meta.answer === "word") return Array.isArray(t.key) ? t.key[0] : t.key;
    if (meta.answer === "cols") return "сходство: " + t.key.sim.join("") + "; различие: " + t.key.diff.join("");
    return String(t.key);
  }

  function shortFeedback(t, ans, r) {
    var meta = OGE.NUMBERS[t.n];
    var ok = r.score === r.max;
    var d = h("div", { class: "fb " + (ok ? "ok" : (r.score > 0 ? "part" : "bad")) });
    d.appendChild(h("p", { class: "verdict", html: ok ? "Верно! +" + r.score + " " + pts(r.score) : (r.score > 0 ? "Почти: " + r.score + " из " + r.max + " — ошибка в одной позиции." : "Неверно. 0 из " + r.max + ".") }));
    if (r.formatError) d.appendChild(h("p", { class: "warn", text: "⚠ " + r.formatError }));
    if (!ok) d.appendChild(h("p", { html: "Правильный ответ: <b>" + keyText(t) + "</b>" }));
    if (meta.answer === "digit" && t.why) {
      var chosen = C.digitsOnly(ans);
      if (!ok && t.why[chosen]) d.appendChild(h("p", { html: "<b>Почему " + chosen + " — неверно:</b> " + t.why[chosen] }));
      d.appendChild(h("p", { html: "<b>Почему верно " + t.key + ":</b> " + t.why[t.key] }));
      if (!ok) {
        var others = h("details", {}, [h("summary", { text: "Разбор всех вариантов" })]);
        Object.keys(t.why).forEach(function (k) { others.appendChild(h("p", { html: "<b>" + k + ")</b> " + t.why[k] })); });
        d.appendChild(others);
      }
    }
    if (t.explain) d.appendChild(h("p", { html: t.explain }));
    if (meta.answer === "seq" && !ok) d.appendChild(h("p", { class: "hint", text: "Твой ответ: " + (C.digitsOnly(ans) || "—") + ". Сверь по буквам: каждая цифра стоит под своей буквой." }));
    d.appendChild(libLink(t, ok));
    d.appendChild(h("p", { class: "src", text: "Источник: " + t.source }));
    return d;
  }

  function libLink(t, ok) {
    var L = OGE.LIBRARY[String(t.lib).split("#")[0]];
    return h("p", { class: "liblink" }, [h("a", { href: libHref(t.lib), class: ok ? "" : "strong", text: (ok ? "Повторить: " : "Открой конспект: ") + (L ? L.title : "Библиотека") })]);
  }

  /* Сверка развёрнутого ответа: автоотметки + правка ученицей + балл по критериям ФИПИ */
  function elementList(t) {
    if (t.rubric.type === "t1") {
      var r = t.rubric;
      return [
        { id: "c1", label: "Выписано понятие «" + r.right[0].name + "»" },
        { id: "c2", label: "Выписано понятие «" + r.right[1].name + "»" },
        { id: "noExtra", label: "Нет лишних понятий (" + r.wrong.map(function (w) { return w.name; }).join(", ") + ")" },
        { id: "meaning", label: "Верно раскрыт смысл одного из верных понятий" }
      ];
    }
    return t.elements;
  }

  function openReview(t, ans, onSave) {
    var meta = OGE.NUMBERS[t.n];
    var flags = C.autoOpen(t, ans);
    var wrap = h("div", { class: "review" });
    var empty = Object.keys(ans).every(function (k) { return !String(ans[k]).trim(); });
    if (empty) { wrap.appendChild(h("p", { class: "warn", text: "Ответ пустой — 0 баллов. Напиши ответ и проверь ещё раз." })); onSave && onSave(0, flags); return wrap; }

    var scoreEl = h("p", { class: "verdict" });
    var list = h("ul", { class: "elist" });
    function upd() {
      var s = C.scoreOpen(t, flags);
      scoreEl.innerHTML = "Балл по критериям ФИПИ: <b>" + s + " из " + meta.pts + "</b>";
      wrap.className = "review fb " + (s === meta.pts ? "ok" : s > 0 ? "part" : "bad");
      return s;
    }
    elementList(t).forEach(function (el) {
      var cb = h("input", { type: "checkbox" });
      cb.checked = !!flags[el.id];
      var auto = !!flags[el.id];
      var tag = h("span", { class: "auto " + (auto ? "y" : "n"), text: auto ? "система: есть" : "система: не нашла" });
      cb.addEventListener("change", function () { flags[el.id] = cb.checked; flags._edited = true; upd(); });
      list.appendChild(h("li", {}, [h("label", {}, [cb, h("span", { text: " " + el.label + " " }), tag])]));
    });
    if (flags._extra && flags._extra.length) wrap.appendChild(h("p", { class: "warn", text: "⚠ Выписаны лишние понятия: " + flags._extra.join(", ") + ". На экзамене это снижает балл." }));
    if (flags._quotes && flags._quotes.length) wrap.appendChild(h("p", { class: "warn", text: "⚠ Похоже на цитату из текста (не засчитывается): «" + flags._quotes.join("», «") + "». Переформулируй своими словами." }));
    wrap.appendChild(scoreEl);
    wrap.appendChild(h("p", { class: "hint", html: "Система проверила ответ по ключевым словам — это <b>ориентир</b>. Сравни свой ответ с эталоном ниже. Если система ошиблась, поправь галочку: ставь её, только если в твоём ответе действительно есть этот элемент." }));
    wrap.appendChild(list);
    wrap.appendChild(h("details", { class: "ref", open: true }, [h("summary", { text: "Эталон ответа" }), h("div", { html: t.reference })]));
    wrap.appendChild(h("details", { class: "crit" }, [h("summary", { text: "Критерии оценивания" }), h("div", { html: t.criteria })]));
    if (t.explain) wrap.appendChild(h("p", { html: t.explain }));
    var savedNote = h("span", { class: "saved" });
    var saveBtn = h("button", { class: "btn", text: "Сохранить балл", onclick: function () {
      var s = upd(); onSave && onSave(s, flags); savedNote.textContent = " Сохранено: " + s + " из " + meta.pts + ".";
      saveBtn.disabled = true;
    } });
    upd();
    if (onSave) wrap.appendChild(h("div", { class: "actions" }, [saveBtn, savedNote]));
    wrap.appendChild(libLink(t, false));
    wrap.appendChild(h("p", { class: "src", text: "Источник: " + t.source }));
    wrap.getScore = upd;
    return wrap;
  }

  /* ---------------- Страницы ---------------- */
  var views = {};

  views.home = function () {
    setTitle("Главная");
    var root = h("div");
    root.appendChild(h("section", { class: "hero" }, [
      h("h1", { text: "Тренажёр ОГЭ по обществознанию — 2027" }),
      h("p", { html: "20 заданий, 32 балла, 180 минут — всё по демоверсии ФИПИ 2027. Решай задания по номерам, проходи варианты, а если ошиблась — открывай короткий конспект в Библиотеке." }),
      h("p", { class: "count", html: OGE.EXAM.examDate ? "" : "Дата ОГЭ-2027 ещё не объявлена — появится здесь, как только выйдет официальное расписание." })
    ]));
    // Общий прогресс
    var solved = OGE.BANK.filter(function (t) { return lastAtt(t.id); }).length;
    var mist = Object.keys(P.mistakes).filter(function (id) { return BYID[id]; }).length;
    var best = P.variants.reduce(function (m, v) { return Math.max(m, v.score); }, -1);
    root.appendChild(h("section", { class: "cards3" }, [
      h("div", { class: "stat" }, [h("b", { text: solved + " / " + OGE.BANK.length }), h("span", { text: "заданий решено" })]),
      h("div", { class: "stat" }, [h("b", { text: String(mist) }), h("span", { text: "заданий в «Моих ошибках»" })]),
      h("div", { class: "stat" }, [h("b", { text: best >= 0 ? best + " / 32" : "—" }), h("span", { text: "лучший вариант" })])
    ]));
    // Что решать сегодня
    var today = h("section", { class: "today" }, [h("h2", { text: "Что решать сегодня" })]);
    var items = [];
    if (!P.variants.length) items.push(h("li", {}, [h("a", { href: "#/variant/demo2027/train", text: "Пройди демоверсию ФИПИ 2027" }), document.createTextNode(" — это входная диагностика: по ней видно, какие номера проседают.")]));
    if (mist) items.push(h("li", {}, [h("a", { href: "#/mistakes", text: "Перереши ошибки (" + mist + ")" }), document.createTextNode(" — повторение закрепляет лучше, чем новые задания.")]));
    var weak = [];
    for (var n = 1; n <= 20; n++) { var st = numStats(n); if (st.done && st.pct < 100) weak.push({ n: n, pct: st.pct }); }
    weak.sort(function (a, b) { return a.pct - b.pct; });
    weak.slice(0, 3).forEach(function (w) { items.push(h("li", {}, [h("a", { href: "#/n/" + w.n, text: "Задание №" + w.n }), document.createTextNode(" — сейчас " + w.pct + " %. Сначала прочитай "), h("a", { href: libHref(w.n), text: "конспект" }), document.createTextNode(".")])); });
    var untouched = []; for (n = 1; n <= 20; n++) if (!numStats(n).done) untouched.push(n);
    if (untouched.length && P.variants.length) items.push(h("li", { html: "Ещё не решала номера: " + untouched.slice(0, 8).map(function (x) { return '<a href="#/n/' + x + '">№' + x + "</a>"; }).join(", ") + "." }));
    if (!items.length) items.push(h("li", { html: 'Всё решено без ошибок! Попробуй <a href="#/variant/random/exam">случайный вариант на время</a>.' }));
    today.appendChild(h("ul", {}, items));
    root.appendChild(today);
    root.appendChild(h("section", { class: "quick" }, [
      h("a", { class: "tile", href: "#/numbers" }, [h("b", { text: "Задания по номерам" }), h("span", { text: "№1–20, с проверкой и пояснениями" })]),
      h("a", { class: "tile", href: "#/variants" }, [h("b", { text: "Варианты" }), h("span", { text: "Пробник на 3 часа или тренировка" })]),
      h("a", { class: "tile", href: "#/library" }, [h("b", { text: "Библиотека" }), h("span", { text: "Короткий конспект к каждому номеру" })]),
      h("a", { class: "tile", href: "#/topics" }, [h("b", { text: "По темам" }), h("span", { text: "Разделы кодификатора ФИПИ" })])
    ]));
    return root;
  };

  views.numbers = function () {
    setTitle("Задания по номерам");
    var root = h("div", {}, [h("h1", { text: "Задания по номерам" })]);
    var grid = h("div", { class: "numgrid" });
    for (var n = 1; n <= 20; n++) {
      var m = OGE.NUMBERS[n], st = numStats(n);
      grid.appendChild(h("a", { class: "numcard", href: "#/n/" + n }, [
        h("span", { class: "num big", text: String(n) }),
        h("b", { text: m.title }),
        h("span", { class: "muted", text: m.pts + " " + pts(m.pts) + " · " + st.total + " зад." }),
        h("span", { class: "bar" }, [h("i", { style: "width:" + (st.total ? Math.round(100 * st.done / st.total) : 0) + "%" })]),
        h("span", { class: "muted", text: st.done ? "решено " + st.done + " · " + st.pct + " % баллов" : "не начато" })
      ]));
    }
    root.appendChild(grid);
    return root;
  };

  views.number = function (n) {
    n = +n; var m = OGE.NUMBERS[n]; if (!m) return notFound();
    setTitle("Задание №" + n);
    var L = OGE.LIBRARY[n];
    var root = h("div", {}, [
      h("p", { class: "crumbs", html: '<a href="#/numbers">Задания</a> › №' + n }),
      h("h1", { text: "№" + n + ". " + m.title }),
      h("div", { class: "info" }, [
        h("p", { html: "<b>Что проверяет:</b> " + m.checks + " <b>Раздел:</b> " + m.area + "." }),
        h("p", { html: "<b>Баллы:</b> " + m.pts + ". <b>Уровень:</b> " + ({ "Б": "базовый", "П": "повышенный", "В": "высокий" })[m.level] + ". <b>Как оформлять:</b> " + m.how }),
        L && L.traps ? h("p", { html: "<b>Ловушки:</b> " + L.traps.join(" ") }) : null,
        h("p", {}, [h("a", { class: "btn", href: libHref(n), text: "Конспект №" + n }), document.createTextNode(" "), h("a", { class: "btn primary", href: "#/drill/" + n, text: "Решать подряд" })])
      ])
    ]);
    var ul = h("ul", { class: "tasklist" });
    tasksOf(n).forEach(function (t, i) {
      var a = lastAtt(t.id);
      ul.appendChild(h("li", {}, [
        h("a", { href: "#/task/" + t.id, text: "Задание " + (i + 1) + (t.id.indexOf("demo") !== -1 ? " (демоверсия ФИПИ)" : "") + (t.model ? ", модель " + t.model : "") }),
        h("span", { class: "muted", text: " · " + (OGE.CODES[t.code] || "") + " · " + ({ base: "базовый", mid: "средний", hard: "сложный" })[t.level] }),
        a ? h("span", { class: "badge " + (a.s === a.m ? "ok" : a.s ? "part" : "bad"), text: a.s + "/" + a.m }) : null
      ]));
    });
    root.appendChild(h("h2", { text: "Задания этого типа" }));
    root.appendChild(ul);
    return root;
  };

  views.task = function (id) {
    var t = BYID[id]; if (!t) return notFound();
    setTitle("Задание №" + t.n);
    var list = tasksOf(t.n), idx = list.indexOf(t);
    var next = list[idx + 1];
    var root = h("div", {}, [h("p", { class: "crumbs", html: '<a href="#/numbers">Задания</a> › <a href="#/n/' + t.n + '">№' + t.n + "</a> › " + (idx + 1) + " из " + list.length })]);
    root.appendChild(taskView(t, { mode: "train" }));
    root.appendChild(h("p", { class: "navrow" }, [
      idx > 0 ? h("a", { class: "btn", href: "#/task/" + list[idx - 1].id, text: "← Предыдущее" }) : null,
      next ? h("a", { class: "btn", href: "#/task/" + next.id, text: "Следующее →" }) : h("a", { class: "btn", href: "#/n/" + t.n, text: "К списку" })
    ]));
    return root;
  };

  views.drill = function (n) {
    n = +n; var list = tasksOf(n); if (!list.length) return notFound();
    var unsolved = list.filter(function (t) { var a = lastAtt(t.id); return !a || a.s < a.m; });
    var t = (unsolved.length ? unsolved : list)[0];
    location.replace("#/task/" + t.id);
    return h("div");
  };

  views.mistakes = function () {
    setTitle("Мои ошибки");
    var ids = Object.keys(P.mistakes).filter(function (id) { return BYID[id]; });
    var root = h("div", {}, [h("h1", { text: "Мои ошибки" }),
      h("p", { text: ids.length ? "Здесь задания, в которых последняя попытка была не на полный балл. Реши заново — при верном ответе задание уйдёт из списка." : "Ошибок нет. Отлично! Решай новые задания или вариант." })]);
    ids.sort(function (a, b) { return BYID[a].n - BYID[b].n; }).forEach(function (id) {
      var t = BYID[id];
      root.appendChild(taskView(t, { mode: "train" }));
    });
    return root;
  };

  views.topics = function () {
    setTitle("По темам");
    var root = h("div", {}, [h("h1", { text: "Задания по темам кодификатора" }),
      h("p", { class: "muted", text: "Разделы — как в кодификаторе ФИПИ 2027; они совпадают с главами учебника под ред. Д. А. Медведева." })]);
    OGE.SECTIONS.forEach(function (s) {
      var codes = Object.keys(OGE.CODES).filter(function (c) { return c.split(".")[0] === s.id; });
      var sec = h("section", { class: "topic" }, [h("h2", { text: s.id + ". " + s.title + " (" + s.par + ")" })]);
      var ul = h("ul", { class: "tasklist" });
      codes.forEach(function (c) {
        var ts = OGE.BANK.filter(function (t) { return t.code === c; });
        ul.appendChild(h("li", {}, [
          ts.length ? h("a", { href: "#/topic/" + c, text: c + " " + OGE.CODES[c] }) : h("span", { class: "muted", text: c + " " + OGE.CODES[c] }),
          h("span", { class: "muted", text: " · " + ts.length + " зад." })
        ]));
      });
      sec.appendChild(ul); root.appendChild(sec);
    });
    return root;
  };

  views.topic = function (code) {
    var ts = OGE.BANK.filter(function (t) { return t.code === code; });
    setTitle("Тема " + code);
    var root = h("div", {}, [h("p", { class: "crumbs", html: '<a href="#/topics">Темы</a> › ' + code }), h("h1", { text: code + " " + (OGE.CODES[code] || "") })]);
    ts.sort(function (a, b) { return a.n - b.n; }).forEach(function (t) { root.appendChild(taskView(t, { mode: "train" })); });
    return root;
  };

  views.library = function () {
    setTitle("Библиотека");
    var root = h("div", {}, [h("h1", { text: "Библиотека" }),
      h("p", { text: "Короткий конспект к каждому номеру: что проверяют, главное по теме и типичные ловушки. Определения — по учебнику «Обществознание. 9 класс» под ред. Д. А. Медведева (2026), формат — по демоверсии ФИПИ 2027." })]);
    var ul = h("ul", { class: "liblist" });
    for (var n = 1; n <= 20; n++) ul.appendChild(h("li", {}, [h("a", { href: "#/library/" + n, text: OGE.LIBRARY[n].title })]));
    root.appendChild(ul);
    root.appendChild(h("p", {}, [h("a", { class: "btn", href: "#/glossary", text: "Словарь терминов" })]));
    return root;
  };

  views.libItem = function (n, anchor) {
    var L = OGE.LIBRARY[n]; if (!L) return notFound();
    setTitle("Конспект №" + n);
    var root = h("article", { class: "lib" }, [
      h("p", { class: "crumbs", html: '<a href="#/library">Библиотека</a> › №' + n }),
      h("h1", { text: L.title }),
      h("p", { class: "lead", html: L.intro })
    ]);
    var toc = h("nav", { class: "toc", "aria-label": "Разделы конспекта" }, L.sections.map(function (s) { return h("a", { href: "#/library/" + n + "/" + s.id, text: s.h }); }));
    root.appendChild(toc);
    L.sections.forEach(function (s) {
      root.appendChild(h("section", { id: "s-" + s.id, class: "libsec" + (anchor === s.id ? " target" : "") }, [h("h2", { text: s.h }), h("div", { html: s.html })]));
    });
    if (L.traps) root.appendChild(h("section", { class: "libsec traps" }, [h("h2", { text: "Ловушки" }), h("ul", {}, L.traps.map(function (x) { return h("li", { text: x }); }))]));
    root.appendChild(h("p", { class: "src", text: "Источник: " + L.src }));
    root.appendChild(h("p", {}, [h("a", { class: "btn primary", href: "#/drill/" + n, text: "Решать задания №" + n }),
      n > 1 ? h("a", { class: "btn", href: "#/library/" + (n - 1), text: "← №" + (n - 1) }) : null,
      n < 20 ? h("a", { class: "btn", href: "#/library/" + (+n + 1), text: "№" + (+n + 1) + " →" }) : null]));
    if (anchor) setTimeout(function () { var el = document.getElementById("s-" + anchor); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 30);
    return root;
  };

  views.glossary = function () {
    setTitle("Словарь");
    var root = h("div", {}, [h("p", { class: "crumbs", html: '<a href="#/library">Библиотека</a> › Словарь' }), h("h1", { text: "Словарь терминов" }),
      h("p", { class: "muted", text: "Определения из учебника «Обществознание. 9 класс» под ред. Д. А. Медведева (2026): словарь (с. 230–237) и текст параграфов." })]);
    var q = h("input", { class: "search", type: "search", placeholder: "Найти термин…", "aria-label": "Поиск термина" });
    var dl = h("dl", { class: "gloss" });
    function draw() {
      dl.innerHTML = ""; var f = C.norm(q.value);
      OGE.GLOSSARY.forEach(function (g) {
        if (f && C.norm(g[0] + " " + g[1]).indexOf(f) === -1) return;
        dl.appendChild(h("dt", { text: g[0] })); dl.appendChild(h("dd", { html: g[1] + ' <span class="src">(' + g[2] + ")</span>" }));
      });
    }
    q.addEventListener("input", draw); draw();
    root.appendChild(q); root.appendChild(dl);
    return root;
  };

  /* ---------- Варианты ---------- */
  function randomVariant() {
    for (var attempt = 0; attempt < 300; attempt++) {
      var strict = attempt < 200, used = {}, codes = {}, ids = [], ok = true;
      var textIds = shuffle(Object.keys(OGE.TEXTS));
      var textId = textIds[0];
      for (var n = 1; n <= 20 && ok; n++) {
        var pool = tasksOf(n);
        if (n >= 18) pool = pool.filter(function (t) { return t.textId === textId; });
        pool = shuffle(pool).filter(function (t) {
          if ((t.facts || []).some(function (f) { return used[f]; })) return false;
          if (strict && n < 18 && codes[t.code] && OGE.NUMBERS[n].answer !== "open") return false;
          return true;
        });
        if (!pool.length) { ok = false; break; }
        var t = pool[0]; ids.push(t.id);
        (t.facts || []).forEach(function (f) { used[f] = 1; }); codes[t.code] = 1;
      }
      if (ok) return { id: "random", title: "Случайный вариант", tasks: ids };
    }
    return OGE.VARIANTS[0];
  }

  views.variants = function () {
    setTitle("Варианты");
    var root = h("div", {}, [h("h1", { text: "Варианты" }),
      h("p", { html: "<b>Экзамен</b> — 180 минут, проверка в конце, как на ОГЭ. <b>Тренировка</b> — проверка после каждого задания. Пробник на время советуем раз в 3–4 недели." })]);
    OGE.VARIANTS.concat([{ id: "random", title: "Случайный вариант", note: "Собирается из банка заданий по структуре демоверсии 2027; без повторов одного факта." }]).forEach(function (v) {
      var hist = P.variants.filter(function (x) { return x.vid === v.id; });
      root.appendChild(h("section", { class: "varcard" }, [
        h("h2", { text: v.title }), h("p", { class: "muted", text: v.note }),
        hist.length ? h("p", { text: "Твои результаты: " + hist.map(function (x) { return x.score + "/32"; }).join(", ") }) : null,
        h("p", {}, [h("a", { class: "btn primary", href: "#/variant/" + v.id + "/exam", text: "Экзамен (180 мин)" }), document.createTextNode(" "), h("a", { class: "btn", href: "#/variant/" + v.id + "/train", text: "Тренировка" })])
      ]));
    });
    return root;
  };

  views.variant = function (vid, mode) {
    var draft = load(DRAFT, null);
    var v;
    if (draft && draft.vid === vid && draft.mode === mode && !draft.finished) v = { id: vid, title: draft.title, tasks: draft.tasks };
    else if (vid === "random") v = randomVariant();
    else v = OGE.VARIANTS.filter(function (x) { return x.id === vid; })[0];
    if (!v) return notFound();
    if (!draft || draft.vid !== vid || draft.mode !== mode || draft.finished) {
      draft = { vid: vid, mode: mode, title: v.title, tasks: v.tasks, ans: {}, start: Date.now(), finished: false };
      save(DRAFT, draft);
    }
    setTitle(v.title);
    var root = h("div", { class: "variant" });
    root.appendChild(h("p", { class: "crumbs", html: '<a href="#/variants">Варианты</a> › ' + v.title + " · " + (mode === "exam" ? "экзамен" : "тренировка") }));
    root.appendChild(h("h1", { text: v.title }));
    var trainScore = {};
    var timerEl = null, tick = null;
    if (mode === "exam") {
      timerEl = h("div", { class: "timer", role: "timer", "aria-live": "off" });
      root.appendChild(timerEl);
      var endAt = draft.start + OGE.EXAM.minutes * 60000;
      var drawT = function () {
        var left = Math.max(0, endAt - Date.now()), m = Math.floor(left / 60000), s = Math.floor(left % 60000 / 1000);
        timerEl.textContent = "Осталось " + Math.floor(m / 60) + ":" + String(m % 60).padStart(2, "0") + ":" + String(s).padStart(2, "0");
        if (!left) { clearInterval(tick); timerEl.textContent = "Время вышло — проверь ответы."; }
      };
      drawT(); tick = setInterval(drawT, 1000);
      cleanup = function () { clearInterval(tick); };
      root.appendChild(h("p", { class: "hint", html: "Ответы сохраняются автоматически. Задания 1, 7, 8, 12, 17–20 — развёрнутые: после завершения ты сверишь их с эталоном." }));
    }
    var views_ = [];
    var shownText = {};
    v.tasks.forEach(function (id, i) {
      var t = BYID[id]; if (!t) return;
      var showText = t.textId && !shownText[t.textId]; if (showText) shownText[t.textId] = 1;
      if (showText && mode === "exam") { var tb = textBlock(t.textId); root.appendChild(h("div", { class: "textwrap" }, [h("h2", { text: "Прочитайте текст и выполните задания 18–20" }), tb])); }
      var tv = taskView(t, { mode: mode, saved: draft.ans[id], showText: false,
        onChange: function (a) { draft.ans[id] = a; save(DRAFT, draft); },
        onDone: function (s) { trainScore[id] = s; } });
      if (mode === "train" && showText) tv.insertBefore(textBlock(t.textId), tv.children[1]);
      views_.push({ t: t, el: tv });
      root.appendChild(tv);
    });
    if (mode === "exam") {
      root.appendChild(h("div", { class: "actions sticky" }, [h("button", { class: "btn primary", text: "Завершить и проверить", onclick: function () {
        if (tick) clearInterval(tick);
        draft.finished = true; draft.dur = Date.now() - draft.start; save(DRAFT, draft);
        finishExam(v, views_, draft);
      } })]));
    } else {
      root.appendChild(h("div", { class: "actions" }, [h("button", { class: "btn primary", text: "Сохранить результат тренировки", onclick: function () {
        var total = 0, per = {};
        views_.forEach(function (x) { var s = trainScore[x.t.id] || 0; total += s; per[x.t.n] = { s: s, m: OGE.NUMBERS[x.t.n].pts }; });
        P.variants.push({ vid: v.id, title: v.title + " (тренировка)", date: Date.now(), score: total, per: per, mode: "train", tasks: v.tasks });
        persist(); draft.finished = true; save(DRAFT, draft);
        location.hash = "#/stats";
      } }), h("span", { class: "muted", text: " Засчитываются задания, которые ты проверила." })]));
    }
    return root;
  };
  var cleanup = null;

  function finishExam(v, list, draft) {
    $app.innerHTML = "";
    window.scrollTo(0, 0);
    var root = h("div", { class: "results" }, [h("h1", { text: "Результат: " + v.title })]);
    var totalEl = h("p", { class: "total" });
    root.appendChild(totalEl);
    root.appendChild(h("p", { class: "hint", html: "Задания с кратким ответом проверены автоматически. Развёрнутые (1, 7, 8, 12, 17–20) система оценила по ключевым словам — <b>сверь каждое с эталоном</b> и поправь галочки, если нужно, затем нажми «Сохранить результат»." }));
    var table = h("table", { class: "restbl" }, [h("tr", {}, [h("th", { text: "№" }), h("th", { text: "Твой ответ" }), h("th", { text: "Балл" })])]);
    root.appendChild(table);
    var scores = {}, reviews = {};
    function recalc() {
      var tot = 0; Object.keys(scores).forEach(function (k) { tot += scores[k](); });
      totalEl.innerHTML = "Итого: <b>" + tot + " из " + OGE.EXAM.maxScore + "</b> первичных баллов. " + (OGE.EXAM.scale ? "" : "Шкала перевода в отметку на 2027 год ещё не опубликована ФИПИ.");
      return tot;
    }
    var details = h("div", { class: "resdetails" });
    list.forEach(function (x) {
      var t = x.t, meta = OGE.NUMBERS[t.n], ans = draft.ans[t.id];
      var cell = h("td", { class: "sc" });
      var shown = meta.answer === "open" ? "развёрнутый" : meta.answer === "cols" ? ((ans && ans.sim) || "—") + " | " + ((ans && ans.diff) || "—") : (ans || "—");
      table.appendChild(h("tr", {}, [h("td", {}, [h("a", { href: "#res-" + t.id, text: String(t.n) })]), h("td", { text: shown }), cell]));
      var block = h("section", { class: "task resblock", id: "res-" + t.id }, [h("h3", { text: "№" + t.n + ". " + meta.title })]);
      block.appendChild(h("div", { class: "qtext small", html: t.text }));
      if (meta.answer === "open") {
        var a = ans || {};
        block.appendChild(h("div", { class: "youranswer", html: "<b>Твой ответ:</b>" + t.fields.map(function (f) { return "<p><i>" + f.label + ":</i> " + escapeHtml(a[f.id] || "—") + "</p>"; }).join("") }));
        var rv = openReview(t, a, null);
        reviews[t.id] = rv;
        scores[t.id] = function () { var s = rv.getScore ? rv.getScore() : 0; cell.textContent = s + "/" + meta.pts; return s; };
        rv.addEventListener("change", recalc);
        block.appendChild(rv);
      } else {
        var r = C.checkShort(t, ans);
        scores[t.id] = function () { cell.textContent = r.score + "/" + r.max; return r.score; };
        cell.className = "sc " + (r.score === r.max ? "ok" : r.score ? "part" : "bad");
        block.appendChild(shortFeedback(t, ans, r));
      }
      details.appendChild(block);
    });
    var saveBtn = h("button", { class: "btn primary", text: "Сохранить результат", onclick: function () {
      var tot = recalc(), per = {};
      list.forEach(function (x) {
        var s = scores[x.t.id](), m = OGE.NUMBERS[x.t.n].pts;
        per[x.t.n] = { s: s, m: m };
        record(x.t, s, m, "exam", draft.ans[x.t.id]);
      });
      P.variants.push({ vid: v.id, title: v.title, date: Date.now(), score: tot, per: per, mode: "exam", dur: draft.dur, tasks: v.tasks });
      persist(); save(DRAFT, null);
      saveBtn.disabled = true; saveBtn.textContent = "Сохранено ✓";
      saved.innerHTML = ' Результат в <a href="#/stats">Статистике</a>.';
    } });
    var saved = h("span");
    root.appendChild(h("div", { class: "actions" }, [saveBtn, saved]));
    root.appendChild(details);
    root.appendChild(h("div", { class: "actions" }, [saveBtn.cloneNode(true)]));
    root.lastChild.firstChild.addEventListener("click", function () { saveBtn.click(); });
    $app.appendChild(root);
    recalc();
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }).replace(/\n/g, "<br>"); }

  /* ---------- Статистика ---------- */
  views.stats = function () {
    setTitle("Статистика");
    var root = h("div", {}, [h("h1", { text: "Статистика" })]);
    var tbl = h("table", { class: "stattbl" }, [h("tr", {}, ["№", "Тип", "Решено", "Баллы", "%"].map(function (x) { return h("th", { text: x }); }))]);
    for (var n = 1; n <= 20; n++) {
      var st = numStats(n);
      tbl.appendChild(h("tr", { class: st.pct == null ? "" : st.pct >= 80 ? "good" : st.pct >= 50 ? "mid" : "low" }, [
        h("td", {}, [h("a", { href: "#/n/" + n, text: String(n) })]), h("td", { text: OGE.NUMBERS[n].title }),
        h("td", { text: st.done + "/" + st.total }), h("td", { text: st.max ? st.got + "/" + st.max : "—" }), h("td", { text: st.pct == null ? "—" : st.pct + " %" })
      ]));
    }
    root.appendChild(h("h2", { text: "По номерам заданий" }));
    root.appendChild(h("div", { class: "scroll" }, [tbl]));
    // По разделам
    root.appendChild(h("h2", { text: "По разделам" }));
    var sec = h("ul");
    OGE.SECTIONS.forEach(function (s) {
      var got = 0, max = 0, done = 0;
      OGE.BANK.forEach(function (t) { if (t.code.split(".")[0] !== s.id) return; var a = lastAtt(t.id); if (a) { got += a.s; max += a.m; done++; } });
      sec.appendChild(h("li", { text: s.title + ": " + (max ? Math.round(100 * got / max) + " % (" + done + " зад.)" : "ещё нет решений") }));
    });
    root.appendChild(sec);
    root.appendChild(h("h2", { text: "Варианты" }));
    if (!P.variants.length) root.appendChild(h("p", { class: "muted", text: "Пока нет пройденных вариантов." }));
    else {
      var vt = h("table", { class: "stattbl" }, [h("tr", {}, ["Дата", "Вариант", "Баллы", "Время"].map(function (x) { return h("th", { text: x }); }))]);
      P.variants.slice().reverse().forEach(function (v) {
        vt.appendChild(h("tr", {}, [h("td", { text: new Date(v.date).toLocaleDateString("ru-RU") }), h("td", { text: v.title }), h("td", { text: v.score + "/32" }), h("td", { text: v.dur ? Math.round(v.dur / 60000) + " мин" : "—" })]));
      });
      root.appendChild(h("div", { class: "scroll" }, [vt]));
    }
    // Кнопки
    var msg = h("span", { class: "saved" });
    var reset = h("div", { class: "resetbox", hidden: true }, [
      h("p", { text: "Точно стереть весь прогресс, ошибки и историю вариантов? Это нельзя отменить." }),
      h("button", { class: "btn danger", text: "Да, сбросить", onclick: function () { P = { v: 1, att: {}, mistakes: {}, variants: [] }; persist(); save(DRAFT, null); route(); } }),
      h("button", { class: "btn", text: "Отмена", onclick: function () { reset.hidden = true; } })
    ]);
    root.appendChild(h("div", { class: "actions" }, [
      h("button", { class: "btn", text: "Скопировать результаты", onclick: function () { copy(resultsText(), msg); } }),
      h("button", { class: "btn", text: "Сбросить прогресс", onclick: function () { reset.hidden = false; } }), msg
    ]));
    root.appendChild(reset);
    return root;
  };

  function resultsText() {
    var lines = ["Результаты тренажёра ОГЭ-2027 (обществознание), " + new Date().toLocaleDateString("ru-RU")];
    for (var n = 1; n <= 20; n++) { var st = numStats(n); lines.push("№" + n + ": " + (st.max ? st.got + "/" + st.max + " (" + st.pct + " %), решено " + st.done + "/" + st.total : "не решала")); }
    P.variants.forEach(function (v) {
      lines.push(new Date(v.date).toLocaleDateString("ru-RU") + " | " + v.title + " | " + v.score + "/32 | " +
        Object.keys(v.per).map(function (k) { return k + ":" + v.per[k].s + "/" + v.per[k].m; }).join(" "));
    });
    var mist = Object.keys(P.mistakes).filter(function (id) { return BYID[id]; });
    if (mist.length) lines.push("Ошибки: " + mist.join(", "));
    return lines.join("\n");
  }
  function copy(text, msg) {
    function done() { msg.textContent = " Скопировано."; }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    function fallback() { var ta = h("textarea", { class: "copybox", readonly: true }); ta.value = text; msg.parentNode.parentNode.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (e) { msg.textContent = " Выдели текст ниже и скопируй."; } }
  }

  views.about = function () {
    setTitle("О тренажёре");
    return h("div", { class: "lib" }, [h("h1", { text: "О тренажёре" }), h("div", { html:
      "<p>Формат, баллы и критерии — по документам ФИПИ 2027 года: демонстрационный вариант, спецификация и кодификатор (опубликованы 13.11.2026). Определения — по государственному учебнику «Обществознание. 9 класс» под ред. Д. А. Медведева (М.: Просвещение-Союз, 2026). Нормы права сверены с Конституцией РФ (kremlin.ru) и кодексами.</p>" +
      "<p><b>Как проверяются развёрнутые ответы.</b> Компьютер не может по-настоящему понять свободный текст, поэтому проверка устроена в два шага: 1) система ищет в ответе обязательные смысловые элементы по ключевым словам и считает балл по критериям ФИПИ; 2) ты сравниваешь свой ответ с эталоном и, если система ошиблась, исправляешь отметки. Будь к себе строгой: на экзамене эксперт засчитывает только то, что действительно написано.</p>" +
      "<p>Задания из демоверсии помечены «ФИПИ». Остальные составлены для тренажёра; данные в диаграммах — условные. Фотографии — со свободными лицензиями, автор и лицензия указаны под снимком.</p>" +
      "<p>Прогресс хранится только в этом браузере (localStorage). На другом устройстве он будет свой.</p>" }) ]);
  };

  function notFound() { setTitle("Не найдено"); return h("div", {}, [h("h1", { text: "Страница не найдена" }), h("p", {}, [h("a", { href: "#/", text: "На главную" })])]); }

  /* ---------------- Маршрутизатор ---------------- */
  function route() {
    if (cleanup) { cleanup(); cleanup = null; }
    var parts = (location.hash || "#/").replace(/^#\/?/, "").split("/").map(decodeURIComponent);
    var v;
    switch (parts[0]) {
      case "": v = views.home(); break;
      case "numbers": v = views.numbers(); break;
      case "n": v = views.number(parts[1]); break;
      case "task": v = views.task(parts[1]); break;
      case "drill": v = views.drill(parts[1]); break;
      case "topics": v = views.topics(); break;
      case "topic": v = views.topic(parts[1]); break;
      case "variants": v = views.variants(); break;
      case "variant": v = views.variant(parts[1], parts[2] === "exam" ? "exam" : "train"); break;
      case "library": v = parts[1] ? views.libItem(parts[1], parts[2]) : views.library(); break;
      case "glossary": v = views.glossary(); break;
      case "mistakes": v = views.mistakes(); break;
      case "stats": v = views.stats(); break;
      case "about": v = views.about(); break;
      default:
        if (/^res-/.test(parts[0])) return; // якоря внутри страницы результатов
        v = notFound();
    }
    $app.innerHTML = ""; $app.appendChild(v);
    document.querySelectorAll(".nav a").forEach(function (a) {
      var target = a.getAttribute("href").replace(/^#\/?/, "").split("/")[0];
      var cur = parts[0] === "n" || parts[0] === "task" ? "numbers" : parts[0] === "glossary" ? "library" : parts[0] === "variant" ? "variants" : parts[0] === "topic" ? "topics" : parts[0];
      if (target === cur) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    if (!(parts[0] === "library" && parts[2])) window.scrollTo(0, 0);
    $app.focus({ preventScroll: true });
  }
  window.addEventListener("hashchange", route);
  route();
})();
