import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { ProtocolCueQueue } from '../src/audio/protocolCueQueue.ts';

function fixture() {
  const played = [];
  let finish = () => {};
  const queue = new ProtocolCueQueue(cue => {
    played.push(cue);
    return new Promise(resolve => { finish = resolve; });
  }, () => finish());
  return { queue, played, finish: async () => { finish(); await Promise.resolve(); } };
}

test('audio queues target then start without blocking caller; repeats are deduplicated', async () => {
  const f = fixture();
  f.queue.enqueue('target', 'target');
  f.queue.enqueue('start', 'start');
  f.queue.enqueue('target', 'target');
  assert.deepEqual(f.played, ['target']);
  await f.finish();
  assert.deepEqual(f.played, ['target', 'start']);
  f.queue.dispose();
});

test('warning interrupts playback and discards queued progress/completion cues', async () => {
  const f = fixture();
  f.queue.enqueue('target', 'target');
  f.queue.enqueue('start', 'start');
  f.queue.enqueue('complete', '180');
  f.queue.enqueue('warning', 'invalid');
  f.queue.enqueue('warning', 'invalid');
  await f.finish();
  assert.deepEqual(f.played, ['target', 'warning']);
  f.queue.dispose();
});

test('clicks do not compete with protocol cues and distinct checkpoint keys each play once', async () => {
  const f = fixture();
  f.queue.enqueue('checkpoint', '60');
  f.queue.enqueue('click');
  f.queue.enqueue('checkpoint', '60');
  f.queue.enqueue('checkpoint', '90');
  await f.finish();
  assert.deepEqual(f.played, ['checkpoint', 'checkpoint']);
  f.queue.dispose();
});

test('unmount/cancellation stops queued sound and prevents future playback', async () => {
  const f = fixture();
  f.queue.enqueue('target');
  f.queue.enqueue('start');
  f.queue.dispose();
  f.queue.enqueue('complete');
  await f.finish();
  assert.deepEqual(f.played, ['target']);
});

test('audio failures are contained, including failed native stop', async () => {
  let calls = 0;
  const queue = new ProtocolCueQueue(async () => { calls++; throw new Error('audio missing'); },
    () => { throw new Error('native player gone'); });
  assert.doesNotThrow(() => { queue.enqueue('rest'); queue.enqueue('warning'); });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(calls, 2);
  assert.doesNotThrow(() => queue.dispose());
});

test('bundled cues are short, distinct, unclipped PCM tones with fade-in and fade-out', () => {
  const unique = new Set();
  for (const name of ['click', 'rest', 'target', 'start', 'checkpoint', 'complete', 'warning']) {
    const wave = readFileSync(new URL(`../assets/audio/${name}.wav`, import.meta.url));
    assert.equal(wave.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wave.readUInt16LE(20), 1);
    assert.equal(wave.readUInt16LE(22), 1);
    assert.equal(wave.readUInt16LE(34), 16);
    const duration = (wave.length - 44) / wave.readUInt32LE(28);
    assert.ok(duration > .02 && duration < .5);
    let peak = 0;
    for (let i = 44; i < wave.length; i += 2) peak = Math.max(peak, Math.abs(wave.readInt16LE(i)));
    assert.ok(peak > 0 && peak < 7000);
    assert.equal(wave.readInt16LE(44), 0);
    assert.equal(wave.readInt16LE(wave.length - 2), 0);
    unique.add(wave.toString('base64'));
  }
  assert.equal(unique.size, 7);
});

// Run the production audio hook against a controlled Expo player boundary.
function audioHookFixture({ missing = false, playbackFails = false } = {}) {
  const slots = [], players = new Map(), timers = new Set(), played = [];
  let cursor = 0, mounted = false, cleanup, onState;
  const audio = {
    async setAudioModeAsync() {},
    createAudioPlayer(source) {
      const name = source.split('/').pop().replace('.wav', '');
      const listeners = new Set();
      const player = {
        released: false, pauses: 0,
        async seekTo() { for (const fn of [...listeners]) fn({ didJustFinish: true }); },
        play() { if (playbackFails) throw new Error('interrupted'); played.push(name); },
        pause() { this.pauses++; },
        remove() { this.released = true; },
        addListener(_event, fn) { listeners.add(fn); return { remove: () => listeners.delete(fn) }; },
        finish() { for (const fn of [...listeners]) fn({ didJustFinish: true }); },
      };
      players.set(name, player);
      return player;
    },
  };
  const source = readFileSync(new URL('../src/hooks/useProtocolAudio.ts', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  const hook = vm.runInNewContext(`(() => { ${stripTypeScriptTypes(source)}; return useProtocolAudio; })()`, {
    ProtocolCueQueue,
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    useState(value) {
      const i = cursor++; slots[i] ??= { value };
      return [slots[i].value, next => { slots[i].value = next; }];
    },
    useCallback(fn) { return fn; },
    useEffect(fn) { if (!mounted) { mounted = true; cleanup = fn(); } },
    AppState: { currentState: 'active', addEventListener(_event, fn) { onState = fn; return { remove() {} }; } },
    require(name) {
      if (name === 'expo-audio') { if (missing) throw new Error('native module missing'); return audio; }
      return name;
    },
    setTimeout(fn) { timers.add(fn); return fn; }, clearTimeout(fn) { timers.delete(fn); },
  });
  const render = () => { cursor = 0; return hook(); };
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
  return { render, flush, players, played, timers, state: state => onState(state), close: () => cleanup() };
}

test('audio hook sequences actual player completions and ignores stale finish during seek', async () => {
  const f = audioHookFixture();
  const audio = f.render();
  audio.cue('target', 'target'); audio.cue('start', 'start');
  await f.flush();
  assert.deepEqual(f.played, ['target']);
  f.players.get('target').finish(); await f.flush();
  assert.deepEqual(f.played, ['target', 'start']);
  f.close();
  assert.equal(f.timers.size, 0);
  assert.ok([...f.players.values()].every(p => p.released));
});

test('audio hook interrupts success for a warning and cancels sound on background', async () => {
  const f = audioHookFixture();
  const audio = f.render();
  audio.cue('target'); audio.cue('start'); await f.flush();
  audio.cue('warning'); await f.flush();
  assert.deepEqual(f.played, ['target', 'warning']);
  assert.ok(f.players.get('target').pauses > 0);
  f.state('background');
  audio.cue('complete'); await f.flush();
  assert.deepEqual(f.played, ['target', 'warning']);
  assert.equal(f.timers.size, 0);
  f.close();
});

test('audio hook reports unavailable native module without throwing or queuing timers', async () => {
  const f = audioHookFixture({ missing: true });
  f.render().cue('rest'); await f.flush();
  assert.equal(f.render().unavailable, true);
  assert.equal(f.timers.size, 0);
  f.close();
});

test('audio hook contains playback errors and releases its players', async () => {
  const f = audioHookFixture({ playbackFails: true });
  f.render().cue('rest'); await f.flush();
  assert.equal(f.render().unavailable, true);
  assert.equal(f.timers.size, 0);
  f.close();
  assert.ok([...f.players.values()].every(p => p.released));
});
