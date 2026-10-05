import { pastikanTz } from './tz';

test('defaults TZ to Asia/Jakarta when unset', () => {
  const env: NodeJS.ProcessEnv = {};
  expect(pastikanTz(env)).toBe('Asia/Jakarta');
  expect(env.TZ).toBe('Asia/Jakarta');
});

test('keeps an explicit TZ', () => {
  const env: NodeJS.ProcessEnv = { TZ: 'Asia/Makassar' };
  expect(pastikanTz(env)).toBe('Asia/Makassar');
});
