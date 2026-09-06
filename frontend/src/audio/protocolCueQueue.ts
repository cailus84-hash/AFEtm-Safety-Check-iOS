export type ProtocolCue = 'click' | 'rest' | 'target' | 'start' | 'checkpoint' | 'complete' | 'warning';

// Presentation only. Nothing in this queue controls protocol timing or samples.
export class ProtocolCueQueue {
  private pending: ProtocolCue[] = [];
  private seen = new Set<string>();
  private revision = 0;
  private running = false;
  private disposed = false;

  private play: (cue: ProtocolCue) => Promise<void>;
  private stopPlayback: () => void;

  constructor(play: (cue: ProtocolCue) => Promise<void>, stopPlayback: () => void) {
    this.play = play;
    this.stopPlayback = stopPlayback;
  }

  enqueue(cue: ProtocolCue, key?: string) {
    if (this.disposed || (key && this.seen.has(key))) return;
    // Clicks never compete with a protocol instruction.
    if (cue === 'click' && (this.running || this.pending.length)) return;
    if (key) this.seen.add(key);
    if (cue === 'warning') this.cancel();
    this.pending.push(cue);
    void this.drain();
  }

  cancel() {
    this.revision++;
    this.pending = [];
    this.running = false;
    try { this.stopPlayback(); } catch { /* Playback failure cannot interrupt the protocol. */ }
  }

  dispose() { this.disposed = true; this.cancel(); }

  private async drain() {
    if (this.running || this.disposed) return;
    this.running = true;
    const revision = this.revision;
    while (this.pending.length && !this.disposed && revision === this.revision) {
      const cue = this.pending.shift()!;
      try { await this.play(cue); } catch { /* Audio failure must never affect acquisition. */ }
    }
    if (revision === this.revision) this.running = false;
  }
}
