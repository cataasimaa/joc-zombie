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
from scipy.signal import butter, fftconvolve, lfilter, lfilter_zi, sosfilt

SR = 44100
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


def resonator(x, freq, bw, block=64):
    """Rezonator Klatt (2 poli) cu frecvență și lățime care variază în timp (pe blocuri scurte)."""
    y = np.empty_like(x)
    zi = np.zeros(2)
    for s0 in range(0, len(x), block):
        m = min(len(x), s0 + block) - s0
        k = s0 + m // 2
        r = np.exp(-np.pi * bw[k] / SR)
        c = -r * r
        b = 2 * r * np.cos(2 * np.pi * freq[k] / SR)
        a = 1 - b - c
        y[s0:s0 + m], zi = lfilter([a], [1, -b, -c], x[s0:s0 + m], zi=zi)
    return y


def room(x, wet=0.16, tail=0.9):
    """Reverb scurt de exterior (ecou de la case / brazi), ca vocea să stea „în lume”."""
    n = int(tail * SR)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / SR / (tail / 5))
    b, a = butter(2, 2800 / (SR / 2), "low")
    ir = lfilter(b, a, ir)
    ir[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))
    ir *= np.sqrt(0.1 / np.sum(ir ** 2))
    w = fftconvolve(x, ir)[: len(x) + int(0.4 * tail * SR)]
    dry = np.concatenate([x, np.zeros(len(w) - len(x))])
    out = dry + w * wet * 3
    out[-int(0.05 * SR):] *= np.linspace(1, 0, int(0.05 * SR))
    return out


def tract(src, vowels, n, size, bw_scale):
    """Gâtul și gura: rezonanța gâtului + 5 formanți care se mută între vocale."""
    out = resonator(src, np.full(n, 190 / size), np.full(n, 160.0)) * 0.35 + src
    formants = [track([(t, VOWELS[v][k] / size) for t, v in vowels], n) for k in range(3)]
    formants += [np.full(n, 3300 / size), np.full(n, 3850 / size)]
    bws = [110, 140, 200, 280, 360]
    for k in range(5):
        fr = formants[k] * (1 + 0.025 * smooth_noise(n, 7))
        out = resonator(out, fr, np.full(n, bws[k] * bw_scale))
    return out


def voice(dur, f0_pts, vowels, growl=0.4, breath=0.3, size=1.0, amp_pts=None, gurgle=0.0, bw_scale=1.0):
    """
    O vocalizare de zombi, făcută ca un „growl” adevărat (cum mârâie cântăreții de death metal):
      - corzile vocale (f0, cu tremur neregulat de la un puls la altul);
      - corzile false din gât vibrează la jumătate de frecvență (subarmonica) = mârâitul gros;
      - „hârâitul” (gâtul plin): volumul pâlpâie neregulat la 20–50 Hz;
      - respirația / aerul care trece prin gât (mult, la zombi);
      - un al doilea gât, o octavă mai jos și mai mare, amestecat dedesubt (corp, greutate);
      - plescăit de salivă la început, saturație asimetrică, egalizare și puțin ecou.
    `f0_pts` = conturul vocii [(t, Hz)], `vowels` = [(t, "a")...], `size` > 1 = gât mai mare,
    `gurgle` = bolborosit.
    """
    n = int(dur * SR)
    f0 = track(f0_pts, n)
    # Jitter: lent (intonație) + rapid (de la un puls la altul) — vocea „se rupe”, ca la un gât bolnav.
    f0 *= 1 + 0.04 * smooth_noise(n, 14) + (0.02 + 0.05 * growl) * smooth_noise(n, 140)
    src = glottal(f0, growl, breath)
    # Corzile false: puls la f0/2, puternic la mârâit.
    sub = glottal(f0 * 0.5, min(1.0, growl + 0.2), breath * 0.5)
    src = src + sub * (0.25 + 0.75 * growl)
    # Hârâitul gâtului: modulare neregulată de amplitudine.
    rattle_rate = 22 + 26 * (0.5 + 0.5 * smooth_noise(n, 3))
    rattle = 0.5 + 0.5 * np.sign(np.sin(2 * np.pi * np.cumsum(rattle_rate) / SR)) * (0.5 + 0.5 * smooth_noise(n, 40))
    src *= 1 - growl * 0.55 * (1 - rattle)
    # Aer prin gât: zgomot care urmează vocea, mult mai prezent decât la un om sănătos.
    air = rng.standard_normal(n) * (0.25 + breath * 0.9) * 0.35
    src = src + air
    out = tract(src, vowels, n, size, bw_scale)
    # Al doilea gât: o octavă mai jos, mai mare (dă greutate), dedesubt.
    if growl > 0.3:
        low = tract(glottal(f0 * 0.5, growl, breath) + air * 0.5, vowels, n, size * 1.3, bw_scale * 1.2)
        out = out / (np.max(np.abs(out)) + 1e-9) + low / (np.max(np.abs(low)) + 1e-9) * (0.15 + 0.25 * growl)
    # Radiația gurii: vocea iese prin buze → acutele cresc (+6 dB/octavă), altfel sună „prin pernă”.
    out = lfilter([1, -0.95], [1], out)
    out = lfilter([1, -0.6], [1], out)
    # Hârșâitul aerului prin gâtul uscat (acutele „aspre” ale unui mârâit adevărat), care urmează vocea.
    follow = np.sqrt(np.convolve(out ** 2, np.ones(int(0.015 * SR)) / int(0.015 * SR), mode="same"))
    rasp = sosfilt(butter(2, [2200 / (SR / 2), 6500 / (SR / 2)], "bandpass", output="sos"), rng.standard_normal(n))
    rasp *= follow / (np.max(follow) + 1e-9) * (0.5 + 0.5 * rattle)
    out = out / (np.max(np.abs(out)) + 1e-9) + rasp / (np.max(np.abs(rasp)) + 1e-9) * (0.06 + 0.22 * growl * (0.5 + breath))
    env = track(amp_pts or [(0, 0), (0.08, 1), (0.75, 0.85), (1, 0)], n)
    if gurgle > 0:
        bub = 28 + 10 * smooth_noise(n, 5)
        env *= 1 - gurgle * 0.55 * (0.5 + 0.5 * np.sin(2 * np.pi * np.cumsum(bub) / SR)) * (0.6 + 0.4 * smooth_noise(n, 20))
    out = out * env
    # Plescăit de salivă când se deschide gura (2–3 pocnituri scurte, umede).
    for _ in range(int(rng.integers(1, 4))):
        at = int(rng.uniform(0.0, 0.12) * dur * SR)
        g = int(rng.uniform(0.003, 0.009) * SR)
        if at + g < n:
            burst = rng.standard_normal(g) * np.hanning(g)
            bb, ba = butter(2, [rng.uniform(1200, 2200) / (SR / 2), rng.uniform(3500, 6000) / (SR / 2)], "bandpass")
            out[at:at + g] += lfilter(bb, ba, burst) * np.max(np.abs(out)) * rng.uniform(0.15, 0.35)
    # Saturație asimetrică (gât răgușit, nu „bâzâit” de aparat).
    out /= np.max(np.abs(out)) + 1e-9
    drive = 1.8 + growl * 2.2
    out = np.tanh(out * drive + 0.25) - np.tanh(0.25)
    # Egalizare: fără bâzâit sub 60 Hz, corp la 150–350 Hz, mai puțin „nazal” pe la 1 kHz,
    # fără șuierat de aparat peste 7 kHz.
    sos = butter(2, 60 / (SR / 2), "high", output="sos")
    out = sosfilt(sos, out)
    body = sosfilt(butter(2, [140 / (SR / 2), 360 / (SR / 2)], "bandpass", output="sos"), out)
    honk = sosfilt(butter(2, [800 / (SR / 2), 1300 / (SR / 2)], "bandpass", output="sos"), out)
    edge = sosfilt(butter(2, [1800 / (SR / 2), 3400 / (SR / 2)], "bandpass", output="sos"), out)
    out = out + body * 0.3 - honk * 0.25 + edge * 0.5
    out = sosfilt(butter(3, 8000 / (SR / 2), "low", output="sos"), out)
    # Compresie simplă (vocea „în față”, ca într-un joc), apoi ecou scurt.
    rms = np.sqrt(np.convolve(out ** 2, np.ones(int(0.02 * SR)) / int(0.02 * SR), mode="same")) + 1e-4
    gain = np.minimum(1.0, (rms / (np.max(rms) * 0.35)) ** -0.45)
    out = out * gain
    out = room(out, wet=0.12 + 0.08 * min(size, 2) / 2)
    fade = int(0.008 * SR)
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
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-ac", "1", "-b:a", "64k", mp3], check=True)
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


# ---------------------------------------------------------------------------------------------
# Vocile zombilor noi și ale boșilor: fiecare are „gâtul” lui (rulează după cele de mai sus, deci
# fișierele vechi ies identice — același seed).

VOWELS.update({
    "i": (300, 2200, 2950),   # „iii” (țipăt subțire)
    "ae": (660, 1700, 2400),  # „ea” deschis
})


def wail(dur, f_lo, f_hi, vib=6.0, depth=0.04, vowels=None, breath=0.5, growl=0.25):
    """Țipăt de strigoaică (urlătoarea): voce subțire, care urcă, cu tremolo (vibrato)."""
    n = int(dur * SR)
    tt = np.arange(n) / SR
    base = track([(0, f_lo), (0.25, f_hi), (0.8, f_hi * 0.92), (1, f_lo * 1.1)], n)
    f0 = base * (1 + depth * np.sin(2 * np.pi * vib * tt))
    pts = [(t, f) for t, f in zip(np.linspace(0, 1, 40), f0[:: max(1, n // 39)][:40])]
    return voice(dur, pts, vowels or [(0, "e"), (0.3, "i"), (0.8, "ae"), (1, "e")], growl=growl, breath=breath, size=0.78,
                 amp_pts=[(0, 0), (0.08, 1), (0.85, 0.8), (1, 0)])


def clicks(dur, rate, freq=2400, q=0.004):
    """Țăcănit de insectă (mandibule): pocnituri scurte și rezonante, la intervale neregulate."""
    n = int(dur * SR)
    out = np.zeros(n)
    t = 0.0
    while t < dur - 0.02:
        i = int(t * SR)
        g = int(q * SR)
        burst = rng.standard_normal(g) * np.hanning(g)
        out[i:i + g] += burst * rng.uniform(0.5, 1)
        t += rng.uniform(0.5, 1.5) / rate
    b, a = butter(2, [freq * 0.6 / (SR / 2), min(0.95, freq * 1.6 / (SR / 2))], "bandpass")
    return lfilter(b, a, out)


def layer(*parts):
    """Suprapune mai multe sunete (cu câștig) și normalizează."""
    n = max(len(p[0]) for p in parts)
    out = np.zeros(n)
    for x, g in parts:
        out[: len(x)] += x * g
    return out / (np.max(np.abs(out)) + 1e-9) * 0.9


def hiss(dur, lo=2500, hi=7000, env=None):
    n = int(dur * SR)
    x = rng.standard_normal(n)
    b, a = butter(2, [lo / (SR / 2), min(0.95, hi / (SR / 2))], "bandpass")
    x = lfilter(b, a, x)
    return x * track(env or [(0, 0), (0.1, 1), (0.7, 0.7), (1, 0)], n)


def rumble(dur, f=45):
    """Huruit de piatră care se freacă (colosul): zgomot foarte jos, cu bufnituri."""
    n = int(dur * SR)
    x = rng.standard_normal(n)
    b, a = butter(2, f * 3 / (SR / 2), "low")
    x = lfilter(b, a, x) * 6
    grind = rng.standard_normal(n)
    b, a = butter(2, [300 / (SR / 2), 1400 / (SR / 2)], "bandpass")
    grind = lfilter(b, a, grind) * (0.5 + 0.5 * smooth_noise(n, 12)) * 0.4
    return np.tanh((x + grind) * track([(0, 0), (0.15, 1), (0.75, 0.8), (1, 0)], n))


def make_new_voices():
    # Fugarul (târâtorul): șuierat-mârâit scurt, ca o pisică uriașă.
    save("runner_attack", layer((voice(0.45, [(0, j(210)), (0.4, j(260)), (1, j(170))], [(0, "ae"), (0.5, "a"), (1, "r")], growl=0.9, breath=0.85, size=0.85), 1),
                                (hiss(0.45, 2500, 7000), 0.35)))
    # Scuipătorul: horcăie și scuipă.
    save("spit", layer((voice(0.5, [(0, j(110)), (1, j(95))], [(0, "r"), (0.6, "o"), (1, "e")], growl=0.9, breath=0.7, gurgle=0.9), 1),
                       (hiss(0.5, 900, 3500, [(0, 0), (0.55, 0.2), (0.62, 1), (1, 0)]), 0.6)))
    # Zburătorul: țipăt de pasăre de pradă, ascuțit.
    save("flyer_screech", wail(0.55, 520, 880, vib=11, depth=0.06, breath=0.6, growl=0.5))
    # Urlătoarea: bocet lung, subțire, care îngheață sângele.
    save("scream1", wail(1.4, 380, 820, vib=6.5, depth=0.05))
    save("scream2", wail(1.1, 450, 950, vib=7.5, depth=0.07, vowels=[(0, "i"), (0.5, "ae"), (1, "i")]))
    save("screamer_moan", wail(1.6, 260, 340, vib=4, depth=0.03, breath=0.7, vowels=[(0, "u"), (0.5, "o"), (1, "u")]))
    # Umflatul: râgâit ud, jos, cu bulbuci.
    save("bloater_moan", voice(1.6, [(0, j(70)), (0.5, j(62)), (1, j(55))], [(0, "o"), (0.4, "u"), (1, "o")], growl=0.8, breath=0.4, size=1.25, gurgle=1.0))
    save("bloater_attack", voice(0.8, [(0, j(85)), (0.3, j(105)), (1, j(60))], [(0, "e"), (0.3, "a"), (1, "o")], growl=0.9, breath=0.5, size=1.2, gurgle=0.9))
    # Săpătorul: țăcănit de mandibule + șuierat; la atac un țipăt scurt peste țăcănit.
    save("burrower_chitter", layer((clicks(1.0, 22, 2200), 1), (hiss(1.0, 3000, 8000, [(0, 0), (0.2, 0.5), (0.8, 0.4), (1, 0)]), 0.35)))
    save("burrower_attack", layer((clicks(0.6, 40, 2600), 0.8), (wail(0.6, 330, 520, vib=14, depth=0.08, breath=0.8, growl=0.7), 0.8)))
    # Șamanul: incantație gâtuită (cânt diftonic): voce joasă cu o rezonanță care alunecă.
    save("shaman_chant", voice(2.4, [(0, 88), (0.5, 92), (1, 86)], [(0, "u"), (0.25, "o"), (0.5, "u"), (0.75, "o"), (1, "m")], growl=0.35, breath=0.3, size=1.05, bw_scale=0.45,
                               amp_pts=[(0, 0), (0.15, 0.9), (0.5, 1), (0.85, 0.9), (1, 0)]))
    save("shaman_cast", layer((voice(0.9, [(0, 120), (0.4, 160), (1, 100)], [(0, "o"), (0.4, "a"), (1, "u")], growl=0.5, breath=0.5), 1), (hiss(0.9, 3500, 9000), 0.25)))
    # Matca: șuierat de păianjen uriaș + țipăt de insectă.
    save("brood_hiss", layer((hiss(1.5, 1800, 6500), 1), (clicks(1.5, 16, 1500), 0.7)))
    save("brood_screech", layer((wail(1.0, 600, 1100, vib=18, depth=0.09, breath=0.9, growl=0.9), 0.9), (clicks(1.0, 30, 1800), 0.6)))
    # Yeti-ul: răget uriaș (gât imens), apoi mormăit.
    save("yeti_roar1", voice(1.6, [(0, j(70)), (0.2, j(120)), (0.6, j(110)), (1, j(65))], [(0, "o"), (0.2, "a"), (0.7, "a"), (1, "r")], growl=1.0, breath=0.5, size=1.7, bw_scale=1.4,
                             amp_pts=[(0, 0), (0.06, 1), (0.7, 0.95), (1, 0)]))
    save("yeti_roar2", voice(1.3, [(0, j(80)), (0.3, j(135)), (1, j(70))], [(0, "a"), (0.5, "ae"), (1, "r")], growl=1.0, breath=0.45, size=1.6, bw_scale=1.3))
    save("yeti_grunt", voice(0.6, [(0, j(75)), (1, j(60))], [(0, "u"), (1, "o")], growl=0.9, breath=0.4, size=1.6))
    # Vrăjitoarea: râs cârâit („ha-ha-ha”) și șoaptă.
    syl = []
    for k in range(6):
        syl.append(voice(0.14, [(0, j(380 - k * 18)), (1, j(330 - k * 18))], [(0, "ae"), (1, "a")], growl=0.6, breath=0.6, size=0.8,
                         amp_pts=[(0, 0), (0.15, 1), (0.6, 0.7), (1, 0)]))
    cackle = np.zeros(int(1.8 * SR))
    for k, s_ in enumerate(syl):
        i = int((0.04 + k * 0.19) * SR)
        cackle[i:i + len(s_)] += s_ * (1 - k * 0.08)
    save("witch_cackle", cackle)
    save("witch_whisper", hiss(1.2, 1500, 5000, [(0, 0), (0.2, 1), (0.4, 0.5), (0.6, 1), (1, 0)]) * 0.9)
    save("witch_cast", layer((wail(0.8, 300, 600, vib=5, depth=0.05, breath=0.8, growl=0.3, vowels=[(0, "a"), (1, "i")]), 1), (hiss(0.8, 4000, 10000), 0.3)))
    # Colosul: huruit de piatră și un geamăt adânc, ca un munte care se mișcă.
    save("colossus_groan", layer((rumble(2.2, 40), 1), (voice(2.2, [(0, 45), (0.5, 52), (1, 40)], [(0, "o"), (0.5, "u"), (1, "o")], growl=0.9, breath=0.3, size=2.2, bw_scale=1.5), 0.6)))
    save("colossus_roar", layer((rumble(1.6, 55), 0.8), (voice(1.6, [(0, 50), (0.3, 75), (1, 45)], [(0, "o"), (0.3, "a"), (1, "r")], growl=1.0, breath=0.4, size=2.0, bw_scale=1.4), 1)))
    # Lich-ul: voce de schelet — șuierătoare și joasă în același timp.
    save("lich_roar", layer((voice(1.5, [(0, 75), (0.3, 105), (1, 65)], [(0, "o"), (0.3, "a"), (1, "u")], growl=0.95, breath=0.7, size=1.45), 1),
                            (hiss(1.5, 2500, 7000), 0.3)))
    # Regele Iernii: două voci (una foarte joasă, una o octavă mai sus) + șoaptă: „corul morților”.
    low = voice(2.0, [(0, 52), (0.3, 70), (0.7, 64), (1, 48)], [(0, "o"), (0.3, "a"), (0.75, "a"), (1, "u")], growl=0.9, breath=0.4, size=1.9, bw_scale=1.3)
    high = voice(2.0, [(0, 104), (0.3, 140), (0.7, 128), (1, 96)], [(0, "o"), (0.3, "a"), (0.75, "e"), (1, "u")], growl=0.6, breath=0.5, size=1.2)
    save("king_roar", layer((low, 1), (high, 0.45), (hiss(2.0, 3000, 8000), 0.18)))
    laugh = np.zeros(int(2.4 * SR))
    for k in range(5):
        s_ = voice(0.22, [(0, 95 - k * 4), (1, 80 - k * 4)], [(0, "o"), (1, "a")], growl=0.8, breath=0.4, size=1.7, amp_pts=[(0, 0), (0.15, 1), (0.6, 0.7), (1, 0)])
        i = int((0.05 + k * 0.32) * SR)
        laugh[i:i + len(s_)] += s_
    save("king_laugh", laugh)
    save("king_moan", layer((voice(2.4, [(0, 55), (0.5, 62), (1, 46)], [(0, "m"), (0.3, "o"), (1, "u")], growl=0.8, breath=0.4, size=1.8), 1),
                            (voice(2.4, [(0, 110), (0.5, 124), (1, 92)], [(0, "m"), (0.3, "o"), (1, "u")], growl=0.5, breath=0.5, size=1.2), 0.4)))
    # Brută: încă un atac și moartea (cade ca un copac).
    save("brute_attack2", voice(0.9, [(0, j(70)), (0.25, j(95)), (1, j(60))], [(0, "a"), (0.5, "a"), (1, "r")], growl=0.95, breath=0.35, size=1.4, bw_scale=1.2))
    save("brute_death", voice(1.6, [(0, j(80)), (0.4, j(60)), (1, j(38))], [(0, "a"), (0.5, "o"), (1, "u")], growl=0.9, breath=0.55, size=1.4))


def make_variants():
    """Mai multe variante de geamăt / atac / moarte, ca hoarda să nu repete același sunet."""
    vw = ["m", "u", "o", "a", "e", "r"]
    for k in range(5, 9):
        f = rng.uniform(78, 118)
        seq = [vw[int(i)] for i in rng.integers(0, len(vw), 4)]
        save(f"moan{k}", voice(rng.uniform(1.4, 2.4), [(0, f), (0.3, f * rng.uniform(1.0, 1.2)), (0.7, f * rng.uniform(0.85, 1.05)), (1, f * 0.75)],
                               [(0, "m"), (0.2, seq[1]), (0.55, seq[2]), (1, seq[3])], growl=rng.uniform(0.4, 0.65), breath=rng.uniform(0.3, 0.5)))
    for k in range(4, 7):
        f = rng.uniform(115, 150)
        save(f"attack{k}", voice(rng.uniform(0.55, 0.85), [(0, f), (0.25, f * rng.uniform(1.3, 1.5)), (0.7, f * 1.2), (1, f * 0.8)],
                                 [(0, "e"), (0.2, "a"), (0.7, "r"), (1, "r")], growl=rng.uniform(0.7, 0.9), breath=0.4,
                                 amp_pts=[(0, 0), (0.05, 1), (0.65, 0.85), (1, 0)]))
    for k in range(3, 5):
        f = rng.uniform(100, 130)
        save(f"death{k}", voice(rng.uniform(0.9, 1.3), [(0, f), (0.4, f * 0.8), (1, f * 0.45)], [(0, "a"), (0.45, "o"), (1, "u")],
                                growl=0.85, breath=0.55, gurgle=rng.uniform(0.2, 0.6), amp_pts=[(0, 0), (0.05, 1), (0.5, 0.65), (1, 0)]))


if __name__ == "__main__":
    make_new_voices()
    make_variants()
