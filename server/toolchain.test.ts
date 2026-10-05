import { DatabaseSync } from 'node:sqlite';

test('node:sqlite works inside Jest', () => {
  const db = new DatabaseSync(':memory:');
  const row = db.prepare('SELECT 1 AS x').get() as { x: number };
  expect(row.x).toBe(1);
});
