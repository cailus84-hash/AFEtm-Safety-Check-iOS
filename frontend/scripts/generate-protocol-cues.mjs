// Original, deterministic UI tones. No downloaded or licensed sound recordings.
// Run manually with Node; this is not an install/build hook.
import { mkdirSync, writeFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';

const folder = new URL('../assets/audio/', import.meta.url);
mkdirSync(folder, { recursive: true });
const rate = 44100;
// [frequency Hz, duration seconds, silence after, amplitude]
const cues = {
  click: [[900, .025, .01, .08]],
  rest: [[660, .12, .035, .17], [880, .14, .025, .16]],
  target: [[740, .10, .035, .19], [988, .18, .025, .18]],
  start: [[554, .18, .025, .18]],
  checkpoint: [[784, .10, .025, .16]],
  complete: [[880, .13, .10, .18], [880, .18, .025, .17]],
  warning: [[392, .24, .025, .16]],
};
for (const [name, tones] of Object.entries(cues)) {
  const samples = [];
  for (const [hz, duration, gap, amplitude] of tones) {
    const length = Math.round(duration * rate);
    for (let i = 0; i < length; i++) {
      const envelope = Math.min(1, i / (rate * .008), (length - 1 - i) / (rate * .018));
      const phase = 2 * Math.PI * hz * i / rate;
      samples.push(Math.round(32767 * amplitude * envelope * (Math.sin(phase) + .12 * Math.sin(2 * phase)) / 1.12));
    }
    samples.push(...Array(Math.round(gap * rate)).fill(0));
  }
  const wave = Buffer.alloc(44 + samples.length * 2);
  wave.write('RIFF', 0); wave.writeUInt32LE(wave.length - 8, 4); wave.write('WAVEfmt ', 8);
  wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(rate, 24); wave.writeUInt32LE(rate * 2, 28);
  wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34); wave.write('data', 36);
  wave.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((sample, i) => wave.writeInt16LE(sample, 44 + i * 2));
  writeFileSync(new URL(`${name}.wav`, folder), wave);
}
