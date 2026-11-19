import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { answered, grade } from './bank.mjs';

export function openDatabase(file) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS settings (name TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, link_version INTEGER NOT NULL DEFAULT 0
    ) STRICT;
    CREATE TABLE IF NOT EXISTS assignments (
      id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id), title TEXT NOT NULL,
      note TEXT NOT NULL, due TEXT NOT NULL, created_at TEXT NOT NULL,
      submitted_at TEXT, score INTEGER, max_score INTEGER
    ) STRICT;
    CREATE INDEX IF NOT EXISTS assignments_student ON assignments(student_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS questions (
      assignment_id TEXT NOT NULL REFERENCES assignments(id), position INTEGER NOT NULL,
      task TEXT NOT NULL, answer TEXT, revision INTEGER NOT NULL DEFAULT 0, result TEXT,
      PRIMARY KEY (assignment_id, position)
    ) STRICT;
  `);
  db.exec('BEGIN IMMEDIATE');
  try {
    if (!db.prepare('PRAGMA table_info(students)').all().some(column => column.name === 'link_version')) {
      db.exec('ALTER TABLE students ADD COLUMN link_version INTEGER NOT NULL DEFAULT 0');
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    db.close();
    throw error;
  }
  db.prepare("INSERT OR IGNORE INTO settings VALUES ('session_key', ?)").run(randomBytes(32).toString('hex'));
  return db;
}

export function dataAccess(db) {
  const statement = sql => db.prepare(sql);
  const student = statement('SELECT * FROM students WHERE id = ?');
  const allStudents = statement('SELECT * FROM students ORDER BY name, id');
  const addStudent = statement('INSERT INTO students (id, name) VALUES (?, ?)');
  const rotateLink = statement('UPDATE students SET link_version = link_version + 1 WHERE id = ? AND link_version = ?');
  const addWork = statement('INSERT INTO assignments (id, student_id, title, note, due, created_at) VALUES (?, ?, ?, ?, ?, ?)');
  const addQuestion = statement('INSERT INTO questions (assignment_id, position, task) VALUES (?, ?, ?)');
  const getWork = statement('SELECT assignments.*, students.name FROM assignments JOIN students ON students.id = student_id WHERE assignments.id = ?');
  const getQuestions = statement('SELECT * FROM questions WHERE assignment_id = ? ORDER BY position');
  const recentWorks = statement(`
    SELECT assignments.*, students.name FROM assignments JOIN students ON students.id = student_id
    ORDER BY submitted_at IS NOT NULL, NULLIF(due, '') NULLS LAST, created_at DESC, assignments.id
  `);
  const studentWorks = statement(`
    SELECT assignments.*, students.name FROM assignments JOIN students ON students.id = student_id WHERE student_id = ?
    ORDER BY submitted_at IS NOT NULL, CASE WHEN submitted_at IS NULL THEN NULLIF(due, '') END NULLS LAST,
    COALESCE(submitted_at, created_at) DESC, assignments.id
  `);
  const saveAnswer = statement('UPDATE questions SET answer = ?, revision = revision + 1 WHERE assignment_id = ? AND position = ?');
  const saveResult = statement('UPDATE questions SET result = ? WHERE assignment_id = ? AND position = ?');
  const submitWork = statement('UPDATE assignments SET submitted_at = ?, score = ?, max_score = ? WHERE id = ?');

  function transaction(action) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = action();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function withQuestions(row) {
    if (!row) return null;
    const questions = getQuestions.all(row.id).map(question => ({
      position: question.position,
      task: JSON.parse(question.task),
      answer: JSON.parse(question.answer),
      revision: question.revision,
      result: JSON.parse(question.result),
    }));
    return {
      ...row,
      questions,
      done: questions.filter(question => answered(question.task, question.answer)).length,
      revision: questions.reduce((sum, question) => sum + question.revision, 0),
    };
  }

  function get(id) { return withQuestions(getWork.get(id)); }

  return {
    key: statement("SELECT value FROM settings WHERE name = 'session_key'").get().value,
    student: id => student.get(id),
    students: () => allStudents.all(),
    rotateLink: (id, version) => rotateLink.run(id, version),
    addStudent(name) {
      const id = randomUUID();
      addStudent.run(id, name);
      return id;
    },
    works: id => (id ? studentWorks.all(id) : recentWorks.all()).map(withQuestions),
    get,
    create(studentId, title, note, due, tasks) {
      return transaction(() => {
        const id = randomUUID();
        addWork.run(id, studentId, title, note, due, new Date().toISOString());
        for (const [index, task] of tasks.entries()) addQuestion.run(id, index + 1, JSON.stringify(task));
        return id;
      });
    },
    save(id, position, revision, answer) {
      return transaction(() => {
        const work = get(id);
        if (work.submitted_at) return { state: 'submitted' };
        const question = work.questions[position - 1];
        if (JSON.stringify(question.answer) === JSON.stringify(answer)) return { revision: question.revision };
        if (question.revision !== revision) return { state: 'conflict' };
        saveAnswer.run(JSON.stringify(answer), id, position);
        return { revision: question.revision + 1 };
      });
    },
    submit(id, revision) {
      return transaction(() => {
        const work = get(id);
        if (work.submitted_at) return 'submitted';
        if (work.revision !== revision || work.done !== work.questions.length) return 'conflict';
        let score = 0;
        let max = 0;
        for (const question of work.questions) {
          const result = grade(question.task, question.answer);
          score += result.score;
          max += result.max;
          saveResult.run(JSON.stringify(result), id, question.position);
        }
        submitWork.run(new Date().toISOString(), score, max, id);
        return 'submitted';
      });
    },
  };
}
