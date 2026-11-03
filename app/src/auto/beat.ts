import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from 'mediabunny';

export interface BeatInfo { bpm: number; beats: number[]; strong: number[]; duration: number }

/** Finds the tempo and beat grid of a song from its low-frequency energy flux. Runs on the device. */
export async function detectBeats(blob: Blob): Promise<BeatInfo> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw new Error('Faylda ovoz topilmadi');
    const hop = 512;
    const sink = new AudioBufferSink(track);
    const env: number[] = [];
    let sr = 44100, sum = 0, n = 0, lp = 0, duration = 0;
    for await (const { buffer, timestamp, duration: d } of sink.buffers()) {
      sr = buffer.sampleRate;
      duration = Math.max(duration, timestamp + d);
      const a = buffer.getChannelData(0);
      const alpha = 0.12;
      for (let i = 0; i < a.length; i++) {
        lp += alpha * (a[i] - lp);
        // Blend of bass energy and overall energy, so kicks dominate without losing snares.
        sum += lp * lp * 2 + a[i] * a[i] * 0.5;
        if (++n >= hop) { env.push(Math.sqrt(sum / n)); sum = 0; n = 0; }
      }
    }
    if (env.length < 40) return { bpm: 120, beats: [], strong: [], duration };
    const fr = sr / hop;
    const flux = new Float32Array(env.length);
    for (let i = 1; i < env.length; i++) flux[i] = Math.max(0, env[i] - env[i - 1]);
    // Remove the local average, so loud passages do not swamp quiet ones.
    const win = Math.round(fr * 0.5);
    const on = new Float32Array(env.length);
    let acc = 0;
    for (let i = 0; i < flux.length; i++) {
      acc += flux[i];
      if (i >= win) acc -= flux[i - win];
      on[i] = Math.max(0, flux[i] - (acc / Math.min(i + 1, win)) * 1.15);
    }
    // Comb-filtered autocorrelation: a true tempo also lines up at 2, 3 and 4 beats, which rules out
    // the 3:2 mistakes that syncopated drum patterns cause in a plain autocorrelation.
    const minLag = Math.floor((fr * 60) / 190), maxLag = Math.ceil((fr * 60) / 60);
    const span = Math.min(on.length, Math.round(fr * 120));
    const ac = new Float32Array(maxLag * 4 + 2);
    for (let lag = minLag; lag < ac.length; lag++) {
      let s = 0;
      for (let i = lag; i < span; i++) s += on[i] * on[i - lag];
      ac[lag] = s / Math.max(1, span - lag);
    }
    let best = 0, bestLag = Math.round(fr / 2);
    for (let lag = minLag; lag <= maxLag; lag++) {
      let s = 0;
      for (let k = 1; k <= 4; k++) {
        const c = lag * k;
        s += Math.max(ac[c] ?? 0, ac[c - 1] ?? 0, ac[c + 1] ?? 0) * (k === 1 ? 1 : 0.8);
      }
      const bpm = (fr * 60) / lag;
      s *= Math.exp(-Math.pow(Math.log2(bpm / 115), 2) * 0.5);
      if (s > best) { best = s; bestLag = lag; }
    }
    // Refine the fractional period over the whole song, since whole-number lags drift on long tracks.
    let period = bestLag, bestScore = -1, bestPhase = 0;
    for (let lag = bestLag - 1; lag <= bestLag + 1; lag += 0.02) {
      const phases = Math.ceil(lag);
      for (let ph = 0; ph < phases; ph += 1) {
        let s = 0;
        for (let x = ph; x < on.length; x += lag) s += on[Math.round(x)] ?? 0;
        if (s > bestScore) { bestScore = s; period = lag; bestPhase = ph; }
      }
    }
    const beats: number[] = [];
    for (let x = bestPhase; x < on.length; x += period) beats.push(+(x / fr).toFixed(3));
    const energyAt = (time: number) => { const i = Math.round(time * fr); let m = 0; for (let k = -2; k <= 4; k++) m = Math.max(m, on[i + k] ?? 0); return m; };
    const levels = beats.map(energyAt);
    const sorted = [...levels].sort((a, b) => a - b);
    const cut = sorted[Math.floor(sorted.length * 0.6)] ?? 0;
    const strong = beats.filter((_, i) => levels[i] >= cut);
    return { bpm: Math.round((fr * 60) / period), beats, strong, duration };
  } finally { input.dispose(); }
}
