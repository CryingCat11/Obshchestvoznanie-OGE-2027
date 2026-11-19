import { answered, tasks } from './bank.mjs';

const escapes = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const h = value => String(value ?? '').replace(/[&<>"']/g, character => escapes[character]);
// Preserve the small set of formatting tags used by the imported bank.
const lesson = value => h(value).replace(/&lt;(\/?(?:b|i|p|ol|li)|br)&gt;/g, '<$1>');
const dateFormatter = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' });
const dayFormatter = new Intl.DateTimeFormat('ru', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' });
const shownDate = value => dateFormatter.format(new Date(value));
const nowDay = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format();
const iconPaths = {
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  back: '<path d="m15 6-6 6 6 6"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  today: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/>',
  users: '<circle cx="9" cy="7" r="3"/><path d="M2 20v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2m2-16a3 3 0 0 1 0 6m4 10v-2a4 4 0 0 0-3-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
};
const icon = name => `<svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name]}</svg>`;
const button = (href, text, symbol = '', extra = '') => `<a class="button ${extra}" href="${h(href)}">${symbol ? icon(symbol) : ''}${h(text)}</a>`;
const back = (href, label) => `<a class="back" href="${h(href)}">${icon('back')}${h(label)}</a>`;
const errorText = message => message ? `<p class="error" role="alert">${h(message)}</p>` : '';
const status = work => {
  if (work.submitted_at) return '<mark>Сдана</mark>';
  if (work.due && work.due < nowDay()) return '<span class="late">Просрочена</span>';
  return work.done ? 'В работе' : 'Не начата';
};

function page(title, body) {
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${h(title)} · Обществознание</title><link rel="stylesheet" href="/assets/marker.css"><link rel="icon" href="/assets/marker.svg">
<script src="/assets/actions.js" defer></script></head><body>
<a class="skip" href="#main">К основному содержанию</a>${body}</body></html>`;
}

function studentShell(name, content) {
  return `<div class="student"><header class="student-bar"><a href="/learn">Обществознание</a><span>${h(name)}</span></header>
  <main id="main">${content}</main></div>`;
}

function tutorShell(title, section, body) {
  const nav = (href, name, symbol, active) => `<a href="${href}" ${active ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${name}</span></a>`;
  return page(title, `<div class="tutor"><aside class="rail"><a class="brand" href="/tutor">Обществознание<span>ОГЭ-2027 · кабинет репетитора</span></a>
  <nav aria-label="Кабинет">${nav('/tutor', 'Сегодня', 'today', section === 'today')}${nav('/tutor/students', 'Ученики', 'users', section === 'students')}</nav>
  <form method="post" action="/tutor/logout"><span>Миша</span><button class="text-button">Выйти</button></form></aside>
  <main id="main" class="desk">${body}</main></div>`);
}

function deskHead(title, action = '') {
  return `<header class="desk-head"><h1>${h(title)}</h1>${action}</header>`;
}

function progress(work, current = 0) {
  return `<div class="progress" aria-hidden="true">${work.questions.map(({ position, task, answer }) =>
    `<span class="${position === current ? 'current' : ''}">${answered(task, answer) ? icon('check') : ''}</span>`).join('')}</div>`;
}

export function login(error = '') {
  return page('Вход', studentShell('Кабинет репетитора', `<section class="login"><h1>Кабинет Миши</h1>${errorText(error)}
    <form method="post" action="/tutor/login" class="fields"><label>Код доступа<input name="code" type="password" autocomplete="current-password" required maxlength="256"></label>
    <button class="button">Войти ${icon('arrow')}</button></form></section>`));
}

export function message(title, description, href = '/tutor', label = 'В кабинет') {
  return page(title, studentShell('', `<section class="login"><h1>${h(title)}</h1><p>${h(description)}</p>${href ? button(href, label, 'arrow') : ''}</section>`));
}

function workRows(works, showStudent) {
  if (!works.length) return '<p class="muted empty">Здесь появятся назначенные работы.</p>';
  return `<div class="worktable" role="table" aria-label="Назначенные работы">
  <div class="workrow tablehead" role="row"><span role="columnheader">${showStudent ? 'Ученик и работа' : 'Работа'}</span><span role="columnheader">Сделано</span><span role="columnheader">Срок</span><span role="columnheader">Статус</span></div>
  ${works.map(work => `<div class="workrow" role="row"><div role="cell"><a href="/tutor/work/${work.id}">${h(work.title)}</a>${showStudent ? `<div class="muted">${h(work.name)}</div>` : ''}
  ${work.due ? `<div class="due-mobile muted">До ${shownDate(work.due)}</div>` : ''}</div>
  <div class="progress-cell" role="cell">${progress(work)}<span>${work.done} из ${work.questions.length}</span></div>
  <div class="due-cell muted" role="cell">${work.due ? shownDate(work.due) : 'Без срока'}</div>
  <div role="cell">${status(work)}${work.submitted_at ? `<div class="muted">${work.score} из ${work.max_score} б.</div>` : ''}</div></div>`).join('')}</div>`;
}

export function tutorHome(works, hasStudents) {
  const date = dayFormatter.format(new Date());
  const title = date[0].toLocaleUpperCase('ru') + date.slice(1);
  const action = hasStudents ? button('/tutor/new', 'Задать работу', 'plus') : button('/tutor/students', 'Добавить ученика', 'plus');
  return tutorShell('Сегодня', 'today', `${deskHead(title, action)}<section><h2>Кто как идёт</h2>${workRows(works, true)}</section>`);
}

function copyLink(label, url) {
  return `<div class="copy-wrap"><label for="share-link">${h(label)}</label>
    <div class="copy-line"><input id="share-link" value="${h(url)}" readonly data-copy-value><button type="button" class="button secondary" data-copy>${icon('copy')} Копировать</button></div><span class="muted" data-copy-status role="status"></span></div>`;
}

export function studentList(students, error = '', name = '') {
  return tutorShell('Ученики', 'students', `${deskHead('Ученики')}
    <div class="student-admin"><section>${students.length ? `<ul class="ruled">${students.map(student =>
      `<li><a href="/tutor/students/${student.id}">${h(student.name)} ${icon('arrow')}</a></li>`).join('')}</ul>`
      : '<p class="muted">Добавь ученика, чтобы выдать первую работу.</p>'}</section>
    <section><h2>Добавить ученика</h2>${errorText(error)}
    <form method="post" action="/tutor/students" class="fields"><label>Имя<input name="name" value="${h(name)}" required maxlength="80"></label>
    <button class="button">${icon('plus')} Добавить</button></form></section></div>`);
}

export function studentDetail(student, works, personalLink, linkRenewed) {
  return tutorShell(student.name, 'students', `${back('/tutor/students', 'Ученики')}
    ${deskHead(student.name, button('/tutor/new?student=' + student.id, 'Задать работу', 'plus'))}
    ${linkRenewed ? '<p class="confirmation" role="status">Новая ссылка готова.</p>' : ''}
    ${copyLink('Личная ссылка ученика', personalLink)}
    <details class="link-settings"><summary>Заменить личную ссылку</summary>
      <p>Старые ссылки и открытые сессии ученика перестанут работать. Все работы и ответы сохранятся.</p>
      <form method="post"><input type="hidden" name="version" value="${student.link_version}">
        <button class="button secondary">Выпустить новую ссылку</button></form>
    </details>
    <section><h2>Работы</h2>${workRows(works, false)}</section>`);
}

const groupTasks = Map.groupBy(tasks, task => task.n);

export function newWork(students, form = {}, error = '') {
  const selected = new Set(form.tasks ?? []);
  const groups = [...groupTasks].map(([n, list]) => `<details class="bank-group" ${n === 5 || list.some(task => selected.has(task.id)) ? 'open' : ''}>
    <summary><strong>№${n}</strong><span>${h(list[0].meta.title)}</span><span class="muted">${list.length}</span></summary>
    <div class="choices">${list.map(task => `<div class="bank-item"><label class="pick-task"><input type="checkbox" name="task" value="${h(task.id)}" ${selected.has(task.id) ? 'checked' : ''}>
    <span>${lesson(task.text)}</span></label>
    ${task.material || task.pairs || task.options ? `<details class="task-preview"><summary>Условие целиком</summary>
      ${questionMaterial(task, true)}</details>` : ''}</div>`).join('')}</div></details>`).join('');
  return tutorShell('Задать работу', '', `${back('/tutor', 'Сегодня')}${deskHead('Задать работу')}${errorText(error)}
    <form method="post" action="/tutor/new" class="work-form" data-assignment>
    <div class="fields"><label>Ученик<select name="student" required><option value="">Выбери ученика</option>${students.map(student =>
      `<option value="${student.id}" ${form.student === student.id ? 'selected' : ''}>${h(student.name)}</option>`).join('')}</select></label>
    <label>Название работы<input name="title" value="${h(form.title ?? 'Домашняя работа по обществознанию')}" maxlength="100" required></label>
    <label>Срок сдачи <span class="muted">(необязательно)</span><input type="date" name="due" value="${h(form.due)}"></label>
    <label>Записка ученику <span class="muted">(необязательно)</span><textarea name="note" rows="3" maxlength="500">${h(form.note)}</textarea></label></div>
    <section class="bank"><header class="section-head"><h2>Задания</h2><span class="muted" data-count role="status">Выбрано ${selected.size} из 20</span></header>${groups}</section>
    <div class="sticky tutor-actions"><button class="button">${icon('plus')} Назначить работу</button></div>
    </form>`);
}

function noteText(note) {
  return note ? `<figure class="note"><blockquote>${h(note)}</blockquote><figcaption>Миша</figcaption></figure>` : '';
}

export function today(student, works) {
  const active = works.filter(work => !work.submitted_at);
  const past = works.filter(work => work.submitted_at);
  const [first, ...rest] = active;
  const row = work => `<li><a href="/learn/${work.id}"><strong>${h(work.title)}</strong><span class="muted">${work.submitted_at
    ? `${work.score} из ${work.max_score} б. · сдана ${shownDate(work.submitted_at)}`
    : `Решено ${work.done} из ${work.questions.length}`}</span>${icon('arrow')}</a></li>`;
  return page('Сегодня', studentShell(student.name, `<h1>Сегодня</h1>${first ? `
    <article class="today-work">
      <div class="today-title"><span class="count"><mark>${first.questions.length}</mark><span>зад.</span></span><h2>${h(first.title)}</h2></div>
      <p class="muted">${first.due ? 'От Миши · сдать до ' + shownDate(first.due) : 'От Миши'}</p>
      ${progress(first)}<p class="muted">Решено ${first.done} из ${first.questions.length}</p>
      ${noteText(first.note)}
      ${button('/learn/' + first.id, first.done ? 'Продолжить работу' : 'Начать работу', 'arrow', 'wide')}
    </article>` : '<p class="muted empty">Новых домашних работ пока нет.</p>'}
    ${rest.length ? `<section><h2>Другие работы</h2><ul class="ruled">${rest.map(row).join('')}</ul></section>` : ''}
    ${past.length ? `<section><h2>Сданные работы</h2><ul class="ruled">${past.map(row).join('')}</ul></section>` : ''}`));
}

function table(material) {
  if (!material || material.type !== 'table') return '';
  return `<table class="material"><thead><tr>${material.head.map(value => `<th scope="col">${lesson(value)}</th>`).join('')}</tr></thead>
    <tbody>${material.rows.map(row => `<tr>${row.map(value => `<td>${lesson(value)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function questionMaterial(task, showChoices = false) {
  if (task.pairs) {
    const { leftTitle, rightTitle, left, right } = task.pairs;
    const letters = ['А', 'Б', 'В', 'Г', 'Д'];
    return `<div class="pairs"><div><h2>${h(leftTitle.toLocaleLowerCase('ru'))}</h2>
      <ol class="lettered">${left.map((item, index) => `<li><b>${letters[index]}.</b> ${lesson(item)}</li>`).join('')}</ol></div>
      <div><h2>${h(rightTitle.toLocaleLowerCase('ru'))}</h2><ol class="plain-options">
      ${right.map(item => `<li>${lesson(item)}</li>`).join('')}</ol></div></div>`;
  }
  if (task.options?.length && (task.meta.answer !== 'digit' || showChoices)) {
    return `<ol class="plain-options">${task.options.map(option => `<li>${lesson(option)}</li>`).join('')}</ol>`;
  }
  return table(task.material);
}

function answerInputs(task, answer) {
  const input = (name, label, value, numeric = false) =>
    `<label>${label}<input name="${name}" maxlength="300" autocomplete="off" ${numeric ? 'inputmode="numeric"' : ''} value="${h(value)}"></label>`;
  if (task.meta.answer === 'digit') return `<fieldset class="options"><legend class="visually-hidden">Выбери один вариант</legend>
    ${task.options.map((option, index) => `<label class="option"><input type="radio" name="answer" value="${index + 1}" ${answer === String(index + 1) ? 'checked' : ''}>
      <span class="option-number" aria-hidden="true">${index + 1}</span><span>${lesson(option)}</span></label>`).join('')}</fieldset>`;
  const fields = task.meta.answer === 'cols'
    ? `<div class="two-fields">${input('sim', 'Сходство', answer?.sim, true)}${input('diff', 'Различия', answer?.diff, true)}</div>`
    : input('answer', 'Ответ', answer, task.meta.answer === 'seq');
  return `<div class="fields answer-fields"><p class="muted">${h(task.meta.how)}</p>${fields}</div>`;
}

export function solve(work, question, error = '', attemptedAnswer = question.answer) {
  const { task, position } = question;
  const total = work.questions.length;
  const nextLabel = position === total ? 'К сдаче работы' : 'Дальше';
  const root = '/learn/' + work.id;
  return page('Задание ' + position, `<div class="student problem">
    <header class="task-bar">${back('/learn', 'Сегодня')}<span><strong>№${task.n}</strong> · ${position} из ${total}</span><a href="${root}/review">Все задания</a></header>
    <main id="main">
    ${progress(work, position)}<h1 class="task-title">${h(task.meta.title)}</h1>
    <div class="prompt">${lesson(task.text)}</div>${questionMaterial(task)}
    ${errorText(error)}
    <form method="post" class="solve-form" data-autosave>
      <input type="hidden" name="revision" value="${question.revision}">
      ${answerInputs(task, attemptedAnswer)}
      <div class="sticky solve-actions">
        <span class="muted save-state" data-save-status role="status">${question.revision ? 'Черновик сохранён' : ''}</span>
        <button type="button" class="text-button" data-retry hidden>Повторить сохранение</button>
        <div class="solve-buttons">${position > 1 ? `<button class="button secondary prev" name="go" value="prev" aria-label="Предыдущее задание">${icon('back')}</button>` : ''}
        <button class="button wide direction" name="go" value="next">${nextLabel} ${icon('arrow')}</button></div>
      </div>
    </form></main></div>`);
}

function answerLabel(task, answer) {
  if (task.meta.answer === 'cols') return `Сходство — ${h(answer?.sim || '—')}, различия — ${h(answer?.diff || '—')}`;
  if (task.meta.answer === 'digit' && answer) return `${h(answer)} · ${lesson(task.options[Number(answer) - 1])}`;
  return h(answer || '—');
}

export function review(work, error = '') {
  const root = '/learn/' + work.id;
  return page('Перед сдачей', studentShell(work.name, `${back('/learn', 'Сегодня')}<h1>Перед сдачей</h1>
    <p class="muted">${h(work.title)} · решено ${work.done} из ${work.questions.length}</p>${errorText(error)}
    <ol class="ruled review">${work.questions.map(({ task, answer, position }) =>
      `<li><a href="${root}/q/${position}"><span class="item-index">${position}</span><span><strong>№${task.n} · ${h(task.meta.title)}</strong>
      <span class="muted">${answered(task, answer) ? answerLabel(task, answer) : 'Нет ответа'}</span></span>${icon('arrow')}</a></li>`).join('')}</ol>
    ${work.done === work.questions.length ? `<form method="post" class="sticky"><input type="hidden" name="revision" value="${work.revision}">
      <button class="button wide">Сдать работу ${icon('arrow')}</button></form>`
      : button(root, 'Вернуться к незаполненным заданиям', 'arrow', 'wide')}`));
}

function resultRows(work, tutor = false) {
  return `<div class="results">${work.questions.map(({ task, answer, result, position }) => {
    const label = !result ? '' : result.ok ? 'Верно' : result.score ? 'Частично верно' : 'Неверно';
    const key = task.meta.answer === 'cols' ? { sim: task.key.sim.join(''), diff: task.key.diff.join('') }
      : Array.isArray(task.key) ? task.key[0] : task.key;
    const wrong = !result?.ok && task.why?.[answer];
    const explanation = task.why?.[task.key] || task.explain;
    return `<details class="result" ${result && !result.ok && work.questions.length <= 5 && tutor ? 'open' : ''}>
      <summary><span class="item-index">${position}</span><strong>№${task.n} · ${h(task.meta.title)}</strong>${result
        ? `<span class="grade ${result.ok ? 'correct' : 'late'}">${label} · ${result.score} из ${result.max}</span>` : ''}</summary>
      <div class="result-body"><div class="prompt">${lesson(task.text)}</div>${questionMaterial(task)}
      <p><strong>${tutor ? 'Ответ ученика' : 'Твой ответ'}</strong> · ${answerLabel(task, answer)}</p>
      ${result ? `<p><strong>Верный ответ</strong> · <mark>${answerLabel(task, key)}</mark></p>
        ${result.formatError ? `<p class="late">${h(result.formatError)}</p>` : ''}
        ${wrong ? `<div>${lesson(wrong)}</div>` : ''}${explanation ? `<div>${lesson(explanation)}</div>` : ''}`
        : ''}<p class="muted source">${h(task.source)}</p></div></details>`;
  }).join('')}</div>`;
}

export function studentResult(work) {
  return page('Работа сдана', studentShell(work.name, `${back('/learn', 'Сегодня')}<h1>Работа сдана</h1><p class="muted">${h(work.title)}</p>
    <div class="score"><mark>${work.score}</mark> <span>из ${work.max_score} баллов</span></div>
    <section><h2>Разбор ответов</h2>${resultRows(work)}</section>`));
}

export function tutorWork(work, link, created) {
  return tutorShell(work.title, 'today', `${back('/tutor', 'Сегодня')}${deskHead(work.title)}
    <p class="work-meta"><a href="/tutor/students/${work.student_id}">${h(work.name)}</a> · ${status(work)}
    ${work.due ? ' · до ' + shownDate(work.due) : ''}</p>
    ${created ? '<p class="confirmation" role="status">Работа назначена.</p>' : ''}
    ${copyLink('Ссылка на работу', link)}${noteText(work.note)}
    <section><header class="section-head"><h2>Ответы ученика</h2><span>${work.submitted_at
      ? `<mark>${work.score} из ${work.max_score} баллов</mark>`
      : `Решено ${work.done} из ${work.questions.length}`}</span></header>
    ${work.submitted_at ? resultRows(work, true) : '<p class="muted empty">Ответы и разбор появятся после сдачи работы.</p>'}</section>`);
}
