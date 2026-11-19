import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { test } from 'node:test';
import { grade, tasks } from '../lib/bank.mjs';

test('краткие задания из общего банка дают полный балл за правильный ответ', () => {
  assert.ok(tasks.length > 0);
  assert.equal(new Set(tasks.map(task => task.id)).size, tasks.length);
  for (const task of tasks) {
    const expected = task.meta.answer === 'cols' ? { sim: task.key.sim.join(''), diff: task.key.diff.join('') }
      : Array.isArray(task.key) ? task.key[0] : task.key;
    assert.equal(grade(task, expected).score, task.meta.pts, task.id);
  }
});

test('репетитор назначает работу, ученик продолжает с другого устройства, результат переживает перезапуск', { timeout: 20000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'marker-test-'));
  const code = randomBytes(24).toString('base64url');
  let child;
  let origin;
  let port = '0';

  async function stop() {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit');
    child.kill();
    await exited;
  }
  t.after(async () => {
    await stop();
    await rm(directory, { recursive: true, force: true });
  });

  async function start() {
    child = spawn(process.execPath, ['server.mjs'], {
      cwd: new URL('../', import.meta.url),
      env: { ...process.env, MARKER_HOST: '127.0.0.1', MARKER_URL: '', MARKER_DB: join(directory, 'test.sqlite'), MARKER_TUTOR_CODE: code, PORT: port },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const lines = createInterface({ input: child.stdout });
    for await (const line of lines) {
      const url = line.match(/Маркер · (http:\/\/\S+)/)?.[1];
      if (url) {
        origin = url;
        port = new URL(origin).port;
        return;
      }
    }
    throw new Error('Сервер не запустился');
  }

  await start();
  function browser() {
    let cookie;
    return async (path, status, form, extra = {}) => {
      const headers = cookie ? { Cookie: cookie } : {};
      const response = await fetch(new URL(path, origin), {
        ...extra,
        redirect: 'manual',
        method: form ? 'POST' : 'GET',
        headers: { ...headers, ...(form ? { Origin: origin } : {}), ...extra.headers },
        body: form ? new URLSearchParams(form) : undefined,
      });
      const body = await response.text();
      assert.equal(response.status, status, path);
      cookie = response.headers.get('set-cookie')?.split(';', 1)[0] ?? cookie;
      return { body, location: response.headers.get('location') };
    };
  }

  const sharedLink = body => {
    const url = body.match(/id="share-link" value="([^"]+)"/)?.[1];
    assert.ok(url, 'В кабинете есть ссылка');
    return url;
  };

  const tutor = browser();
  await tutor('/tutor/login', 401, { code: 'wrong' });
  await tutor('/tutor/login', 303, { code });
  const { location: studentPath } = await tutor('/tutor/students', 303, { name: 'Алина К.' });
  const studentId = studentPath.split('/').at(-1);
  const personal = sharedLink((await tutor(studentPath, 200)).body);
  const form = [['student', studentId], ['title', 'Общество и личность'], ['task', 'n05-demo'], ['task', 'n14-demo']];
  const { location: detail } = await tutor('/tutor/new', 303, form);
  const oldWorkLink = sharedLink((await tutor(detail, 200)).body);

  const learner = browser();
  const { location: today } = await learner(oldWorkLink, 303);
  const workPath = '/learn/' + new URL(today, origin).searchParams.get('work');
  assert.match((await learner(today, 200)).body, /Начать работу/);
  const { location: first } = await learner(workPath, 303);
  assert.doesNotMatch((await learner(first, 200)).body, /Верно: личность/);
  const acceptJson = { headers: { Accept: 'application/json' } };
  await learner(first, 200, { answer: '2', revision: '0' }, acceptJson);
  await learner(first, 409, { answer: '1', revision: '0' }, acceptJson);

  const secondDevice = browser();
  await secondDevice(personal, 303);
  assert.match((await secondDevice('/learn', 200)).body, /Решено 1 из 2/);
  const { location: second } = await secondDevice(workPath, 303);
  assert.match((await secondDevice(second, 200)).body, /учиться добросовестно/);
  const { location: review } = await secondDevice(second, 303, { answer: '22112', revision: '0' });
  await secondDevice(review, 409, { revision: '1' });
  await secondDevice(review, 303, { revision: '2' });
  await secondDevice(review, 303, { revision: '2' });
  const result = await secondDevice(workPath, 200);
  assert.match(result.body, /Частично верно · 1 из 2/);
  assert.match((await tutor(detail, 200)).body, /2 из 3 баллов/);

  const { location: renewed } = await tutor(studentPath, 303, { version: '0' });
  const newPersonal = sharedLink((await tutor(renewed, 200)).body);
  assert.notEqual(newPersonal, personal);
  await tutor(studentPath, 303, { version: '0' });
  assert.equal(sharedLink((await tutor(studentPath, 200)).body), newPersonal);
  await learner(personal, 404);
  await learner(oldWorkLink, 404);
  await secondDevice(workPath, 401);
  const { location: anotherStudent } = await tutor('/tutor/students', 303, { name: 'Тимур С.' });
  await learner(sharedLink((await tutor(anotherStudent, 200)).body), 303);
  await learner(workPath, 404);

  await stop();
  await start();
  await secondDevice(newPersonal, 303);
  assert.match((await secondDevice(workPath, 200)).body, /Работа сдана/);
  assert.match((await tutor(detail, 200)).body, /2 из 3 баллов/);
});
