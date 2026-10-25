import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { releaseEntry, registerEntry } from '../scripts/register.mjs';

const bundle = Buffer.from('export default {};');
const manifest = {
  schemaVersion: 1, id: 'la.tessel.roboboy.go2-control', version: '1.2.3',
  name: 'Go2 Control', description: 'Control the simulator.', entryPoint: './dist/index.js',
  repository: 'https://github.com/tessel-la/robo-boy-go2-control-panel', author: { name: 'tessel·la' },
  compatibility: { panelApi: '^2.0.0', roboboy: '>=0.3.0-0 <1.0.0' },
  capabilities: ['ros'], permissions: { ros: { publish: ['/cmd_vel'] } },
  integrity: `sha256-${createHash('sha256').update(bundle).digest('base64')}`,
};
function fakeDownloads(t, data = manifest, bytes = bundle) {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'manual');
    assert.equal(new URL(url).origin, 'https://github.com');
    return new Response(String(url).endsWith('roboboy.panel.json') ? JSON.stringify(data) : bytes);
  });
}

test('derives inventory metadata from anonymously verified release bytes', async t => {
  fakeDownloads(t);
  const entry = await releaseEntry('go2', '1.2.3');
  assert.equal(entry.id, manifest.id);
  assert.equal(entry.latest.distribution.integrity, manifest.integrity);
  assert.deepEqual(entry.latest.permissions, manifest.permissions);
  assert.match(entry.latest.distribution.bundleUrl, /\/v1\.2\.3\/index\.js$/);
});

test('rejects changed bundle bytes before registration', async t => {
  fakeDownloads(t, manifest, Buffer.from('tampered'));
  await assert.rejects(releaseEntry('go2', '1.2.3'), /SHA-256/);
});

test('rejects mismatched manifest identity', async t => {
  fakeDownloads(t, { ...manifest, id: 'wrong' });
  await assert.rejects(releaseEntry('go2', '1.2.3'), /identity/);
});

test('rejects private releases and unapproved redirect origins', async t => {
  const mocked = t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 404 }));
  await assert.rejects(releaseEntry('microduck', '1.0.0'), /HTTP 404/);
  mocked.mock.mockImplementation(async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } }));
  await assert.rejects(releaseEntry('go2', '1.2.3'), /Unapproved/);
});

test('registration preserves other entries and refuses concurrent writes', async t => {
  fakeDownloads(t);
  const entry = await releaseEntry('go2', '1.2.3');
  const dir = await mkdtemp(join(tmpdir(), 'inventory-register-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'panels'));
  await writeFile(join(dir, 'catalog.json'), JSON.stringify({ schemaVersion: 1, panels: ['./panels/hello.json'] }));
  await writeFile(join(dir, '.register.lock'), 'busy');
  await assert.rejects(registerEntry(entry, dir), { code: 'EEXIST' });
  await rm(join(dir, '.register.lock'));
  await registerEntry(entry, dir);
  const catalog = JSON.parse(await readFile(join(dir, 'catalog.json')));
  assert.deepEqual(catalog.panels, ['./panels/hello.json', `./panels/${entry.id}.json`]);
  await registerEntry(entry, dir);
  assert.deepEqual(JSON.parse(await readFile(join(dir, 'catalog.json'))).panels, catalog.panels);
  entry.latest.distribution.integrity = `sha256-${'A'.repeat(43)}=`;
  await assert.rejects(registerEntry(entry, dir), /cannot change bundle/);
});
