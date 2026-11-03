/** Small audio tools that run on the phone: FFT, pitch-keeping time stretch, noise reduction and voice effects. */

/** In-place radix-2 FFT. Length must be a power of two. */
export function fftReal(re: Float32Array, im: Float32Array, inverse = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const u = i + j, v = u + len / 2;
        const xr = re[v] * cr - im[v] * ci, xi = re[v] * ci + im[v] * cr;
        re[v] = re[u] - xr; im[v] = im[u] - xi;
        re[u] += xr; im[u] += xi;
        const nc = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nc;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

/** WSOLA time stretch: rate 2 plays twice as fast at the same pitch. */
export function stretch(input: Float32Array, rate: number, sr: number): Float32Array {
  if (Math.abs(rate - 1) < 0.01 || input.length === 0) return input;
  const W = Math.round(sr * 0.03), HOP_OUT = W >> 1, SEEK = Math.round(sr * 0.012);
  const hopIn = HOP_OUT * rate;
  const outLen = Math.ceil(input.length / rate) + W;
  const out = new Float32Array(outLen), norm = new Float32Array(outLen);
  const win = new Float32Array(W);
  for (let i = 0; i < W; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / W);
  let prevEnd = 0;
  for (let k = 0; ; k++) {
    const target = Math.round(k * hopIn), pos = k * HOP_OUT;
    if (target >= input.length || pos + W > outLen) break;
    // Finds the nearby slice that best continues the last one, so voices do not warble.
    let best = target;
    if (k > 0) {
      let bestScore = -Infinity;
      const from = Math.max(0, target - SEEK), to = Math.min(input.length - W, target + SEEK);
      for (let c = from; c < to; c += 2) {
        let s = 0;
        for (let i = 0; i < HOP_OUT; i += 4) s += input[c + i] * input[prevEnd + i];
        if (s > bestScore) { bestScore = s; best = c; }
      }
    }
    for (let i = 0; i < W && best + i < input.length; i++) { out[pos + i] += input[best + i] * win[i]; norm[pos + i] += win[i]; }
    prevEnd = Math.min(input.length - W - 1, best + HOP_OUT);
    if (prevEnd < 0) break;
  }
  const len = Math.round(input.length / rate);
  for (let i = 0; i < len; i++) if (norm[i] > 1e-3) out[i] /= norm[i];
  return out.subarray(0, len);
}

/** Changes pitch without changing length, by stretching and then resampling. */
export function shiftPitch(input: Float32Array, semitones: number, sr: number) {
  const ratio = Math.pow(2, semitones / 12);
  const stretched = stretch(input, 1 / ratio, sr);
  const out = new Float32Array(input.length);
  for (let i = 0; i < out.length; i++) {
    const p = i * ratio, a = Math.floor(p), f = p - a;
    out[i] = (stretched[a] ?? 0) * (1 - f) + (stretched[a + 1] ?? 0) * f;
  }
  return out;
}

/** Spectral noise reduction: learns the steady noise from the quietest moments and removes it. */
export function denoise(input: Float32Array): Float32Array {
  const N = 2048, H = N >> 1;
  if (input.length < N * 4) return input;
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = Math.sin((Math.PI * (i + 0.5)) / N);
  const re = new Float32Array(N), im = new Float32Array(N);
  const frames = Math.floor((input.length - N) / H);
  const energy = new Float32Array(frames);
  for (let f = 0; f < frames; f++) { let s = 0; for (let i = 0; i < N; i += 8) s += input[f * H + i] ** 2; energy[f] = s; }
  const order = Array.from(energy.keys()).sort((a, b) => energy[a] - energy[b]);
  const quiet = order.slice(0, Math.max(4, Math.floor(frames * 0.12)));
  const noise = new Float32Array(N / 2 + 1);
  for (const f of quiet) {
    for (let i = 0; i < N; i++) { re[i] = input[f * H + i] * win[i]; im[i] = 0; }
    fftReal(re, im);
    for (let k = 0; k <= N / 2; k++) noise[k] += Math.hypot(re[k], im[k]);
  }
  for (let k = 0; k <= N / 2; k++) noise[k] /= quiet.length;
  const out = new Float32Array(input.length);
  const prevGain = new Float32Array(N / 2 + 1).fill(1);
  for (let f = 0; f <= frames; f++) {
    const off = f * H;
    for (let i = 0; i < N; i++) { re[i] = (input[off + i] ?? 0) * win[i]; im[i] = 0; }
    fftReal(re, im);
    for (let k = 0; k <= N / 2; k++) {
      const mag = Math.hypot(re[k], im[k]) + 1e-9;
      const g0 = Math.max(0.06, 1 - (2.2 * noise[k]) / mag);
      // Smoothing over time avoids the watery sound simple noise gates leave behind.
      const g = Math.max(g0, prevGain[k] * 0.72);
      prevGain[k] = g;
      re[k] *= g; im[k] *= g;
      if (k > 0 && k < N / 2) { re[N - k] = re[k]; im[N - k] = -im[k]; }
    }
    fftReal(re, im, true);
    for (let i = 0; i < N && off + i < out.length; i++) out[off + i] += re[i] * win[i];
  }
  return out;
}

export function voiceEffect(input: Float32Array, kind: string, sr: number): Float32Array {
  switch (kind) {
    case 'ingichka': return shiftPitch(input, 6, sr);
    case 'yogon': return shiftPitch(input, -5, sr);
    case 'robot': { const o = new Float32Array(input.length); for (let i = 0; i < o.length; i++) o[i] = input[i] * Math.sin((2 * Math.PI * 55 * i) / sr) * 1.4; return o; }
    case 'aks': {
      const d = Math.round(sr * 0.28), o = new Float32Array(input.length + d * 3);
      o.set(input);
      for (let i = 0; i < o.length - d; i++) o[i + d] += o[i] * 0.42;
      return o.subarray(0, input.length);
    }
    case 'zal': {
      // A short bank of feedback delays gives the sound of a large room.
      const o = new Float32Array(input.length);
      o.set(input);
      for (const [ms, g] of [[29.7, 0.5], [37.1, 0.46], [41.1, 0.42], [43.7, 0.4]] as const) {
        const d = Math.round((sr * ms) / 1000);
        const line = new Float32Array(input.length);
        for (let i = 0; i < input.length; i++) line[i] = input[i] + (i >= d ? line[i - d] * g : 0);
        for (let i = 0; i < input.length; i++) o[i] += line[i] * 0.22;
      }
      return o;
    }
    default: return input;
  }
}
