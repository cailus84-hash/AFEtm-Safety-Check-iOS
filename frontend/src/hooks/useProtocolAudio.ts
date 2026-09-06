import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { AudioPlayer } from 'expo-audio';
import { ProtocolCueQueue, type ProtocolCue } from '../audio/protocolCueQueue';

const assets: Record<ProtocolCue, number> = {
  click: require('../../assets/audio/click.wav'),
  rest: require('../../assets/audio/rest.wav'),
  target: require('../../assets/audio/target.wav'),
  start: require('../../assets/audio/start.wav'),
  checkpoint: require('../../assets/audio/checkpoint.wav'),
  complete: require('../../assets/audio/complete.wav'),
  warning: require('../../assets/audio/warning.wav'),
};

export function useProtocolAudio() {
  const queue = useRef<ProtocolCueQueue | null>(null);
  const active = useRef(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let disposed = false;
    let cancelPlayback = () => {};
    const players: Partial<Record<ProtocolCue, AudioPlayer>> = {};
    let ready: Promise<void>;
    try {
      // A legacy binary may not contain ExpoAudio. Keep acquisition and visual
      // instructions available instead of throwing during module evaluation.
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- Optional native module must load inside this try/catch.
      const audio: typeof import('expo-audio') = require('expo-audio');
      ready = audio.setAudioModeAsync({
        allowsRecording: false, playsInSilentMode: true,
        shouldPlayInBackground: false, interruptionMode: 'mixWithOthers',
      });
      // Attach rejection handling immediately, even if no cue is ever requested.
      void ready.catch(() => { if (!disposed) setUnavailable(true); });
      for (const name of Object.keys(assets) as ProtocolCue[]) {
        players[name] = audio.createAudioPlayer(assets[name], { updateInterval: 50 });
      }
    } catch {
      ready = Promise.resolve();
      setUnavailable(true);
    }

    const play = (name: ProtocolCue) => new Promise<void>(resolve => {
      const player = players[name];
      if (disposed || !active.current || !player) { resolve(); return; }
      let finished = false;
      let started = false;
      let listener: { remove(): void } | undefined;
      let watchdog: ReturnType<typeof setTimeout> | undefined;
      const finish = (failed = false) => {
        if (finished) return;
        finished = true;
        if (watchdog) clearTimeout(watchdog);
        try { listener?.remove(); } catch { /* Released/interrupted subscription. */ }
        try { player.pause(); } catch { /* Released/interrupted player. */ }
        if (failed && !disposed) setUnavailable(true);
        resolve();
      };
      cancelPlayback = () => finish();
      // Playback-only timeout, never used as a protocol or checkpoint clock.
      watchdog = setTimeout(() => finish(true), 2500);
      void ready.then(async () => {
        if (finished || disposed || !active.current) { finish(); return; }
        listener = player.addListener('playbackStatusUpdate', status => {
          if (started && status.didJustFinish) finish();
        });
        await player.seekTo(0);
        if (finished || disposed || !active.current) { finish(); return; }
        started = true;
        player.play();
      }).catch(() => finish(true));
    });

    const cues = new ProtocolCueQueue(play, () => cancelPlayback());
    queue.current = cues;
    const subscription = AppState.addEventListener('change', state => {
      active.current = state === 'active';
      if (!active.current) cues.cancel();
    });
    return () => {
      disposed = true;
      cues.dispose();
      queue.current = null;
      subscription.remove();
      for (const player of Object.values(players)) {
        try { player?.remove(); } catch { /* Already released by the platform. */ }
      }
    };
  }, []);

  const cue = useCallback((name: ProtocolCue, key?: string) => {
    if (active.current) queue.current?.enqueue(name, key);
  }, []);

  return { cue, unavailable };
}
