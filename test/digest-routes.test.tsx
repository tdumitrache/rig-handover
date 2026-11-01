import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow } from '../src/digest/types.js';

const line = (job: string, status: string, at: string) =>
  JSON.stringify({ at, job, status, owner: 'ana' });

let tmp: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  // Jobs are written out of order on purpose: rows must come back sorted by job.
  writeFileSync(
    join(tmp, '2026-01-01.jsonl'),
    [
      line('zeta-sync', 'ok', '2026-01-01T01:00:00+01:00'),
      line('alpha-backup', 'retry', '2026-01-01T02:00:00+01:00'),
      line('alpha-backup', 'ok', '2026-01-01T02:05:00+01:00'),
      line('mid-report', 'fail', '2026-01-01T03:00:00+01:00'),
    ].join('\n') + '\n',
  );
  writeFileSync(join(tmp, '2026-01-02.jsonl'), '');
  writeFileSync(
    join(tmp, '2026-01-03.jsonl'),
    [
      line('zeta-sync', 'ok', '2026-01-03T01:00:00+01:00'),
      'this is not json',
      line('alpha-backup', 'ok', '2026-01-03T02:00:00+01:00'),
    ].join('\n') + '\n',
  );
  app = createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir: tmp,
  });
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

type Body = { night: string; rows: DigestRow[]; badLines: number };
const jobs = (rows: DigestRow[]) => rows.map((r) => r.job);

describe('GET /digest/:night', () => {
  it('answers 200 for a night with a file, rows sorted by job', async () => {
    const res = await app.request('/digest/2026-01-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    const a = html.indexOf('alpha-backup');
    const m = html.indexOf('mid-report');
    const z = html.indexOf('zeta-sync');
    expect(a).toBeGreaterThan(-1);
    expect(a).toBeLessThan(m);
    expect(m).toBeLessThan(z);
  });

  it('answers 404 for a night with no file', async () => {
    const res = await app.request('/digest/2026-01-09');
    expect(res.status).toBe(404);
  });

  it('says "nothing ran" for an empty file', async () => {
    const res = await app.request('/digest/2026-01-02');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('still answers 200 with the good jobs when a line is malformed', async () => {
    const res = await app.request('/digest/2026-01-03');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('alpha-backup');
    expect(html).toContain('zeta-sync');
  });
});

describe('GET /api/digest/:night', () => {
  it('answers 200 with { night, rows, badLines }', async () => {
    const res = await app.request('/api/digest/2026-01-01');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    expect(body.night).toBe('2026-01-01');
    expect(body.badLines).toBe(0);
    expect(jobs(body.rows)).toEqual(['alpha-backup', 'mid-report', 'zeta-sync']);
    expect(body.rows[0]).toMatchObject({ runs: 2, retries: 1, lastStatus: 'ok', owner: 'ana' });
  });

  it('answers 404 for a night with no file', async () => {
    const res = await app.request('/api/digest/2026-01-09');
    expect(res.status).toBe(404);
  });

  it('gives no rows and no bad lines for an empty file', async () => {
    const res = await app.request('/api/digest/2026-01-02');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });

  it('counts a bad line and keeps the good rows', async () => {
    const res = await app.request('/api/digest/2026-01-03');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    expect(body.badLines).toBe(1);
    expect(jobs(body.rows)).toEqual(['alpha-backup', 'zeta-sync']);
  });
});

describe('page and JSON agree', () => {
  it.each(['2026-01-01', '2026-01-03'])('lists the same jobs in the same order for %s', async (night) => {
    const body = (await (await app.request(`/api/digest/${night}`)).json()) as Body;
    const html = await (await app.request(`/digest/${night}`)).text();
    let prev = -1;
    for (const job of jobs(body.rows)) {
      const at = html.indexOf(job);
      expect(at).toBeGreaterThan(prev);
      prev = at;
    }
  });
});
