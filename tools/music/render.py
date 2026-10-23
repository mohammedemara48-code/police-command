"""Render the game's Egyptian music from real recorded instrument samples (Wikimedia Commons, CC BY-SA / CC0)."""
import soundfile as sf, numpy as np
SR = 44100
rng = np.random.default_rng(7)
def load(n): x, sr = sf.read('wav/' + n + '.wav'); return x.astype(np.float64)
def cut(x, a, b, fin=0.003, fout=0.05):
    y = x[int(a*SR):int(b*SR)].copy()
    i, o = int(fin*SR), int(fout*SR)
    y[:i] *= np.linspace(0, 1, i); y[-o:] *= np.linspace(1, 0, o)
    return y / (np.abs(y).max() + 1e-9)
def shift(y, semis):
    r = 2 ** (semis / 12); n = int(len(y) / r)
    return np.interp(np.arange(n) * r, np.arange(len(y)), y)

dum = cut(load('Derbake_Grave'), 0, 0.57); tak = cut(load('Derbake_Agudo'), 0, 0.41)
riqx = load('Riq_demo'); riq = [cut(riqx, t - 0.01, t + 0.22) for t in (0.06, 0.34, 0.78, 1.18)]
sagat = cut(load('Finger_cymbals'), 1.07, 1.7, fout=0.3)
oudx = load('Oud_open_Strings')
# (sample, its pitch in MIDI): open strings D2 G2 G3 C4
OUD = [(cut(oudx, 0.30, 1.30, fout=0.3), 38.0), (cut(oudx, 1.33, 2.30, fout=0.3), 43.0),
       (cut(oudx, 4.17, 5.15, fout=0.3), 55.0), (cut(oudx, 5.16, 5.74, fout=0.2), 60.0)]
acc = {k: load(v) for k, v in {'organ': 'Registre_orgue', 'full': 'Plein_jeu_mélodéon', 'band': 'Registre_bandonéon'}.items()}

def oud_note(m, dur):
    s, p = min(OUD, key=lambda o: abs(o[1] - m))
    y = shift(s, m - p)[:int((dur + 0.25) * SR)]
    y[-int(0.04*SR):] *= np.linspace(1, 0, int(0.04*SR)); return y
def acc_note(m, dur, reg='full'):
    r = 2 ** ((m - 57) / 12)  # sample is A3
    src = acc[reg]; need = int((dur + 0.08) * SR * r) + 10
    seg = src[int(0.5*SR):int(0.5*SR) + need]
    while len(seg) < need: seg = np.concatenate([seg, src[int(1.0*SR):int(4.0*SR)]])[:need]
    y = shift(seg, m - 57)[:int((dur + 0.08) * SR)]
    a, rl = int(0.02*SR), int(0.07*SR)
    y[:a] *= np.linspace(0, 1, a); y[-rl:] *= np.linspace(1, 0, rl)
    # bellows: a little swell
    y *= 0.9 + 0.1 * np.sin(np.linspace(0, np.pi, len(y)))
    return y / (np.abs(src).max() + 1e-9)

MAQAM = {'ajam': [0, 2, 4, 5, 7, 9, 11], 'hijaz': [0, 1, 4, 5, 7, 8, 10], 'bayati': [0, 1.5, 3, 5, 7, 8, 10],
         'saba': [0, 1.5, 3, 4, 7, 8, 10], 'nahawand': [0, 2, 3, 5, 7, 8, 11], 'rast': [0, 2, 3.5, 5, 7, 9, 10.5]}
def deg(tonic, maqam, d):
    s = MAQAM[maqam]; o, i = divmod(d, 7); return tonic + 12 * o + s[i]

RHY = {  # 16 sixteenths per bar (malfuf: 8 per 2/4 bar)
    'maqsoum': 'D.T...T.D...T...', 'baladi': 'D.D...T.D...T...', 'saidi': 'D.T...D.D...T...',
    'malfuf': 'D..T..T.', 'wahda': 'D.......T.......'}
FILL = {'maqsoum': '..k.k...k.k.k.k.', 'baladi': '..k.k...k.k.k.kk', 'saidi': '..k.k.k...k.k.k.', 'malfuf': '.k..k..k', 'wahda': '....k.......k.k.'}

class Mix:
    def __init__(s, secs): s.L = np.zeros(int(secs * SR) + SR * 2); s.R = s.L.copy()
    def add(s, y, t, g, pan=0.0):
        i = max(0, int(t * SR)); j = min(len(s.L), i + len(y)); y = y[:j - i]
        s.L[i:j] += y * g * (1 - pan) ** 0.5 * 0.7071 * 1.4; s.R[i:j] += y * g * (1 + pan) ** 0.5 * 0.7071 * 1.4

def drums(m, bpm, bars, rhythm, t0=0, busy=1.0, riqg=0.35, sag=True):
    st = 60 / bpm / 4; pat, fill = RHY[rhythm], FILL[rhythm]; n = len(pat)
    for b in range(bars):
        for i in range(n):
            t = t0 + (b * n + i) * st + rng.normal(0, 0.004)
            c = pat[i]
            if c == 'D': m.add(dum, t, 0.9 * rng.uniform(0.9, 1.05), -0.05)
            elif c == 'T': m.add(tak, t, 0.55 * rng.uniform(0.85, 1.05), 0.1)
            elif fill[i] == 'k' and rng.random() < busy: m.add(tak, t, 0.22 * rng.uniform(0.7, 1.1), 0.15)
            if i % 2 == 0 and riqg: m.add(riq[(i // 2) % 4], t, riqg * (1.0 if i % 4 == 0 else 0.6), 0.35)
            if sag and i % (n // 2) == n // 4: m.add(sagat, t, 0.25, -0.4)

def play(m, notes, bpm, tonic, maqam, inst, t0=0, g=0.5, pan=0.0, oct_=0, reg='full'):
    """notes: list of (degree or None, beats)"""
    bt = 60 / bpm; t = t0
    for d, b in notes:
        if d is not None:
            p = deg(tonic, maqam, d) + 12 * oct_
            if inst == 'oud':
                m.add(oud_note(p, b * bt), t, g, pan)
                if b >= 1.5:  # oud tremolo (risha) on long notes
                    for k in range(1, int(b * 4)): m.add(oud_note(p, bt / 4), t + k * bt / 4, g * 0.45, pan)
            else: m.add(acc_note(p, b * bt * 0.97, reg), t, g, pan)
        t += b * bt
    return t

def bass(m, pattern, bpm, bars, tonic, maqam, beats_per_bar=4, g=0.45, t0=0):
    bt = 60 / bpm
    for b in range(bars):
        root = pattern[b % len(pattern)]
        for k, (d, at) in enumerate([(root, 0), (root + 4, 1.5), (root, 2), (root + 4, 3)][: (4 if beats_per_bar == 4 else 2)]):
            m.add(oud_note(deg(tonic, maqam, d) - 12, bt * 0.9), t0 + (b * beats_per_bar + at * beats_per_bar / 4) * bt, g, -0.25)

def master(m, name, loop_secs, fade=0.03):
    n = int(loop_secs * SR)
    L, R = m.L.copy(), m.R.copy()
    # fold the tail past the loop point back to the start (seamless loop)
    tail = len(L) - n
    L[:tail] += L[n:]; R[:tail] += R[n:]
    x = np.stack([L[:n], R[:n]], 1)
    # gentle room: two short reflections
    for d, gg in ((0.023, 0.18), (0.047, 0.1)):
        k = int(d * SR); x[k:] += x[:-k][:, ::-1] * gg
    x = np.tanh(x * 1.2 / (np.abs(x).max() + 1e-9)) * 0.85
    sf.write(f'out/{name}.wav', x, SR); print(name, round(loop_secs, 1), 's')

import os; os.makedirs('out', exist_ok=True)
D_, R_ = None, None

# 1) taxi / sha'bi: Salma ya Salama refrain (Sayed Darwish, 1919), maqam ajam on C, maqsoum 118 bpm, accordion lead
bpm = 118; bt = 60 / bpm; bars = 32; secs = bars * 4 * bt
m = Mix(secs)
A = [(4, 1), (4, .5), (5, .5), (6, 1), (5, 1), (4, .5), (5, .5), (4, .5), (3, .5), (2, 2),
     (2, .5), (3, .5), (4, .5), (5, .5), (4, .5), (3, .5), (2, .5), (1, .5), (0, 2), (None, 2)]
B = [(7, 1), (7, .5), (6, .5), (5, 1), (6, 1), (7, .5), (6, .5), (5, .5), (4, .5), (5, 2),
     (4, .5), (5, .5), (6, .5), (5, .5), (4, .5), (3, .5), (2, .5), (1, .5), (0, 2), (None, 2)]
song = A + A + B + A
t = 0
for rep in range(2):
    t = play(m, song, bpm, 60, 'ajam', 'acc', t0=rep * 16 * 4 * bt, g=0.55, pan=0.15, reg='full')
# oud doubles the melody an octave down in the second half
play(m, song, bpm, 60, 'ajam', 'oud', t0=16 * 4 * bt, g=0.35, pan=-0.3, oct_=-1)
bass(m, [0, 0, 4, 0, 3, 4, 0, 0], bpm, bars, 60, 'ajam')
drums(m, bpm, bars, 'maqsoum', busy=0.8)
master(m, 'taxi-salma', secs)

# 2) menu: calm oud, Zuruni kull sana marra (Sayed Darwish), ajam on G, wahda 84 bpm
bpm = 84; bt = 60 / bpm; bars = 16; secs = bars * 4 * bt
m = Mix(secs)
Z = [(4, .5), (4, .5), (5, .5), (4, .5), (3, 1), (2, 1), (1, .5), (2, .5), (3, .5), (2, .5), (1, 2),
     (1, .5), (1, .5), (2, .5), (1, .5), (0, 1), (-1, 1), (0, .5), (1, .5), (2, .5), (1, .5), (0, 2),
     (4, .5), (5, .5), (6, .5), (7, .5), (6, 1), (5, 1), (4, .5), (5, .5), (4, .5), (3, .5), (2, 2),
     (2, .5), (3, .5), (2, .5), (1, .5), (0, 1), (1, 1), (2, .5), (1, .5), (0, .5), (-1, .5), (0, 2)]
play(m, Z + Z, bpm, 55, 'ajam', 'oud', g=0.6, pan=0.05)
bass(m, [0, 4, 0, 0, 0, 4, 3, 0], bpm, bars, 55, 'ajam', g=0.3)
drums(m, bpm, bars, 'wahda', busy=0.5, riqg=0.15, sag=False)
master(m, 'menu-zuruni', secs)

# 3) police: tense, maqam hijaz on D, malfuf 2/4 at 150 bpm, organ-accordion ostinato + oud
bpm = 150; bt = 60 / bpm; bars = 48; secs = bars * 2 * bt
m = Mix(secs)
ost = [(0, .5), (1, .5), (2, .5), (1, .5)] * 2 + [(0, .5), (1, .5), (2, .5), (3, .5), (2, .5), (1, .5), (0, 1)]
for k in range(0, bars, 6): play(m, ost, bpm, 50, 'hijaz', 'oud', t0=k * 2 * bt, g=0.45, pan=-0.2)
lead = [(4, 2), (5, 1), (4, 1), (2, 2), (1, 1), (0, 1), (4, 1), (5, .5), (6, .5), (7, 2), (6, .5), (5, .5), (4, 1), (2, 2), (None, 2)]
play(m, lead + lead, bpm, 62, 'hijaz', 'acc', t0=12 * 2 * bt, g=0.5, pan=0.2, reg='organ')
drums(m, bpm, bars, 'malfuf', busy=1.0, riqg=0.3)
master(m, 'police-hijaz', secs)

# 4) free driving: saidi, maqam saba-ish bayati on D, 112 bpm, bandoneon lead (mizmar colour)
bpm = 112; bt = 60 / bpm; bars = 24; secs = bars * 4 * bt
m = Mix(secs)
S = [(0, .5), (1, .5), (2, 1), (2, .5), (3, .5), (2, .5), (1, .5), (0, 2), (None, 1), (2, .5), (3, .5), (4, 1), (3, .5), (2, .5),
     (3, .5), (2, .5), (1, .5), (0, .5), (1, 2)]
for k in range(0, bars, 4): play(m, S, bpm, 62, 'bayati', 'acc', t0=k * 4 * bt, g=0.5, reg='band')
bass(m, [0, 0, 3, 0], bpm, bars, 62, 'bayati')
drums(m, bpm, bars, 'saidi', busy=0.9, riqg=0.25)
master(m, 'free-saidi', secs)
