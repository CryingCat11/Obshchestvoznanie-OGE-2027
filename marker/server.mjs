import { createServer } from 'node:http';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, dataAccess } from './lib/database.mjs';
import { answered, readAnswer, taskById } from './lib/bank.mjs';
import * as ui from './lib/views.mjs';

process.umask(0o077);
const demo = process.argv.includes('--demo');
const host = demo ? '127.0.0.1' : process.env.MARKER_HOST || '127.0.0.1';
const port = Number(process.env.PORT || 4317);
const tutorCode = demo ? randomBytes(18).toString('base64url') : process.env.MARKER_TUTOR_CODE;
if (!tutorCode || tutorCode.length < 24 || tutorCode.length > 256) {
  console.error('Задай MARKER_TUTOR_CODE длиной от 24 до 256 символов или запусти npm run demo.');
  process.exit(1);
}
const publicUrl = process.env.MARKER_URL ? new URL(process.env.MARKER_URL) : null;
if (publicUrl && (!['http:', 'https:'].includes(publicUrl.protocol) || publicUrl.href !== publicUrl.origin + '/')) {
  throw new Error('MARKER_URL должен содержать только протокол и адрес приложения.');
}
const secure = publicUrl?.protocol === 'https:';
const dataFile = demo ? join(mkdtempSync(join(tmpdir(), 'marker-demo-')), 'homework.sqlite')
  : resolve(process.env.MARKER_DB || fileURLToPath(new URL('./data/homework.sqlite', import.meta.url)));
const data = dataAccess(openDatabase(dataFile));

if (demo) {
  const student = data.addStudent('Алина К.');
  data.addStudent('Тимур С.');
  data.create(student, 'Общество и личность', 'Алина, в задании на соответствие проверь каждую букву.', '',
    ['n05-demo', 'n05-003', 'n14-demo'].map(id => taskById.get(id)));
}

const assets = new Map();
for (const [name, type] of [['marker.css', 'text/css; charset=utf-8'], ['actions.js', 'text/javascript; charset=utf-8'], ['marker.svg', 'image/svg+xml']]) {
  assets.set('/assets/' + name, [type, readFileSync(new URL('./public/' + name, import.meta.url))]);
}
for (const [family, weight] of [['sofia-sans', 400], ['sofia-sans', 600], ['sofia-sans-extra-condensed', 800], ['caveat', 500]]) {
  for (const alphabet of ['cyrillic', 'latin']) {
    const name = `${family}-${alphabet}-${weight}-normal.woff2`;
    assets.set('/assets/' + name, ['font/woff2', readFileSync(new URL(`./node_modules/@fontsource/${family}/files/${name}`, import.meta.url))]);
  }
}

const DAY = 86400;
function sign(purpose, value) {
  return createHmac('sha256', data.key).update(purpose + ':' + value).digest('base64url');
}
function equal(a, b) {
  const first = Buffer.from(a ?? '');
  const second = Buffer.from(b);
  return first.length === second.length && timingSafeEqual(first, second);
}
function cookies(request) {
  return new Map((request.headers.cookie ?? '').split(/;\s*/).map(part => {
    const index = part.indexOf('=');
    return [part.slice(0, index), part.slice(index + 1)];
  }));
}
function makeCookie(name, value, time) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${time}${secure ? '; Secure' : ''}`;
}
function session(purpose, id, duration) {
  const value = `${id}.${Math.floor(Date.now() / 1000) + duration}`;
  return value + '.' + sign(purpose, value);
}
function sessionId(purpose, token) {
  const [id, expiry, signature, ...rest] = (token ?? '').split('.');
  if (rest.length || !Number.isSafeInteger(Number(expiry)) || Number(expiry) <= Date.now() / 1000) return null;
  return equal(signature, sign(purpose, `${id}.${expiry}`)) ? id : null;
}
const tutorId = sign('tutor-code', tutorCode);
function origin(request) {
  return publicUrl?.origin || `http://${request.headers.host}`;
}
function studentIdentity(student) {
  return student.link_version === 0 ? student.id : `${student.id}~${student.link_version}`;
}
function inviteToken(student, workId = '') {
  return sign('invite', studentIdentity(student) + '/' + workId);
}
function shareLink(request, student, workId = '') {
  return `${origin(request)}/s/${student.id}/${workId ? workId + '/' : ''}${inviteToken(student, workId)}`;
}

function respond(response, status, type, value) {
  response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' }).end(value);
}
const html = (response, value, status = 200) => respond(response, status, 'text/html; charset=utf-8', value);
const json = (response, value, status = 200) => respond(response, status, 'application/json; charset=utf-8', JSON.stringify(value));
function redirect(response, path, cookie) {
  response.setHeader('Cache-Control', 'no-store');
  if (cookie) response.setHeader('Set-Cookie', cookie);
  response.writeHead(303, { Location: path }).end();
}
function notFound(response) {
  return html(response, ui.message('Страница не найдена', 'Открой свою ссылку ещё раз или попроси Мишу прислать новую.', ''), 404);
}
class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
async function formBody(request) {
  if (!/^(application\/x-www-form-urlencoded)(?:;|$)/i.test(request.headers['content-type'] ?? '')) {
    throw new RequestError(415, 'Открой страницу и попробуй ещё раз.');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 32768) throw new RequestError(413, 'Слишком много данных. Сократи текст и попробуй ещё раз.');
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

const idPattern = '[a-f0-9-]{36}';
const invitePattern = new RegExp(`^/s/(${idPattern})/(?:(${idPattern})/)?([\\w-]{43})$`);
const tutorWorkPattern = new RegExp(`^/tutor/work/(${idPattern})$`);
const tutorStudentPattern = new RegExp(`^/tutor/students/(${idPattern})$`);
const learnerWorkPattern = new RegExp(`^/learn/(${idPattern})(?:/(review|q/([1-9][0-9]*)))?$`);

function validDate(value) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value && value >= '2000-01-01';
}

async function tutor(request, response, path, search, isPost, loggedIn) {
  if (path === '/tutor/login') {
    if (!isPost) return loggedIn ? redirect(response, '/tutor') : html(response, ui.login());
    const form = await formBody(request);
    if (!equal(sign('tutor-code', (form.get('code') ?? '').replace(/\s+/g, '')), tutorId)) return html(response, ui.login('Код доступа не подошёл.'), 401);
    return redirect(response, '/tutor', makeCookie('marker_tutor', session('tutor', tutorId, DAY * 7), DAY * 7));
  }
  if (!loggedIn) return redirect(response, '/tutor/login');
  if (path === '/tutor/logout' && isPost) return redirect(response, '/tutor/login', makeCookie('marker_tutor', '', 0));
  if (path === '/tutor' && !isPost) return html(response, ui.tutorHome(data.works(), Boolean(data.students().length)));
  if (path === '/tutor/students') {
    if (!isPost) return html(response, ui.studentList(data.students()));
    const name = (await formBody(request)).get('name')?.trim();
    if (!name || name.length > 80) return html(response, ui.studentList(data.students(), 'Введи имя длиной до 80 символов.', name), 422);
    return redirect(response, '/tutor/students/' + data.addStudent(name));
  }
  const studentId = tutorStudentPattern.exec(path)?.[1];
  if (studentId) {
    const student = data.student(studentId);
    if (!student) return notFound(response);
    if (isPost) {
      const form = await formBody(request);
      const version = form.get('version');
      if (/^\d+$/.test(version ?? '') && Number.isSafeInteger(Number(version))) data.rotateLink(studentId, Number(version));
      return redirect(response, '/tutor/students/' + studentId + '?link=renewed');
    }
    return html(response, ui.studentDetail(student, data.works(studentId), shareLink(request, student), search.get('link') === 'renewed'));
  }
  if (path === '/tutor/new') {
    const students = data.students();
    if (!students.length) return redirect(response, '/tutor/students');
    if (!isPost) return html(response, ui.newWork(students, { student: search.get('student') }));
    const form = await formBody(request);
    const values = Object.fromEntries(['student', 'title', 'note', 'due'].map(key => [key, (form.get(key) ?? '').trim()]));
    values.tasks = [...new Set(form.getAll('task'))];
    const tasks = values.tasks.map(id => taskById.get(id));
    let error = '';
    if (!data.student(values.student)) error = 'Выбери ученика из списка.';
    else if (!values.title || values.title.length > 100) error = 'Введи название работы длиной до 100 символов.';
    else if (values.note.length > 500) error = 'Сократи записку до 500 символов.';
    else if (!validDate(values.due)) error = 'Проверь дату сдачи.';
    else if (!tasks.length || tasks.length > 20 || tasks.some(task => !task)) error = 'Выбери от 1 до 20 заданий из банка.';
    if (error) return html(response, ui.newWork(students, values, error), 422);
    const id = data.create(values.student, values.title, values.note, values.due, tasks);
    return redirect(response, '/tutor/work/' + id + '?created=1');
  }
  const workId = tutorWorkPattern.exec(path)?.[1];
  if (workId && !isPost) {
    const work = data.get(workId);
    return work ? html(response, ui.tutorWork(work, shareLink(request, data.student(work.student_id), workId), search.has('created'))) : notFound(response);
  }
  return notFound(response);
}

function inviteRequired(response) {
  return html(response, ui.message('Открой личную ссылку', 'Миша присылает её вместе с заданием. По ней можно продолжить работу на другом устройстве.', ''), 401);
}
async function learner(request, response, path, isPost, identity, search) {
  const studentId = identity?.split('~', 1)[0];
  const student = studentId && data.student(studentId);
  if (!student || studentIdentity(student) !== identity) return inviteRequired(response);
  if (path === '/learn' && !isPost) {
    const works = data.works(student.id);
    const work = works.find(work => work.id === search.get('work'));
    if (work?.submitted_at) return redirect(response, '/learn/' + work.id);
    return html(response, ui.today(student, work ? [work, ...works.filter(item => item.id !== work.id)] : works));
  }
  const match = learnerWorkPattern.exec(path);
  if (!match) return notFound(response);
  const [, id, action, questionNumber] = match;
  const work = data.get(id);
  if (!work || work.student_id !== student.id) return notFound(response);
  const root = '/learn/' + work.id;
  const autosave = request.headers.accept === 'application/json';
  if (work.submitted_at) {
    if (autosave && isPost) return json(response, { state: 'submitted' }, 409);
    return path === root && !isPost ? html(response, ui.studentResult(work)) : redirect(response, root);
  }
  if (!action && !isPost) {
    const pending = work.questions.find(question => !answered(question.task, question.answer));
    return redirect(response, pending ? root + '/q/' + pending.position : root + '/review');
  }
  if (action === 'review') {
    if (!isPost) return html(response, ui.review(work));
    const form = await formBody(request);
    if (studentIdentity(data.student(studentId)) !== identity) return inviteRequired(response);
    const state = data.submit(id, Number(form.get('revision') ?? -1));
    return state === 'submitted' ? redirect(response, root) : html(response,
      ui.review(data.get(id), 'Ответы изменились. Проверь их перед сдачей.'), 409);
  }
  const question = work.questions[Number(questionNumber) - 1];
  if (!question) return notFound(response);
  if (!isPost) return html(response, ui.solve(work, question));
  const form = await formBody(request);
  if (studentIdentity(data.student(studentId)) !== identity) return inviteRequired(response);
  const answer = readAnswer(question.task, form);
  const saved = data.save(id, question.position, Number(form.get('revision') ?? -1), answer);
  if (autosave) return json(response, saved, saved.state ? 409 : 200);
  if (saved.state === 'submitted') return redirect(response, root);
  if (saved.state === 'conflict') {
    const fresh = data.get(id);
    return html(response, ui.solve(fresh, fresh.questions[question.position - 1],
      'Ответ изменился в другом окне. Здесь остался твой ввод. Чтобы сохранить именно его, нажми кнопку перехода ещё раз.', answer), 409);
  }
  const next = question.position + (form.get('go') === 'prev' ? -1 : 1);
  return redirect(response, next >= 1 && next <= work.questions.length ? root + '/q/' + next : root + '/review');
}

const server = createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'same-origin');
  response.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; object-src 'none'");
  try {
    const { pathname: path, searchParams: search } = new URL(request.url, 'http://localhost');
    const isPost = request.method === 'POST';
    if (!['GET', 'HEAD', 'POST'].includes(request.method)) throw new RequestError(405, 'Этот способ запроса недоступен.');
    if (isPost && (request.headers['sec-fetch-site'] === 'cross-site' ||
      (request.headers.origin && request.headers.origin !== origin(request)))) {
      throw new RequestError(403, 'Открой страницу напрямую и повтори действие.');
    }
    const asset = assets.get(path);
    if (asset && !isPost) {
      const [type, content] = asset;
      return response.writeHead(200, { 'Content-Type': type, 'Cache-Control': type === 'font/woff2' ? 'public, max-age=86400' : 'no-cache' }).end(content);
    }
    const jar = cookies(request);
    const loggedIn = equal(sessionId('tutor', jar.get('marker_tutor')), tutorId);
    if (path === '/' && !isPost) return redirect(response, '/tutor');
    if (path === '/tutor' || path.startsWith('/tutor/')) return await tutor(request, response, path, search, isPost, loggedIn);
    const invite = !isPost && invitePattern.exec(path);
    if (invite) {
      const [, studentId, workId, token] = invite;
      const student = data.student(studentId);
      if (!student || !equal(token, inviteToken(student, workId))) return notFound(response);
      if (workId && data.get(workId)?.student_id !== studentId) return notFound(response);
      response.setHeader('Referrer-Policy', 'no-referrer');
      const cookie = makeCookie('marker_student', session('student', studentIdentity(student), DAY * 90), DAY * 90);
      return redirect(response, workId ? '/learn?work=' + workId : '/learn', cookie);
    }
    if (path === '/learn' || path.startsWith('/learn/')) {
      const identity = sessionId('student', jar.get('marker_student'));
      return await learner(request, response, path, isPost, identity, search);
    }
    return notFound(response);
  } catch (error) {
    if (error instanceof RequestError) return html(response, ui.message('Не удалось выполнить действие', error.message), error.status);
    console.error(error);
    return html(response, ui.message('Страница временно недоступна', 'Попробуй обновить страницу через минуту.'), 500);
  }
});
server.listen(port, host, () => {
  console.log(`Маркер · ${publicUrl?.origin || 'http://' + host + ':' + server.address().port}`);
  if (demo) console.log('Код репетитора для локальной демонстрации: ' + tutorCode);
});
