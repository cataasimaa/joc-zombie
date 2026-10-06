"""
Generează vocile zombilor (și gemetele eroului) ca fișiere MP3, cu un sintetizator de vorbire
de tip „formant” (ca vechile sintetizatoare Klatt), ca să sune a gât omenesc, nu a aparat:

  1. Sursa = corzile vocale: un puls de glotă (modelul Rosenberg) la frecvența vocii (f0), cu
     tremur neregulat (jitter), volum care pâlpâie (shimmer) și „vocal fry” / horcăit (fiecare al
     doilea puls mai slab, pulsuri sărite) — asta dă răgușeala de zombi.
  2. Respirația: zgomot care „suflă” odată cu pulsurile, plus un fâșâit constant.
  3. Gâtul și gura = 5 rezonatoare în serie (formanții F1..F5). Formanții se mută în timp între
     vocale („uuu” → „aaa” → „ăăă”), exact cum se mișcă gura.
  4. La final: puțină saturație (gât răgușit) și filtre.

Rulare:  pip install numpy scipy  &&  python3 tools/zombie_voices.py
Scrie fișierele în src/assets/sfx/ (are nevoie de ffmpeg pentru MP3).
"""

import os
import subprocess
import wave

import numpy as np
from scipy.signal import butter, lfilter

SR = 22050
OUT = os.path.join(os.path.dirname(__file__), "..", "src", "assets", "sfx")
rng = np.random.default_rng(7)

# Formanții vocalelor (voce de bărbat): F1, F2, F3 (Hz). F4/F5 sunt fixe.
VOWELS = {
    "u": (320, 800, 2240),   # „uuu” (geamăt cu gura aproape închisă)
    "o": (480, 880, 2400),
    "a": (740, 1100, 2450),  # „aaa” (gura larg deschisă)
    "e": (620, 1250, 2350),  # „ăăă”
    "r": (560, 1050, 1650),  # „rrr”: F3 coborât = sunet de gât strâns / mârâit
    "m": (260, 950, 2200),   # „mmm” (gura închisă)
}


def smooth_noise(n, rate_hz, seed_scale=1.0):
    """Zgomot lent și neted (pentru jitter, shimmer, derivă)."""
    k = max(2, int(n * rate_hz / SR) + 2)
    pts = rng.standard_normal(k) * seed_scale
    return np.interp(np.linspace(0, k - 1, n), np.arange(k), pts)


def track(points, n):
    """Interpolează o traiectorie [(t 0..1, valoare), ...] pe n eșantioane."""
    ts = np.array([p[0] for p in points]) * (n - 1)
    vs = np.array([p[1] for p in points], dtype=float)
    return np.interp(np.arange(n), ts, vs)


def glottal(f0, growl, breath):
    """Pulsuri de glotă Rosenberg, cu horcăit (period doubling) și respirație."""
    n = len(f0)
    phase = np.cumsum(f0 / SR)
    period_index = np.floor(phase).astype(int)
    ph = phase - period_index
    tp, tn = 0.42, 0.16
    flow = np.where(ph < tp, 0.5 * (1 - np.cos(np.pi * ph / tp)),
                    np.where(ph < tp + tn, np.cos(np.pi * (ph - tp) / (2 * tn)), 0.0))
    src = np.diff(flow, prepend=0.0) * SR / 400.0  # derivata = ce „radiază” gura
    # Horcăit: fiecare al doilea puls mai slab, iar unele pulsuri sar de tot (vocal fry).
    alt = np.where(period_index % 2 == 0, 1.0, 1.0 - 0.7 * growl)
    skip_seed = rng.random(period_index.max() + 2)
    skipped = np.where(skip_seed[period_index] < 0.18 * growl, 0.15, 1.0)
    shimmer = 1 + 0.25 * smooth_noise(n, 35) * (0.4 + growl)
    src *= alt * skipped * shimmer
    # Respirație: zgomot care pulsează odată cu glota + un fâșâit constant.
    noise = rng.standard_normal(n)
    asp = noise * (0.35 * flow + 0.15) * breath * 0.6
    return src + asp


def resonator(x, freq, bw):
    """Rezonator Klatt (filtru cu 2 poli) cu frecvență și lățime care variază în timp."""
    y = np.zeros_like(x)
    y1 = y2 = 0.0
    for i in range(len(x)):
        r = np.exp(-np.pi * bw[i] / SR)
        c = -r * r
        b = 2 * r * np.cos(2 * np.pi * freq[i] / SR)
        a = 1 - b - c
        yi = a * x[i] + b * y1 + c * y2
        y[i] = yi
        y2, y1 = y1, yi
    return y


def voice(dur, f0_pts, vowels, growl=0.4, breath=0.3, size=1.0, amp_pts=None, gurgle=0.0, bw_scale=1.0):
    """
    O vocalizare: `f0_pts` = conturul vocii [(t, Hz)], `vowels` = [(t, "a")...],
    `size` > 1 = gât mai mare (formanți mai jos: brută, boss), `gurgle` = bolborosit (scuipător).
    """
    n = int(dur * SR)
    f0 = track(f0_pts, n)
    f0 *= 1 + 0.035 * smooth_noise(n, 18) + 0.012 * smooth_noise(n, 90)  # jitter
    src = glottal(f0, growl, breath)
    out = src
    formants = []
    for k in range(3):
        formants.append(track([(t, VOWELS[v][k] / size) for t, v in vowels], n))
    formants.append(np.full(n, 3300 / size))
    formants.append(np.full(n, 3850 / size))
    bws = [90, 120, 170, 250, 320]
    for k in range(5):
        fr = formants[k] * (1 + 0.02 * smooth_noise(n, 6))
        out = resonator(out, fr, np.full(n, bws[k] * bw_scale))
    # Anvelopa: atac moale, final care se stinge; plus „gura care se deschide”.
    env = track(amp_pts or [(0, 0), (0.08, 1), (0.75, 0.85), (1, 0)], n)
    if gurgle > 0:
        env *= 1 - gurgle * 0.5 * (1 + np.sin(2 * np.pi * np.cumsum(28 + 8 * smooth_noise(n, 5)) / SR))
    out *= env
    # Saturație (gât răgușit) + filtre: fără bâzâit sub 70 Hz, fără șuierat peste 6 kHz.
    out /= np.max(np.abs(out)) + 1e-9
    out = np.tanh(out * (1.6 + growl * 1.5))
    b, a = butter(2, 70 / (SR / 2), "high")
    out = lfilter(b, a, out)
    b, a = butter(2, 6000 / (SR / 2), "low")
    out = lfilter(b, a, out)
    # Fade foarte scurt la capete (fără clicuri).
    fade = int(0.01 * SR)
    out[:fade] *= np.linspace(0, 1, fade)
    out[-fade:] *= np.linspace(1, 0, fade)
    return out / (np.max(np.abs(out)) + 1e-9) * 0.9


def save(name, data):
    os.makedirs(OUT, exist_ok=True)
    wav = os.path.join(OUT, name + ".wav")
    with wave.open(wav, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(data, -1, 1) * 32767).astype(np.int16).tobytes())
    mp3 = os.path.join(OUT, name + ".mp3")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-ac", "1", "-b:a", "48k", mp3], check=True)
    os.remove(wav)
    print("✓", name, f"{os.path.getsize(mp3) // 1024} KB")


def j(v, amount=0.08):
    """Puțină variație ca vocile să nu fie identice."""
    return v * (1 + rng.uniform(-amount, amount))


if __name__ == "__main__":
    # Gemete lente (zombii care vin): „mmm-uuu-aaa-ăăă”, voce joasă, horcăită.
    save("moan1", voice(2.0, [(0, j(95)), (0.3, j(105)), (0.7, j(88)), (1, j(72))], [(0, "m"), (0.15, "u"), (0.55, "a"), (1, "e")], growl=0.45, breath=0.35))
    save("moan2", voice(1.7, [(0, j(110)), (0.5, j(92)), (1, j(78))], [(0, "u"), (0.4, "o"), (1, "u")], growl=0.35, breath=0.4))
    save("moan3", voice(2.3, [(0, j(85)), (0.2, j(100)), (0.45, j(96)), (0.7, j(104)), (1, j(70))], [(0, "e"), (0.3, "a"), (0.6, "r"), (1, "u")], growl=0.55, breath=0.3))
    save("moan4", voice(1.4, [(0, j(120)), (1, j(85))], [(0, "a"), (0.6, "e"), (1, "u")], growl=0.4, breath=0.45, amp_pts=[(0, 0), (0.2, 1), (0.5, 0.6), (0.7, 0.9), (1, 0)]))
    # Atac: răget scurt „AAARGH”, voce încordată (f0 urcă), gura larg deschisă, mârâit la final.
    save("attack1", voice(0.75, [(0, j(120)), (0.25, j(175)), (0.7, j(150)), (1, j(105))], [(0, "e"), (0.2, "a"), (0.75, "r"), (1, "r")], growl=0.75, breath=0.35, amp_pts=[(0, 0), (0.06, 1), (0.7, 0.9), (1, 0)]))
    save("attack2", voice(0.6, [(0, j(140)), (0.3, j(190)), (1, j(120))], [(0, "a"), (0.6, "e"), (1, "r")], growl=0.8, breath=0.3, amp_pts=[(0, 0), (0.05, 1), (0.6, 0.8), (1, 0)]))
    save("attack3", voice(0.85, [(0, j(110)), (0.2, j(160)), (0.5, j(165)), (1, j(95))], [(0, "r"), (0.15, "a"), (0.6, "a"), (1, "u")], growl=0.7, breath=0.4))
    # Brută / boss: gât uriaș (formanți mult mai jos), voce foarte joasă și aspră.
    save("brute_attack", voice(1.1, [(0, j(62)), (0.3, j(85)), (1, j(55))], [(0, "o"), (0.3, "a"), (1, "r")], growl=0.9, breath=0.3, size=1.35, bw_scale=1.2))
    save("brute_moan", voice(2.2, [(0, j(58)), (0.5, j(66)), (1, j(48))], [(0, "m"), (0.3, "o"), (0.8, "u"), (1, "u")], growl=0.8, breath=0.35, size=1.3))
    # Fugar / zburător: țipăt ascuțit, șuierat, cu multă respirație.
    save("shriek", voice(0.7, [(0, j(230)), (0.3, j(330)), (1, j(200))], [(0, "e"), (0.3, "a"), (1, "e")], growl=0.5, breath=0.75, size=0.9, amp_pts=[(0, 0), (0.05, 1), (0.6, 0.7), (1, 0)]))
    # Scuipătorul: bolborosit, ca și cum gâtul e plin de venin.
    save("gurgle", voice(1.0, [(0, j(100)), (1, j(80))], [(0, "o"), (0.5, "u"), (1, "o")], growl=0.6, breath=0.5, gurgle=0.8))
    # Moartea unui zombi: horcăit care coboară și se stinge.
    save("death1", voice(1.1, [(0, j(110)), (0.4, j(90)), (1, j(50))], [(0, "a"), (0.4, "e"), (1, "u")], growl=0.85, breath=0.5, amp_pts=[(0, 0), (0.05, 1), (0.5, 0.7), (1, 0)]))
    save("death2", voice(0.9, [(0, j(130)), (1, j(60))], [(0, "e"), (0.5, "o"), (1, "m")], growl=0.7, breath=0.55, gurgle=0.4))
    # Eroul lovit: „ugh!”, „ah!” — scurt, voce normală, puțină respirație.
    save("hurt1", voice(0.28, [(0, 150), (0.4, 165), (1, 120)], [(0, "e"), (0.5, "e"), (1, "u")], growl=0.2, breath=0.35, amp_pts=[(0, 0), (0.08, 1), (0.45, 0.6), (1, 0)]))
    save("hurt2", voice(0.32, [(0, 165), (0.3, 180), (1, 130)], [(0, "a"), (1, "e")], growl=0.15, breath=0.4, amp_pts=[(0, 0), (0.06, 1), (0.5, 0.5), (1, 0)]))
    save("hurt3", voice(0.24, [(0, 140), (1, 115)], [(0, "u"), (1, "e")], growl=0.25, breath=0.45, amp_pts=[(0, 0), (0.1, 1), (0.4, 0.7), (1, 0)]))
