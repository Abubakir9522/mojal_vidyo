# Synthesises the bundled royalty-free music and sound effects, so nothing in the app has licensing strings attached.
import numpy as np, subprocess, os
sr = 44100
out = 'public/music'; os.makedirs(out, exist_ok=True)
sfx = 'public/sfx'; os.makedirs(sfx, exist_ok=True)
rng = np.random.default_rng(7)

def note(f, d, kind='saw', a=.005, r=.08, g=1.0):
    n = int(d * sr); t = np.arange(n) / sr
    if kind == 'sine': w = np.sin(2*np.pi*f*t)
    elif kind == 'tri': w = 2*np.abs(2*((f*t) % 1)-1)-1
    elif kind == 'square': w = np.sign(np.sin(2*np.pi*f*t))*.6
    elif kind == 'pluck': w = np.sin(2*np.pi*f*t)*np.exp(-t*5)+.4*np.sin(4*np.pi*f*t)*np.exp(-t*9)
    else:
        w = sum(np.sin(2*np.pi*f*k*t)/k for k in range(1, 8))*.5
    env = np.minimum(1, t/a) * np.minimum(1, (d-t)/r)
    return w*env*g

def kick(g=1.0):
    n = int(.28*sr); t = np.arange(n)/sr
    return np.sin(2*np.pi*(50*t+ 18*(1-np.exp(-t*30))))*np.exp(-t*11)*g
def snare(g=.5):
    n = int(.2*sr); t = np.arange(n)/sr
    return (rng.standard_normal(n)*.7+.3*np.sin(2*np.pi*190*t))*np.exp(-t*18)*g
def hat(g=.22, d=.05):
    n = int(d*sr); t = np.arange(n)/sr
    x = rng.standard_normal(n); x = np.diff(x, prepend=0)
    return x*np.exp(-t*70)*g

def put(b, s, t):
    i = int(t*sr); j = min(len(b), i+len(s))
    if i < len(b): b[i:j] += s[:j-i]

def hz(m): return 440*2**((m-69)/12)

def track(name, bpm, prog, scale_steps, drums, pad='saw', lead='pluck', bars=16, swing=0, lead_g=.22, pad_g=.09, bass_g=.3):
    beat = 60/bpm; bar = beat*4; L = int((bars*bar)*sr)+sr
    mix = np.zeros(L); r2 = np.random.default_rng(abs(hash(name)) % 2**32 if False else sum(map(ord, name)))
    for b in range(bars):
        root = prog[b % len(prog)]; t0 = b*bar
        chord = [root, root+(3 if (b % len(prog)) % 2 else 4), root+7, root+12]
        for m in chord: put(mix, note(hz(m+12), bar, pad, a=.08, r=.3, g=pad_g), t0)
        # Bass follows the beat grid.
        for k in range(8):
            if drums['bass'][k % len(drums['bass'])]: put(mix, note(hz(root-12), beat/2*.9, 'tri', g=bass_g), t0+k*beat/2)
        if drums['kick']:
            for k in range(16):
                t = t0+k*beat/4
                if drums['kick'][k % len(drums['kick'])]: put(mix, kick(.85), t)
                if drums['snare'][k % len(drums['snare'])]: put(mix, snare(), t)
                if drums['hat'][k % len(drums['hat'])]: put(mix, hat(), t+(swing*beat/4 if k % 2 else 0))
        # A short melodic phrase over the chord, picked from the scale and repeated every other bar.
        if b >= 2:
            seed = (b % 4)*17+sum(map(ord, name))
            rr = np.random.default_rng(seed)
            for k in range(8):
                if rr.random() < drums['lead']:
                    put(mix, note(hz(root+24+int(rr.choice(scale_steps))), beat/2*1.4, lead, r=.1, g=lead_g), t0+k*beat/2)
    # A short room echo adds depth.
    d = int(.27*sr); wet = np.zeros_like(mix); wet[d:] = mix[:-d]*.22
    mix = mix+wet
    mix /= max(1e-6, np.abs(mix).max())*1.12
    # Fade the ending so the loop point is clean.
    e = int(.25*sr); mix[-e:] *= np.linspace(1, 0, e)
    return mix

D = lambda kick, snare, hat, bass, lead: dict(kick=kick, snare=snare, hat=hat, bass=bass, lead=lead)
four = [1,0,0,0]*4; back = [0,0,0,0,1,0,0,0]*2; hats8 = [0,0,1,0]*4; hats16 = [1]*16
tracks = {
  'kuch':   (128, [45,45,41,43], [0,3,5,7,10], D(four, back, hats16, [1,1,1,1,1,1,1,1], .55), {'lead':'saw','lead_g':.14}),
  'quvnoq': (118, [48,53,55,48], [0,2,4,7,9], D([1,0,0,0,0,0,1,0,1,0,0,0,0,0,0,0], back, hats8, [1,0,1,0,1,0,1,1], .6), {}),
  'sokin':  (72,  [48,43,45,41], [0,2,4,7,9], D([], [], [], [1,0,0,0,1,0,0,0], .35), {'pad':'sine','pad_g':.2,'lead_g':.3,'bass_g':.2}),
  'bayram': (110, [50,55,57,50], [0,2,4,5,7,9], D([1,0,0,1,0,0,1,0,1,0,0,1,0,0,1,0], back, hats8, [1,0,1,0,1,1,1,0], .65), {'lead':'square','lead_g':.1}),
  'ufq':    (96,  [43,50,52,48], [0,2,4,7,9], D(four[:8]+[0]*8, [0]*8+[1,0,0,0,0,0,0,0], hats8, [1,0,0,1,0,0,1,0], .4), {'lead_g':.26}),
  'yengil': (104, [48,45,41,43], [0,2,4,7,9], D([1,0,0,0,0,0,1,0]*2, back, [1,0,1,0]*4, [1,0,1,0,0,1,0,1], .4), {'pad':'tri','pad_g':.14}),
  'kino':   (64,  [40,36,43,38], [0,3,5,7,8], D([1]+[0]*15, [0]*16, [0]*16, [1,0,0,0,0,0,0,0], .22), {'pad':'saw','pad_g':.11,'lead':'sine','lead_g':.26,'bass_g':.36}),
  'ritm':   (140, [41,41,44,39], [0,3,5,7,10], D([1,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0], back, hats16, [1,0,0,1,0,0,1,0], .5), {'lead':'square','lead_g':.08}),
}
def write(path, a, br='96k'):
    p = subprocess.Popen(['ffmpeg','-y','-loglevel','error','-f','f32le','-ar',str(sr),'-ac','1','-i','-','-ac','2','-b:a',br,path], stdin=subprocess.PIPE)
    p.communicate(a.astype('<f4').tobytes())
for name, (bpm, prog, scale, dr, kw) in tracks.items():
    bars = max(8, int(round(40/(60/bpm*4))))
    write(f'{out}/{name}.mp3', track(name, bpm, prog, scale, dr, bars=bars, **kw))

# Sound effects.
def env_noise(d, f0, f1, g=.9):
    n = int(d*sr); t = np.arange(n)/sr; x = rng.standard_normal(n)
    fc = np.linspace(f0, f1, n); y = np.zeros(n); s = 0
    for i in range(n):
        al = min(1, 2*np.pi*fc[i]/sr); s += al*(x[i]-s); y[i] = s
    e = np.sin(np.pi*t/d)**1.5
    return y/np.abs(y).max()*e*g
sf = {
  'whoosh': env_noise(.6, 300, 6000),
  'swoosh': env_noise(.35, 5000, 500),
  'pop': np.sin(2*np.pi*(300+900*np.exp(-np.arange(int(.12*sr))/(.02*sr)))*np.arange(int(.12*sr))/sr)*np.exp(-np.arange(int(.12*sr))/(.03*sr)),
  'zarba': kick(1.0),
  'ding': note(1319, .9, 'sine', r=.7, g=.8)+note(2637, .9, 'sine', r=.5, g=.3),
  'kassa': np.concatenate([note(1568, .08, 'sine', g=.7), note(2093, .5, 'sine', r=.4, g=.8)]),
  'qarsak': sum(np.pad(snare(.5), (int(i*sr*.05), int(sr*2)))[:int(sr*2)]*rng.random() for i in range(26))*np.linspace(1, 0, int(sr*2)),
  'kulgi': sum(np.pad(note(420+i*30, .13, 'tri', g=.5), (int(i*.17*sr), 0)) [:int(1.1*sr)].__array__() if False else np.pad(note(420+(i%2)*50, .13, 'tri', g=.5), (int(i*.17*sr), int(1.1*sr)))[:int(1.1*sr)] for i in range(6)),
}
for k, v in sf.items():
    write(f'{sfx}/{k}.mp3', v/np.abs(v).max()*.9, '64k')
