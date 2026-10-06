"""
Compune și „înregistrează” muzica jocului (bucle stereo, MP3), cu instrumente sintetizate:

  menu      — tema eroică (re minor): corzi, cor, alămuri, taiko, timpane.
  day_a     — zi liniștită (la minor): harpă, pad cald, flaut rar, vânt.
  day_b     — zi singuratică (re dorian): cutie muzicală, pian, violoncel.
  night_lo  — noaptea, stratul de bază: drone, bas pulsat, puls jos (mereu).
  night_hi  — noaptea, stratul de luptă (același tempo și lungime, se aude după pericol):
              taiko, corzi staccato, alămuri, toba mică.
  boss      — boss (mi frigian): cor, ostinato rapid, tobe grele, „BRAAM”.
  king      — Regele Iernii: clopot de moarte, orgă, cor jos, tobe uriașe pe jumătate de tempo.
  endless   — valul fără sfârșit: rapid, neîntrerupt, bas pe șaisprezecimi.

Fiecare buclă e randată mai lungă și coada (reverbul) e „pliată” peste început, ca bucla să
se lege perfect. Instrumentele sunt făcute din tabele de undă (fierăstrău / puls cu armonici
limitate, ca să nu „țiuie”), filtre și un reverb de sală (convoluție stereo).

Rulare:  pip install numpy scipy  &&  python3 tools/music_synth.py
Scrie fișierele în src/assets/music/ (are nevoie de ffmpeg).
"""

import os
import subprocess
import sys
import wave

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), "..", "src", "assets", "music")
rng = np.random.default_rng(23)


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


NOTES = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}


def nm(name):
    """„D3” → număr MIDI."""
    p, o = (name[:-1], int(name[-1])) if name[-1].isdigit() else (name, 4)
    return 12 * (o + 1) + NOTES[p]


# ---------------------------------------------------------------- unelte de bază

def filt(x, kind, f, order=2):
    if kind == "band":
        sos = butter(order, [f[0] / (SR / 2), min(0.99, f[1] / (SR / 2))], "bandpass", output="sos")
    else:
        sos = butter(order, min(0.99, max(1e-4, f / (SR / 2))), "lowpass" if kind == "low" else "highpass", output="sos")
    return sosfilt(sos, x, axis=-1)


_TABLES = {}


def table(kind, harmonics):
    """O perioadă dintr-o undă cu armonici limitate (fără „aliasing”)."""
    key = (kind, harmonics)
    if key not in _TABLES:
        n = 2048
        ph = np.arange(n) / n * 2 * np.pi
        w = np.zeros(n)
        for k in range(1, harmonics + 1):
            if kind == "saw":
                a = 1 / k
            elif kind == "square":
                a = (1 / k) if k % 2 else 0
            elif kind == "voice":  # puls de glotă: armonici care scad mai repede
                a = 1 / k ** 1.35
            elif kind == "organ":  # tuburi de orgă: fundamentala + octave + cvinte
                a = {1: 1, 2: 0.6, 3: 0.35, 4: 0.4, 6: 0.15, 8: 0.2}.get(k, 0)
            else:
                a = 1 / k
            w += a * np.sin(k * ph)
        w /= np.max(np.abs(w))
        _TABLES[key] = w
    return _TABLES[key]


def osc(freq, n, kind="saw", vib=0.0, vib_rate=5.0, vib_delay=0.0, phase=None, max_h=40):
    """Oscilator dintr-un tabel; `vib` = vibrato în semitonuri (cu întârziere)."""
    harmonics = int(max(1, min(max_h, 15000 / max(freq, 20))))
    tb = table(kind, harmonics)
    t = np.arange(n) / SR
    f = np.full(n, float(freq))
    if vib:
        depth = np.clip((t - vib_delay) / 0.4, 0, 1) * vib
        f = f * 2 ** (depth * np.sin(2 * np.pi * vib_rate * t + rng.uniform(0, 6)) / 12)
    ph = (phase if phase is not None else rng.uniform(0, 1)) + np.cumsum(f) / SR
    idx = (ph % 1.0) * len(tb)
    return np.interp(idx, np.arange(len(tb) + 1), np.append(tb, tb[0]))


def env(n, a, r, hold=None, curve=2.0):
    """Anvelopă: urcă în `a` secunde, ține, coboară în `r` secunde la final."""
    e = np.ones(n)
    na = max(1, int(a * SR))
    nr = max(1, int(r * SR))
    e[:na] = np.linspace(0, 1, na) ** (1 / curve) if na < n else np.linspace(0, 1, n)[:na]
    if nr < n:
        e[-nr:] *= np.linspace(1, 0, nr) ** curve
    return e


def dec(n, tau, a=0.002):
    t = np.arange(n) / SR
    return np.clip(t / a, 0, 1) * np.exp(-t / tau)


def noise(n):
    return rng.standard_normal(n)


class Track:
    """Pânza stereo pe care „cântă” instrumentele; are două trimiteri: uscat și reverb."""

    def __init__(self, bpm, bars, beats_per_bar=4, tail=3.5):
        self.bpm = bpm
        self.beat = 60 / bpm
        self.bars = bars
        self.bpb = beats_per_bar
        self.length = bars * beats_per_bar * self.beat
        self.n = int(self.length * SR)
        total = self.n + int(tail * SR)
        self.dry = np.zeros((2, total))
        self.wet = np.zeros((2, total))

    def at(self, bar, beat=0.0):
        return (bar * self.bpb + beat) * self.beat

    def add(self, x, t, pan=0.0, vol=1.0, rev=0.25):
        i = int(t * SR)
        if i >= self.dry.shape[1]:
            return
        x = x[: self.dry.shape[1] - i] * vol
        l = np.cos((pan + 1) * np.pi / 4)
        r = np.sin((pan + 1) * np.pi / 4)
        self.dry[0, i:i + len(x)] += x * l * (1 - rev * 0.5)
        self.dry[1, i:i + len(x)] += x * r * (1 - rev * 0.5)
        self.wet[0, i:i + len(x)] += x * l * rev
        self.wet[1, i:i + len(x)] += x * r * rev

    def render(self, reverb_len=2.8, reverb_damp=5000, master=1.0):
        ir = hall_ir(reverb_len, reverb_damp)
        out = self.dry.copy()
        for ch in range(2):
            w = fftconvolve(self.wet[ch], ir[ch])[: out.shape[1]]
            out[ch] += w
        # Bucla perfectă: coada de după final se adună peste început.
        loop = out[:, : self.n].copy()
        tail = out[:, self.n:]
        k = min(tail.shape[1], self.n)
        loop[:, :k] += tail[:, :k]
        # Mastering simplu: puțin „lipici” (saturație blândă) și normalizare.
        loop = loop / (np.max(np.abs(loop)) + 1e-9) * 1.25 * master
        loop = np.tanh(loop) / np.tanh(1.25)
        return loop * 0.95


_IR = {}


def hall_ir(sec, damp):
    key = (sec, damp)
    if key not in _IR:
        n = int(sec * SR)
        t = np.arange(n) / SR
        irs = []
        for ch in range(2):
            x = rng.standard_normal(n) * np.exp(-t / (sec / 6.5))
            x = filt(x, "low", damp)
            x[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))
            x /= np.sqrt(np.sum(x ** 2))
            irs.append(x * 0.9)
        _IR[key] = irs
    return _IR[key]


# ---------------------------------------------------------------- instrumente

def strings(freq, dur, a=0.35, r=0.6, bright=2600, voices=4, detune=0.09, vib=0.12):
    """Corzi (ansamblu): mai multe fierăstraie puțin dezacordate, vibrato, filtru."""
    n = int((dur + r) * SR)
    x = np.zeros(n)
    for v in range(voices):
        d = (v - (voices - 1) / 2) * detune / max(1, voices - 1) * 2
        x += osc(freq * 2 ** (d / 12), n, "saw", vib=vib, vib_rate=4.6 + v * 0.3, vib_delay=0.15)
    x = filt(x / voices, "low", bright)
    return x * env(n, a, r)


def staccato(freq, dur=0.18, bright=2400):
    n = int((dur + 0.15) * SR)
    x = osc(freq, n, "saw") + osc(freq * 1.004, n, "saw")
    x = filt(x * 0.5, "low", bright) * dec(n, dur * 0.55, 0.004)
    return x


def brass(freq, dur, vol=1.0, bright=2400):
    """Alămuri: fierăstrău; „deschiderea” filtrului la atac (amestec între întunecat și strălucitor)."""
    n = int((dur + 0.3) * SR)
    x = osc(freq, n, "saw", vib=0.08, vib_delay=0.25) + osc(freq * 1.003, n, "saw") * 0.8 + osc(freq / 2, n, "saw") * 0.3
    darkv = filt(x, "low", 450)
    brightv = filt(x, "low", bright)
    t = np.arange(n) / SR
    open_ = np.clip(t / 0.06, 0, 1) * (0.55 + 0.45 * np.exp(-t / 0.35))
    y = darkv * (1 - open_) + brightv * open_
    return np.tanh(y * 1.4) * env(n, 0.03, 0.3) * vol


def choir(freq, dur, vowel="a", voices=5, a=0.6, r=0.9):
    """Cor („aaah” / „ooo”): puls de glotă + formanți, mai multe voci cu vibrato."""
    formants = {"a": [(730, 90), (1150, 110), (2600, 160)], "o": [(450, 70), (800, 90), (2830, 160)], "u": [(325, 60), (700, 80), (2530, 150)]}[vowel]
    n = int((dur + r) * SR)
    src = np.zeros(n)
    for v in range(voices):
        src += osc(freq * 2 ** ((v - voices / 2) * 0.03 / 12), n, "voice", vib=0.18, vib_rate=5.2 + v * 0.4, vib_delay=0.3)
    src /= voices
    src += filt(noise(n), "band", (1500, 6000)) * 0.03  # respirație
    y = np.zeros(n)
    for f, bw in formants:
        y += filt(src, "band", (f - bw, f + bw), order=2) * (1.0 if f < 1000 else 0.6)
    return y * env(n, a, r) * 2.2


def pluck(freq, dur=2.5, bright=1.0):
    """Harpă / chitară: armonici care se sting tot mai repede cu cât sunt mai înalte."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for k in range(1, 14):
        f = freq * k * (1 + 0.0004 * k * k)
        if f > 16000:
            break
        y += (1 / k ** (1.4 - 0.4 * bright)) * np.sin(2 * np.pi * f * t) * np.exp(-t * (1.3 + k * 0.9))
    y *= np.clip(t / 0.003, 0, 1)
    return y


def piano(freq, dur=3.0, vel=0.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    B = 0.0003
    for k in range(1, 18):
        f = freq * k * np.sqrt(1 + B * k * k)
        if f > 15000:
            break
        y += (1 / k ** 1.1) * np.sin(2 * np.pi * f * t + rng.uniform(0, 6)) * (np.exp(-t * (0.7 + k * 0.45)) * 0.8 + 0.2 * np.exp(-t * 0.25))
    hammer = filt(noise(int(0.01 * SR)), "band", (800, 5000)) * 0.15
    y[: len(hammer)] += hammer
    return y * np.clip(t / 0.002, 0, 1) * vel


def celesta(freq, dur=2.2):
    """Cutie muzicală / celestă: sinusoide cu armonici inarmonice, clopoțel scurt."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.sin(2 * np.pi * freq * t) * np.exp(-t * 1.6)
    y += 0.35 * np.sin(2 * np.pi * freq * 4.02 * t) * np.exp(-t * 5)
    y += 0.15 * np.sin(2 * np.pi * freq * 6.7 * t) * np.exp(-t * 9)
    return y * np.clip(t / 0.002, 0, 1)


def bell(freq, dur=6.0):
    """Clopot de biserică (de moarte): parțiale inarmonice cu stingeri lungi."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for ratio, amp, tau in [(0.5, 0.6, 3.5), (1.0, 1.0, 2.8), (1.19, 0.6, 2.2), (1.5, 0.45, 1.8), (2.0, 0.55, 1.6), (2.52, 0.35, 1.1), (3.0, 0.3, 0.9), (4.1, 0.2, 0.6)]:
        y += amp * np.sin(2 * np.pi * freq * ratio * t + rng.uniform(0, 6)) * np.exp(-t / tau)
    y[: int(0.004 * SR)] *= np.linspace(0, 1, int(0.004 * SR))
    return y


def flute(freq, dur, a=0.12, r=0.3):
    n = int((dur + r) * SR)
    x = osc(freq, n, "sine" if False else "voice", vib=0.12, vib_rate=5, vib_delay=0.25, max_h=4)
    breath = filt(noise(n), "band", (freq * 0.8, freq * 3)) * 0.12
    return filt(x + breath, "low", 5000) * env(n, a, r)


def organ(freq, dur, a=0.15, r=0.8):
    n = int((dur + r) * SR)
    x = osc(freq, n, "organ", max_h=8) + osc(freq * 1.002, n, "organ", max_h=8) * 0.6
    return filt(x, "low", 3500) * env(n, a, r) * 0.6


def drone(freq, dur, bright=500):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = osc(freq, n, "saw") + osc(freq * 1.006, n, "saw") + osc(freq * 0.5, n, "saw") * 0.6
    lfo = 1 + 0.6 * np.sin(2 * np.pi * 0.08 * t + rng.uniform(0, 6))
    x = filt(x, "low", bright) * (0.7 + 0.3 * lfo)
    return x * env(n, 1.5, 1.5)


def sub(freq, dur, a=0.005, r=0.08):
    n = int((dur + r) * SR)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * freq * t) * env(n, a, r)


def bass_saw(freq, dur, bright=900):
    n = int((dur + 0.06) * SR)
    x = osc(freq, n, "saw") + osc(freq * 0.5, n, "square") * 0.5
    return np.tanh(filt(x, "low", bright) * 1.5) * env(n, 0.004, 0.06)


def taiko(vol=1.0, pitch=1.0):
    """Toba de război japoneză: piele grea (ton care coboară) + corp + lovitura bețelor."""
    n = int(1.4 * SR)
    t = np.arange(n) / SR
    f = (55 + 70 * np.exp(-t / 0.03)) * pitch
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.35)
    skin = filt(noise(n), "low", 900) * np.exp(-t / 0.05) * 0.5
    stick = filt(noise(int(0.008 * SR)), "band", (1500, 6000)) * 0.4
    y = body + skin
    y[: len(stick)] += stick
    return np.tanh(y * 1.3) * vol


def kick(vol=1.0):
    n = int(0.5 * SR)
    t = np.arange(n) / SR
    f = 48 + 110 * np.exp(-t / 0.025)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.18)
    y[: int(0.004 * SR)] += filt(noise(int(0.004 * SR)), "high", 2000) * 0.3
    return np.tanh(y * 1.6) * vol


def snare(vol=1.0, tight=1.0):
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * (185 + 40 * np.exp(-t / 0.01)) * t) * np.exp(-t / 0.06)
    rattle = filt(noise(n), "band", (1500, 9000)) * np.exp(-t / (0.12 * tight))
    return (tone * 0.6 + rattle * 0.8) * vol


def tom(freq=110, vol=1.0):
    n = int(0.8 * SR)
    t = np.arange(n) / SR
    f = freq * (1 + 0.6 * np.exp(-t / 0.03))
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.22) + filt(noise(n), "low", 1200) * np.exp(-t / 0.04) * 0.3
    return y * vol


def hat(vol=1.0, open_=False):
    n = int((0.35 if open_ else 0.08) * SR)
    t = np.arange(n) / SR
    return filt(noise(n), "high", 7500) * np.exp(-t / (0.12 if open_ else 0.022)) * vol


def shaker(vol=1.0):
    n = int(0.1 * SR)
    t = np.arange(n) / SR
    return filt(noise(n), "band", (4000, 12000)) * np.sin(np.pi * t / 0.1) ** 2 * vol


def timpani(freq, vol=1.0, roll=0.0):
    """Timpane: lovitură (sau tremolo / „roll” de `roll` secunde) cu parțialele specifice."""
    def hit():
        n = int(2.0 * SR)
        t = np.arange(n) / SR
        y = np.zeros(n)
        for ratio, amp in [(1, 1), (1.5, 0.5), (1.98, 0.35), (2.44, 0.2)]:
            y += amp * np.sin(2 * np.pi * freq * ratio * t) * np.exp(-t / (0.9 / ratio))
        y += filt(noise(n), "low", 600) * np.exp(-t / 0.03) * 0.4
        return y
    if roll <= 0:
        return hit() * vol
    n = int((roll + 2.0) * SR)
    y = np.zeros(n)
    k = 0
    for i in range(int(roll / 0.055)):
        h = hit() * (0.25 + 0.75 * (i * 0.055 / roll)) * rng.uniform(0.8, 1)
        s = int(i * 0.055 * SR)
        y[s:s + len(h)] += h[: n - s]
        k += 1
    return y * vol * 0.5


def cymbal_swell(sec, vol=1.0):
    """Cinel care crește (cu ciocănele moi) până la o lovitură: anunță o frază nouă."""
    n = int(sec * SR)
    t = np.arange(n) / SR
    return filt(noise(n), "band", (3000, 14000)) * (t / sec) ** 2.5 * vol


def crash(vol=1.0):
    n = int(3.0 * SR)
    t = np.arange(n) / SR
    return filt(noise(n), "band", (2500, 15000)) * np.exp(-t / 0.9) * vol


def braam(freq, dur=3.0, vol=1.0):
    """„BRAAM”: alămuri joase, distorsionate, care se umflă (cvinta + octava)."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = sum(osc(freq * m * 2 ** (d / 1200), n, "saw") * a for m, d, a in [(1, -8, 1), (1, 7, 1), (1.5, 0, 0.6), (0.5, 0, 0.8), (2, 4, 0.4)])
    darkv = filt(x, "low", 220)
    brightv = filt(x, "low", 1400)
    o = np.clip(t / 0.25, 0, 1) * np.exp(-t / (dur * 0.5))
    y = darkv * (1 - o) + brightv * o
    return np.tanh(y * 1.2) * env(n, 0.08, dur * 0.5) * vol


def riser(sec, vol=1.0):
    n = int(sec * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    x = noise(n)
    hop = 2048
    for i in range(0, n, hop):
        k = i / n
        f = 300 + 5000 * k ** 2
        seg = filt(x[max(0, i - 2048): i + hop], "band", (f * 0.7, f * 1.4))[-hop:]
        out[i:i + len(seg)] = seg[: n - i]
    return out * (t / sec) ** 2 * vol


def wind(sec, vol=1.0):
    n = int(sec * SR)
    t = np.arange(n) / SR
    x = filt(noise(n), "band", (250, 900)) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.09 * t + 1)) * (0.7 + 0.3 * np.sin(2 * np.pi * 0.23 * t))
    return x * vol


# ---------------------------------------------------------------- acorduri

def chord_notes(root, kind, octave_base):
    """Notele unui acord (MIDI): root = „D”, kind = m / M / dim / sus / m7 / M7."""
    r = 12 * (octave_base + 1) + NOTES[root]
    iv = {"m": [0, 3, 7], "M": [0, 4, 7], "dim": [0, 3, 6], "sus": [0, 5, 7], "m7": [0, 3, 7, 10], "M7": [0, 4, 7, 11], "5": [0, 7, 12]}[kind]
    return [r + i for i in iv]


# ---------------------------------------------------------------- piesele

def song_menu():
    """Tema eroică: re minor, 100 BPM, 16 măsuri. Corzi + cor + alămuri + taiko + timpane."""
    tr = Track(100, 16)
    prog = [("D", "m"), ("Bb", "M"), ("F", "M"), ("C", "M"), ("D", "m"), ("Bb", "M"), ("G", "m"), ("A", "M")]
    B = tr.beat
    for i, (root, kind) in enumerate(prog):
        t = tr.at(i * 2)
        notes = chord_notes(root, kind, 3)
        for k, nn in enumerate(notes):
            tr.add(strings(midi(nn + 12), 2 * 4 * B, a=0.6, r=0.8), t, pan=-0.5 + k * 0.5, vol=0.16, rev=0.45)
        tr.add(strings(midi(notes[0] - 12), 2 * 4 * B, a=0.3, r=0.6, bright=900), t, vol=0.22, rev=0.3)
        if i >= 2:
            for k, nn in enumerate(notes):
                tr.add(choir(midi(nn + 12), 2 * 4 * B, "a"), t, pan=0.4 - k * 0.4, vol=0.17, rev=0.6)
        # Ostinato de corzi joase pe optimi: rădăcina, octava, cvinta.
        pat = [0, 0, 12, 0, 7, 0, 12, 10]
        for b in range(16):
            tr.add(staccato(midi(notes[0] + pat[b % 8] - 12), 0.22, 1800), t + b * B / 2, pan=-0.2, vol=0.16, rev=0.2)
    # Tobe: BUM . BUM-BUM . ; tunet de timpane la sfârșit de frază.
    for bar in range(16):
        t = tr.at(bar)
        tr.add(taiko(1.0), t, pan=0, vol=0.5, rev=0.35)
        tr.add(taiko(0.7, 1.15), t + 2 * B, pan=-0.3, vol=0.45, rev=0.35)
        tr.add(taiko(0.55, 1.15), t + 2.5 * B, pan=0.3, vol=0.42, rev=0.35)
        if bar % 4 == 3:
            tr.add(timpani(midi(nm("D2")), 1.0, roll=4 * B * 0.9), t, vol=0.32, rev=0.4)
            tr.add(cymbal_swell(4 * B), t, pan=0.2, vol=0.08, rev=0.5)
        if bar % 8 == 0:
            tr.add(crash(0.12), t, pan=0.3, rev=0.5)
    # Melodia de alămuri (din a 5-a măsură).
    theme = [("D5", 2), ("A5", 1), ("G5", 1), ("F5", 2), ("E5", 1), ("D5", 1), ("F5", 2), ("G5", 1), ("A5", 1), ("C6", 3), (None, 1),
             ("Bb5", 2), ("A5", 1), ("G5", 1), ("F5", 2), ("G5", 1), ("A5", 1), ("G5", 2), ("E5", 1), ("C5", 1), ("D5", 4),
             ("D5", 2), ("A5", 1), ("G5", 1), ("F5", 2), ("E5", 1), ("D5", 1), ("F5", 2), ("G5", 1), ("A5", 1), ("D6", 4),
             ("C6", 2), ("Bb5", 1), ("A5", 1), ("G5", 2), ("A5", 1), ("Bb5", 1), ("A5", 3), ("E5", 1), ("D5", 4)]
    t = tr.at(4)
    for note, beats in theme:
        if t >= tr.length - 0.1:
            break
        if note:
            tr.add(brass(midi(nm(note) - 12), beats * B * 0.95, bright=2200), t, pan=0.1, vol=0.13, rev=0.4)
        t += beats * B
    return tr.render(reverb_len=3.2)


def song_day_a():
    """Zi liniștită: la minor, 64 BPM, 8 măsuri. Harpă în arpegii, pad cald, flaut rar, vânt."""
    tr = Track(64, 8)
    B = tr.beat
    prog = [("A", "m"), ("F", "M"), ("C", "M"), ("G", "M"), ("A", "m"), ("F", "M"), ("D", "m"), ("E", "M")]
    for bar, (root, kind) in enumerate(prog):
        t = tr.at(bar)
        notes = chord_notes(root, kind, 3)
        for k, nn in enumerate(notes):
            tr.add(strings(midi(nn), 4 * B, a=1.4, r=1.6, bright=1300, vib=0.06), t, pan=-0.4 + k * 0.4, vol=0.1, rev=0.6)
        tr.add(strings(midi(notes[0] - 12), 4 * B, a=1.0, r=1.4, bright=600), t, vol=0.12, rev=0.4)
        arp = [notes[0], notes[1], notes[2], notes[0] + 12, notes[2], notes[1] + 12, notes[2] + 12, notes[1] + 12]
        for i, nn in enumerate(arp):
            tr.add(pluck(midi(nn + 12), 3.0, 0.7), t + i * B / 2, pan=-0.3 + (i % 4) * 0.2, vol=0.1 * (0.85 + 0.15 * (i == 0)), rev=0.5)
    melody = [(2, "E5", 1.5), (3.5, "D5", 0.5), (4, "C5", 2), (6, "B4", 1), (7, "A4", 1), (8, "C5", 1.5), (9.5, "B4", 0.5),
              (10, "A4", 2), (12, "E5", 1.5), (13.5, "F5", 0.5), (14, "E5", 1), (15, "D5", 1), (16, "C5", 2), (18, "A4", 2),
              (20, "E5", 1.5), (21.5, "D5", 0.5), (22, "C5", 1), (23, "B4", 1), (24, "A4", 3), (28, "G#4", 2), (30, "B4", 2)]
    for beat, note, dur in melody:
        tr.add(flute(midi(nm(note)), dur * B * 0.95), beat * B, pan=0.25, vol=0.075, rev=0.55)
    tr.add(wind(tr.length + 2, 0.05), 0, rev=0.3)
    return tr.render(reverb_len=3.6, reverb_damp=4000, master=0.85)


def song_day_b():
    """Zi singuratică: re dorian, 70 BPM, 8 măsuri. Cutie muzicală, pian, violoncel."""
    tr = Track(70, 8)
    B = tr.beat
    prog = [("D", "m7"), ("G", "m"), ("Bb", "M7"), ("C", "M"), ("D", "m"), ("G", "m"), ("Bb", "M"), ("A", "M")]
    for bar, (root, kind) in enumerate(prog):
        t = tr.at(bar)
        notes = chord_notes(root, kind, 3)
        tr.add(strings(midi(notes[0] - 12), 4 * B, a=0.8, r=1.2, bright=700, voices=3), t, pan=-0.2, vol=0.16, rev=0.45)
        for k, nn in enumerate(notes[:3]):
            tr.add(piano(midi(nn), 4 * B + 1, 0.45), t + k * 0.02, pan=0.1 * k, vol=0.11, rev=0.5)
            tr.add(piano(midi(nn), 2 * B + 1, 0.3), t + 2 * B + 0.01 * k, pan=0.1 * k, vol=0.09, rev=0.5)
    box = [(0, "A5"), (1, "F5"), (1.5, "E5"), (2, "D5"), (3, "A5"), (4, "Bb5"), (5, "A5"), (5.5, "G5"), (6, "F5"), (7, "D5"),
           (8, "D6"), (9, "C6"), (10, "Bb5"), (11, "A5"), (12, "G5"), (13, "E5"), (14, "F5"), (15, "G5"),
           (16, "A5"), (17, "F5"), (17.5, "E5"), (18, "D5"), (19, "A5"), (20, "Bb5"), (21, "D6"), (22, "C6"), (23, "Bb5"),
           (24, "A5"), (25, "G5"), (26, "F5"), (27, "E5"), (28, "C#5"), (30, "E5"), (31, "A4")]
    for beat, note in box:
        tr.add(celesta(midi(nm(note)), 2.5), beat * B, pan=0.35, vol=0.09, rev=0.55)
    tr.add(wind(tr.length + 2, 0.04), 0, rev=0.3)
    return tr.render(reverb_len=3.4, reverb_damp=4500, master=0.85)


NIGHT_BPM, NIGHT_BARS = 120, 16
NIGHT_PROG = [("D", "m")] * 4 + [("D", "m")] * 4 + [("Bb", "M")] * 4 + [("A", "M")] * 4


def song_night_lo():
    """Noaptea, stratul de bază: drone, bas pulsat pe optimi, toba mare jos, cor de groază rar."""
    tr = Track(NIGHT_BPM, NIGHT_BARS)
    B = tr.beat
    tr.add(drone(midi(nm("D2")), tr.length + 2, 420), 0, vol=0.22, rev=0.35)
    pat = [0, 0, 12, 0, 0, 10, 0, 7]
    for bar, (root, kind) in enumerate(NIGHT_PROG):
        t = tr.at(bar)
        r = chord_notes(root, kind, 2)[0]
        for i in range(8):
            tr.add(bass_saw(midi(r + pat[i]), B * 0.42, 700), t + i * B / 2, vol=0.16 * (1.1 if i == 0 else 0.9), rev=0.1)
        tr.add(kick(0.9), t, vol=0.4, rev=0.15)
        tr.add(kick(0.6), t + 2 * B, vol=0.35, rev=0.15)
        for i in range(8):
            tr.add(shaker(0.6 if i % 2 else 0.35), t + i * B / 2, pan=0.4, vol=0.1, rev=0.2)
        if bar % 4 == 0:
            notes = chord_notes(root, kind, 3)
            for k, nn in enumerate(notes):
                tr.add(choir(midi(nn), 4 * 4 * B - 0.5, "u", voices=4, a=2.0, r=2.0), t, pan=-0.3 + 0.3 * k, vol=0.11, rev=0.6)
            tr.add(strings(midi(notes[0] + 13), 4 * 4 * B, a=3.0, r=2.0, bright=1800), t, pan=0.5, vol=0.04, rev=0.6)  # semiton de groază
    return tr.render(reverb_len=3.0, master=0.9)


def song_night_hi():
    """Noaptea, stratul de luptă: taiko, corzi pe șaisprezecimi, alămuri, toba mică, BRAAM."""
    tr = Track(NIGHT_BPM, NIGHT_BARS)
    B = tr.beat
    for bar, (root, kind) in enumerate(NIGHT_PROG):
        t = tr.at(bar)
        r = chord_notes(root, kind, 3)[0]
        # Taiko: 1, 2&, 3, 4e& — galop.
        for beat, v, p in [(0, 1, 1), (1.5, 0.7, 1.1), (2, 0.9, 1), (3.25, 0.6, 1.15), (3.5, 0.7, 1.1)]:
            tr.add(taiko(v, p), t + beat * B, pan=(beat - 2) * 0.15, vol=0.42, rev=0.3)
        tr.add(snare(0.8), t + B, pan=0.1, vol=0.18, rev=0.25)
        tr.add(snare(0.8), t + 3 * B, pan=0.1, vol=0.18, rev=0.25)
        ost = [0, 0, 7, 0, 0, 0, 12, 7, 0, 0, 7, 0, 3, 0, 5, 7]
        for i in range(16):
            tr.add(staccato(midi(r + ost[i]), B * 0.2, 2600), t + i * B / 4, pan=-0.3 if i % 2 else 0.3, vol=0.075, rev=0.2)
        if bar % 4 == 3:
            for i in range(4):
                tr.add(tom(140 - i * 15, 0.8 + i * 0.1), t + 2 * B + i * B / 2, pan=-0.4 + i * 0.25, vol=0.3, rev=0.3)
        if bar % 4 == 0:
            for k, nn in enumerate(chord_notes(root, kind, 3)):
                tr.add(brass(midi(nn), B * 1.5, bright=2000), t, pan=-0.3 + 0.3 * k, vol=0.07, rev=0.35)
        if bar % 8 == 0:
            tr.add(braam(midi(r - 12), 4 * B * 1.5, 1), t, vol=0.2, rev=0.45)
            tr.add(crash(0.5), t, pan=-0.2, vol=0.12, rev=0.4)
        if bar % 8 == 7:
            tr.add(cymbal_swell(4 * B, 0.6), t, pan=0.2, rev=0.4)
            tr.add(riser(4 * B, 0.5), t, vol=0.06, rev=0.4)
    return tr.render(reverb_len=2.6, master=0.95)


def song_boss():
    """Boss: mi frigian, 140 BPM, 16 măsuri. Cor, ostinato rapid, tobe grele, alămuri, BRAAM."""
    tr = Track(140, 16)
    B = tr.beat
    prog = [("E", "5"), ("F", "5"), ("E", "5"), ("D", "5"), ("E", "5"), ("F", "5"), ("G", "5"), ("F", "5")]
    for i, (root, kind) in enumerate(prog):
        t = tr.at(i * 2)
        notes = chord_notes(root, kind, 3)
        for k, nn in enumerate([notes[0], notes[0] + 7, notes[0] + 12]):
            tr.add(choir(midi(nn), 8 * B, "a", voices=6, a=0.25, r=0.6), t, pan=-0.4 + 0.4 * k, vol=0.15, rev=0.5)
        tr.add(strings(midi(notes[0] - 12), 8 * B, a=0.1, r=0.4, bright=1100), t, vol=0.18, rev=0.3)
        ost = [0, 0, 1, 0, 3, 0, 1, 0, 0, 0, 1, 0, 5, 3, 1, 0]
        for b in range(32):
            tr.add(staccato(midi(notes[0] + ost[b % 16]), B * 0.18, 3000), t + b * B / 4, pan=0.3 if b % 2 else -0.3, vol=0.085, rev=0.15)
        tr.add(braam(midi(notes[0] - 12), 4 * B, 1), t, vol=0.24 if i % 2 == 0 else 0.15, rev=0.4)
    for bar in range(16):
        t = tr.at(bar)
        for beat in range(8):
            tr.add(taiko(1.0 if beat % 4 == 0 else 0.55, 1.0 if beat % 2 == 0 else 1.2), t + beat * B / 2, pan=0.0, vol=0.38, rev=0.25)
        tr.add(snare(1.0, 0.8), t + B, vol=0.22, rev=0.2)
        tr.add(snare(1.0, 0.8), t + 3 * B, vol=0.22, rev=0.2)
        if bar % 4 == 3:
            for i in range(8):
                tr.add(snare(0.4 + i * 0.08, 0.5), t + 2 * B + i * B / 4, pan=0.2, vol=0.2, rev=0.25)
        if bar % 8 == 0:
            tr.add(crash(0.9), t, pan=0.3, vol=0.14, rev=0.4)
    theme = [("E5", 1.5), ("F5", 0.5), ("G5", 2), ("F5", 1), ("E5", 1), ("D5", 2), ("E5", 2), (None, 2),
             ("E5", 1.5), ("F5", 0.5), ("G5", 1), ("A5", 1), ("Bb5", 2), ("A5", 1), ("G5", 1), ("F5", 2), ("E5", 4)]
    t = tr.at(4)
    for note, beats in theme * 2:
        if t >= tr.length - 0.2:
            break
        if note:
            tr.add(brass(midi(nm(note) - 12), beats * B * 0.92, bright=2600), t, pan=-0.1, vol=0.14, rev=0.35)
        t += beats * B
    return tr.render(reverb_len=2.6, master=1.0)


def song_king():
    """Regele Iernii: re minor întunecat, 108 BPM, 16 măsuri. Clopot, orgă, cor jos, tobe uriașe."""
    tr = Track(108, 16)
    B = tr.beat
    prog = [("D", "m"), ("Eb", "M"), ("D", "m"), ("C#", "dim"), ("D", "m"), ("Bb", "M"), ("G", "m"), ("A", "M")]
    for i, (root, kind) in enumerate(prog):
        t = tr.at(i * 2)
        notes = chord_notes(root, kind, 3)
        for k, nn in enumerate(notes):
            tr.add(organ(midi(nn), 8 * B, a=0.3, r=1.0), t, pan=-0.4 + 0.4 * k, vol=0.12, rev=0.6)
            tr.add(choir(midi(nn - 12), 8 * B, "o", voices=5, a=0.8, r=1.0), t, pan=0.4 - 0.4 * k, vol=0.14, rev=0.6)
        tr.add(organ(midi(notes[0] - 24), 8 * B), t, vol=0.14, rev=0.4)
        # Corzi sus, în tremolo (tensiune).
        n_ = strings(midi(notes[0] + 24), 8 * B, a=1.0, r=0.6, bright=4000)
        trem = 0.55 + 0.45 * np.sin(2 * np.pi * 9 * np.arange(len(n_)) / SR)
        tr.add(n_ * trem, t, pan=0.5, vol=0.05, rev=0.5)
    for bar in range(16):
        t = tr.at(bar)
        tr.add(bell(midi(nm("D3")), 5.5), t, pan=-0.2, vol=0.2 if bar % 2 == 0 else 0.12, rev=0.6)
        tr.add(taiko(1.2, 0.8), t, vol=0.55, rev=0.45)
        tr.add(taiko(1.0, 0.8), t + 2 * B, vol=0.45, rev=0.45)
        tr.add(timpani(midi(nm("D2")), 0.8), t + 3.5 * B, vol=0.2, rev=0.4)
        if bar % 2 == 0:
            tr.add(braam(midi(nm("D2")), 4 * B, 1), t, vol=0.22, rev=0.45)
        if bar >= 12:
            for i in range(4):
                tr.add(tom(100 + (bar - 12) * 10 + i * 6, 0.9), t + i * B, vol=0.3, rev=0.35)
    tr.add(riser(4 * B * 4, 0.6), tr.at(12), vol=0.06, rev=0.4)
    return tr.render(reverb_len=3.6, reverb_damp=4200, master=1.0)


def song_endless():
    """Valul fără sfârșit: mi minor, 150 BPM, 16 măsuri. Fără pauză, bas pe șaisprezecimi."""
    tr = Track(150, 16)
    B = tr.beat
    prog = [("E", "m"), ("E", "m"), ("C", "M"), ("D", "M"), ("E", "m"), ("E", "m"), ("C", "M"), ("B", "M")]
    for i, (root, kind) in enumerate(prog):
        t = tr.at(i * 2)
        notes = chord_notes(root, kind, 2)
        bass = [0, 0, 12, 0, 0, 12, 0, 10, 0, 0, 12, 0, 7, 0, 10, 12]
        for b in range(32):
            tr.add(bass_saw(midi(notes[0] + bass[b % 16]), B * 0.2, 1100), t + b * B / 4, vol=0.12, rev=0.05)
        arp = [notes[0] + 24, notes[1] + 24, notes[2] + 24, notes[1] + 24]
        for b in range(32):
            tr.add(staccato(midi(arp[b % 4]), B * 0.16, 3600), t + b * B / 4, pan=0.4 if b % 2 else -0.4, vol=0.06, rev=0.25)
        for k, nn in enumerate(chord_notes(root, kind, 3)):
            tr.add(strings(midi(nn + 12), 8 * B, a=0.4, r=0.4, bright=2400), t, pan=-0.3 + 0.3 * k, vol=0.07, rev=0.45)
    for bar in range(16):
        t = tr.at(bar)
        for beat in range(4):
            tr.add(kick(1.0), t + beat * B, vol=0.42, rev=0.1)
            tr.add(hat(0.6), t + beat * B + B / 2, pan=0.3, vol=0.12, rev=0.1)
        tr.add(taiko(0.9), t, vol=0.32, rev=0.3)
        tr.add(snare(1.0), t + B, vol=0.24, rev=0.2)
        tr.add(snare(1.0), t + 3 * B, vol=0.24, rev=0.2)
        if bar % 8 == 0:
            tr.add(crash(1.0), t, pan=-0.3, vol=0.14, rev=0.35)
            tr.add(braam(midi(nm("E2")), 4 * B, 1), t, vol=0.2, rev=0.35)
        if bar % 8 == 7:
            tr.add(riser(4 * B, 0.7), t, vol=0.07, rev=0.35)
    hook = [("E5", 1), ("G5", 1), ("B5", 2), ("A5", 1), ("G5", 1), ("F#5", 2), ("E5", 1), ("G5", 1), ("C6", 2), ("B5", 2), ("A5", 2)]
    t = tr.at(8)
    for note, beats in hook * 2:
        if t >= tr.length - 0.2:
            break
        tr.add(brass(midi(nm(note) - 12), beats * B * 0.9, bright=2800), t, pan=0.1, vol=0.12, rev=0.3)
        t += beats * B
    return tr.render(reverb_len=2.2, master=1.0)


def save(name, stereo, kbps=96):
    os.makedirs(OUT, exist_ok=True)
    wav = os.path.join(OUT, name + ".wav")
    data = (np.clip(stereo.T, -1, 1) * 32767).astype(np.int16)
    with wave.open(wav, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())
    mp3 = os.path.join(OUT, name + ".mp3")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-ac", "2", "-b:a", f"{kbps}k", mp3], check=True)
    os.remove(wav)
    print("✓", name, f"{os.path.getsize(mp3) // 1024} KB", f"{stereo.shape[1] / SR:.1f}s", flush=True)


SONGS = {
    "menu": song_menu, "day_a": song_day_a, "day_b": song_day_b, "night_lo": song_night_lo, "night_hi": song_night_hi,
    "boss": song_boss, "king": song_king, "endless": song_endless,
}

if __name__ == "__main__":
    names = sys.argv[1:] or list(SONGS)
    for name in names:
        save(name, SONGS[name]())
