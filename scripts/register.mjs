import { createHash } from 'node:crypto';
import { open, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { validateEntry } from './validate.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const panels = {
  go2: { repo: 'robo-boy-go2-control-panel', id: 'la.tessel.roboboy.go2-control' },
  microduck: { repo: 'robo-boy-microduck-control-panel', id: 'la.tessel.roboboy.microduck-control' },
};
const origins = new Set(['https://github.com', 'https://objects.githubusercontent.com', 'https://release-assets.githubusercontent.com']);

async function download(url, limit) {
  for (let redirects = 0; redirects <= 5; redirects++) {
    const target = new URL(url);
    if (!origins.has(target.origin) || target.username || target.password) throw new Error('Unapproved release origin.');
    const response = await fetch(target, { redirect: 'manual', credentials: 'omit', signal: AbortSignal.timeout(30000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new Error('Release redirect has no location.');
      url = new URL(location, target).href;
      continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Anonymous release download failed: HTTP ${response.status}`); }
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > limit) { await response.body.cancel().catch(() => {}); throw new Error('Release exceeds size limit.'); }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  throw new Error('Too many release redirects.');
}

export async function releaseEntry(panel, version) {
  const spec = panels[panel];
  if (!spec || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version ?? '')) {
    throw new Error('Use --panel go2|microduck --version <released SemVer>.');
  }
  const repository = `https://github.com/tessel-la/${spec.repo}`;
  const base = `${repository}/releases/download/v${version}`;
  const manifest = JSON.parse((await download(`${base}/roboboy.panel.json`, 256 * 1024)).toString('utf8'));
  if (manifest.schemaVersion !== 1 || manifest.id !== spec.id || manifest.version !== version || manifest.repository !== repository) {
    throw new Error('Released manifest identity/version/repository does not match the requested panel.');
  }
  if (manifest.entryPoint !== './dist/index.js' || manifest.assets?.length) throw new Error('Expected one self-contained panel bundle.');
  const bundle = await download(`${base}/index.js`, 5 * 1024 * 1024);
  const integrity = `sha256-${createHash('sha256').update(bundle).digest('base64')}`;
  if (integrity !== manifest.integrity) throw new Error('Released bundle SHA-256 does not match the manifest.');
  const entry = {
    schemaVersion: 1, id: manifest.id, name: manifest.name, description: manifest.description,
    repository, author: manifest.author,
    latest: {
      version, compatibility: manifest.compatibility, capabilities: manifest.capabilities,
      permissions: manifest.permissions,
      distribution: {
        type: 'javascript-bundle', manifestUrl: `${base}/roboboy.panel.json`, bundleUrl: `${base}/index.js`,
        entryPoint: 'index.js', integrity,
      },
    },
    tags: manifest.tags,
  };
  validateEntry(entry);
  return entry;
}

export async function registerEntry(entry, directory = root) {
  validateEntry(entry);
  // Serialize the two-file update. New entries are installed before catalog references them.
  const lockPath = resolve(directory, '.register.lock');
  const lock = await open(lockPath, 'wx');
  const relativePath = `./panels/${entry.id}.json`;
  const entryPath = resolve(directory, relativePath);
  const catalogPath = resolve(directory, 'catalog.json');
  const temporary = [entryPath + '.tmp', catalogPath + '.tmp'];
  try {
    const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
    if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.panels)) throw new Error('Invalid catalog.');
    try {
      const previous = JSON.parse(await readFile(entryPath, 'utf8'));
      if (previous.latest.version === entry.latest.version && previous.latest.distribution.integrity !== entry.latest.distribution.integrity) {
        throw new Error('An existing release version cannot change bundle bytes.');
      }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!catalog.panels.includes(relativePath)) catalog.panels.push(relativePath);
    await writeFile(temporary[0], JSON.stringify(entry, null, 2) + '\n', { flag: 'wx' });
    await writeFile(temporary[1], JSON.stringify(catalog, null, 2) + '\n', { flag: 'wx' });
    await rename(temporary[0], entryPath);
    await rename(temporary[1], catalogPath);
  } finally {
    await Promise.all(temporary.map(path => rm(path, { force: true })));
    await lock.close();
    await rm(lockPath);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const { values } = parseArgs({ options: { panel: { type: 'string' }, version: { type: 'string' }, 'dry-run': { type: 'boolean', default: false } } });
  const entry = await releaseEntry(values.panel, values.version);
  if (values['dry-run']) console.log(JSON.stringify(entry, null, 2));
  else { await registerEntry(entry); console.log(`Registered ${entry.id}@${entry.latest.version}. Run npm run validate before review.`); }
}
