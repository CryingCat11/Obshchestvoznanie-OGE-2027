/* Проверка ответов по правилам ФИПИ 2027 (демоверсия, «Система оценивания»).
   Краткий ответ — точное совпадение с эталоном после нормализации ввода.
   Развёрнутый ответ — автопроверка по смысловым элементам (ключевые слова) + сверка ученицы с эталоном. */
window.OGE = window.OGE || {};

(function () {
  "use strict";

  function norm(s) {
    return String(s == null ? "" : s)
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[«»"“”„'`]/g, " ")
      .replace(/[^a-zа-я0-9\s-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  function digitsOnly(s) { return String(s == null ? "" : s).replace(/[^0-9]/g, ""); }
  function words(s) { var n = norm(s); return n ? n.split(" ").length : 0; }

  /* ---------- Краткий ответ ---------- */
  // Возвращает {score, max, ok, formatError, message}
  function checkShort(task, answer) {
    var meta = OGE.NUMBERS[task.n];
    var max = meta.pts;
    var res = { score: 0, max: max, ok: false, formatError: null };

    if (meta.answer === "word") {
      var a = norm(answer);
      if (!a) { res.formatError = "Ответ пустой."; return res; }
      var keys = (Array.isArray(task.key) ? task.key : [task.key]).map(norm);
      res.ok = keys.indexOf(a) !== -1;
      if (!res.ok && /\d/.test(a)) res.formatError = "В этом задании ответ — слово, а не цифры.";
      res.score = res.ok ? max : 0;
      return res;
    }

    if (meta.answer === "digit") {
      var raw = String(answer == null ? "" : answer).trim();
      var d = digitsOnly(raw);
      if (!d) { res.formatError = "Нужна одна цифра."; return res; }
      if (d.length > 1) { res.formatError = "Записано больше одной цифры — на экзамене это 0 баллов."; return res; }
      if (raw.replace(/\s/g, "") !== d) res.formatError = "Лишние символы в ответе. Пиши только цифру.";
      res.ok = d === String(task.key);
      res.score = res.ok ? max : 0;
      return res;
    }

    if (meta.answer === "cols") {
      // answer = {sim: "23", diff: "14"}; порядок внутри колонки не важен
      var sim = digitsOnly(answer && answer.sim).split("").sort().join("");
      var diff = digitsOnly(answer && answer.diff).split("").sort().join("");
      var ks = task.key.sim.slice().sort().join(""), kd = task.key.diff.slice().sort().join("");
      if (!sim || !diff) { res.formatError = "Заполни обе колонки."; }
      var all = sim + diff;
      if (/(.).*\1/.test(all.split("").sort().join(""))) res.formatError = "Одна и та же цифра стоит в обеих колонках.";
      res.ok = sim === ks && diff === kd;
      res.score = res.ok ? max : 0;
      return res;
    }

    if (meta.answer === "seq") {
      // Задание 14: 2 балла — полное совпадение; 1 — ошибка в одной позиции; лишние символы — 0.
      var s = digitsOnly(answer), k = String(task.key);
      if (!s) { res.formatError = "Ответ пустой."; return res; }
      if (s.length > k.length) { res.formatError = "Цифр больше, чем букв, — на экзамене это 0 баллов."; return res; }
      if (s.length < k.length) res.formatError = "Заполнены не все буквы.";
      var wrong = 0;
      for (var i = 0; i < k.length; i++) if (s[i] !== k[i]) wrong++;
      res.wrongPositions = wrong;
      res.score = wrong === 0 ? 2 : (wrong === 1 ? 1 : 0);
      res.ok = wrong === 0;
      return res;
    }
    return res;
  }

  /* ---------- Развёрнутый ответ ---------- */
  // Элемент засчитан, если в тексте поля есть хотя бы одна основа слова из КАЖДОЙ группы keys,
  // нет запрещённых основ (deny) и выполнено минимальное число слов (minWords).
  function matchElement(el, text) {
    var t = " " + norm(text) + " ";
    if (!norm(text)) return false;
    if (el.minWords && words(text) < el.minWords) return false;
    if (el.deny && el.deny.some(function (st) { return t.indexOf(norm(st)) !== -1; })) return false;
    // atLeast: {n: 3, items: [[основы], [основы], ...]} — нужно назвать не меньше n разных позиций
    if (el.atLeast) {
      var got = el.atLeast.items.filter(function (alts) {
        return alts.some(function (st) { return t.indexOf(norm(st)) !== -1; });
      }).length;
      if (got < el.atLeast.n) return false;
    }
    var groups = el.keys || [];
    for (var g = 0; g < groups.length; g++) {
      var alts = Array.isArray(groups[g]) ? groups[g] : [groups[g]];
      var hit = alts.some(function (st) { return t.indexOf(norm(st)) !== -1; });
      if (!hit) return false;
    }
    return true;
  }

  // Найти, какие понятия из списка выписаны в поле (для задания 1).
  function findConcepts(list, text) {
    var t = " " + norm(text) + " ";
    return list.filter(function (c) {
      var stems = Array.isArray(c.stems) ? c.stems : [c.stems];
      return stems.some(function (st) { return t.indexOf(norm(st)) !== -1; });
    }).map(function (c) { return c.name; });
  }

  // auto: {elementId: true/false}; answers: {fieldId: text}
  function autoOpen(task, answers) {
    var flags = {};
    var r = task.rubric;
    if (r.type === "t1") {
      var txt = answers.concepts || "";
      var found = findConcepts(r.right, txt), extra = findConcepts(r.wrong, txt);
      flags.c1 = found.indexOf(r.right[0].name) !== -1;
      flags.c2 = found.indexOf(r.right[1].name) !== -1;
      flags.noExtra = extra.length === 0;
      flags.meaning = (task.elements || []).some(function (el) { return el.id.indexOf("m") === 0 && matchElement(el, answers.meaning || ""); });
      flags._extra = extra;
      return flags;
    }
    if (r.type === "plan") {
      // Задание 18: каждый пункт плана — отдельная строка; пункт-цитата из текста не засчитывается.
      var src = task.textId && OGE.TEXTS[task.textId] ? norm(OGE.TEXTS[task.textId].plain || "") : "";
      var lines = String(answers.plan || "").split(/\n+/)
        .map(function (l) { return l.replace(/^\s*([0-9]+|[a-zа-я])\s*[\)\.]\s*/i, "").trim(); })
        .filter(function (l) { return l; });
      var quotes = lines.filter(function (l) { return src && words(l) >= 5 && src.indexOf(norm(l)) !== -1; });
      var usable = lines.filter(function (l) { return quotes.indexOf(l) === -1; });
      (task.elements || []).forEach(function (el) {
        flags[el.id] = usable.some(function (l) { return matchElement(el, l); });
      });
      flags._quotes = quotes;
      return flags;
    }
    (task.elements || []).forEach(function (el) {
      var text = el.field ? (answers[el.field] || "") : Object.keys(answers).map(function (k) { return answers[k]; }).join(" ");
      flags[el.id] = matchElement(el, text);
    });
    return flags;
  }

  // Подсчёт балла по критериям ФИПИ из отметок элементов (после правки ученицей).
  function scoreOpen(task, f) {
    var r = task.rubric, n = 0;
    function count(ids) { return ids.filter(function (id) { return !!f[id]; }).length; }
    switch (r.type) {
      case "t1": {
        var c = (f.c1 ? 1 : 0) + (f.c2 ? 1 : 0);
        if (c === 2 && f.noExtra && f.meaning) return 2;
        if (!f.noExtra) return (c >= 1 && f.meaning) ? 1 : 0;
        if (c === 2) return 1;
        if (c === 1 && f.meaning) return 1;
        return 0;
      }
      case "gate": // задание 7: первый элемент обязателен
        if (!f[r.gate]) return 0;
        return f[r.then] ? 2 : 1;
      case "count": // табличная шкала: число засчитанных элементов → баллы
        n = count(r.ids);
        return r.table[n] != null ? r.table[n] : 0;
      case "t12b": // вывод + предположение к нему
        var c1 = !!f.c1, c2 = !!f.c2, a1 = c1 && !!f.a1, a2 = c2 && !!f.a2;
        if (c1 && c2 && a1 && a2) return 4;
        if (c1 && c2 && (a1 || a2)) return 3;
        if ((c1 && a1) || (c2 && a2) || (c1 && c2)) return 2;
        if (c1 || c2) return 1;
        return 0;
      case "plan": // задание 18
        n = count(r.ids);
        if (n === r.ids.length) return 2;
        if (n > r.ids.length / 2) return 1;
        return 0;
      case "t20": // примеры e1..e3, пояснения x1..x3 (пояснение — только при примере)
        var ex = count(["e1", "e2", "e3"]);
        var expl = ["1", "2", "3"].filter(function (i) { return f["e" + i] && f["x" + i]; }).length;
        if (ex === 3 && expl === 3) return 3;
        if (ex >= 2 && expl === 2) return 2;
        if (expl === 1 || ex >= 2) return 1;
        return 0;
    }
    return 0;
  }

  OGE.check = { norm: norm, digitsOnly: digitsOnly, words: words, checkShort: checkShort,
                matchElement: matchElement, autoOpen: autoOpen, scoreOpen: scoreOpen };
})();
