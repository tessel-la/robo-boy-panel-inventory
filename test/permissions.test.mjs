import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateEntry } from '../scripts/validate.mjs';

const baseline = JSON.parse(await readFile(new URL('../panels/la.tessel.roboboy.go2-control.json', import.meta.url), 'utf8'));
const entryWithRos = (ros) => {
  const entry = structuredClone(baseline);
  entry.latest.compatibility.roboboy = '>=0.20.0-alpha <1.0.0';
  entry.latest.permissions.ros = ros;
  return entry;
};

test('accepts independently declared SDK 2.3 action and control grants', () => {
  for (const ros of [
    { actions: ['/robot/move'] },
    { actions: ['/robot/*', '/navigation/**'] },
    { actions: [] },
    { control: true },
    { control: false },
    { actions: ['/robot/move'], control: true, subscribe: ['/robot/status'], services: ['/robot/reset'] },
  ]) {
    assert.doesNotThrow(() => validateEntry(entryWithRos(ros)), JSON.stringify(ros));
  }
});

test('rejects malformed, duplicate and excessive action patterns', () => {
  for (const actions of [
    null,
    '/robot/move',
    [null],
    ['relative'],
    ['/robot/move\n'],
    ['/robot/move', '/robot/move'],
    Array.from({ length: 101 }, (_, index) => `/robot/move_${index}`),
  ]) {
    assert.throws(() => validateEntry(entryWithRos({ actions })), /permissions\.ros\.actions/, JSON.stringify(actions));
  }
});

test('control grants require a boolean', () => {
  for (const control of [null, 'true', 'false', 0, 1, [], {}]) {
    assert.throws(() => validateEntry(entryWithRos({ control })), /permissions\.ros\.control/, JSON.stringify(control));
  }
});

test('action and control grants still require the ros capability and reject unknown permissions', () => {
  const entry = entryWithRos({ actions: ['/robot/move'], control: true });
  entry.latest.capabilities = ['storage'];
  assert.throws(() => validateEntry(entry), /require the ros capability/);
  assert.throws(() => validateEntry(entryWithRos({ actions: ['/robot/move'], acquire: true })), /explicit ROS permissions/);
});
