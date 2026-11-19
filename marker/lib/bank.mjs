import { readdirSync, readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const directory = new URL('../../', import.meta.url);
const files = readdirSync(new URL('data/tasks/', directory)).filter(name => name.endsWith('.js')).sort();
const context = createContext({});
context.window = context;
for (const file of ['data/meta.js', ...files.map(name => 'data/tasks/' + name), 'js/check.js']) {
  runInContext(readFileSync(new URL(file, directory), 'utf8'), context, { filename: file });
}
const { BANK, NUMBERS, check } = context.OGE;
const shortTypes = new Set(['digit', 'word', 'cols', 'seq']);
export const tasks = BANK.filter(task => shortTypes.has(NUMBERS[task.n].answer))
  .map(task => ({ ...task, meta: NUMBERS[task.n] }))
  .sort((a, b) => a.n - b.n || Number(b.id.includes('-demo')) - Number(a.id.includes('-demo')) || a.id.localeCompare(b.id));
export const taskById = new Map(tasks.map(task => [task.id, task]));

export function readAnswer(task, form) {
  const read = key => (form.get(key) ?? '').trim().slice(0, 300);
  if (task.meta.answer === 'cols') return { sim: read('sim'), diff: read('diff') };
  if (task.meta.answer === 'digit') {
    const value = read('answer');
    return task.options[Number(value) - 1] && /^\d$/.test(value) ? value : '';
  }
  return read('answer');
}

export function answered(task, answer) {
  if (task.meta.answer === 'cols') return Boolean(answer?.sim && answer?.diff);
  return Boolean(answer);
}

export function grade(task, answer) {
  return check.checkShort(task, answer);
}
