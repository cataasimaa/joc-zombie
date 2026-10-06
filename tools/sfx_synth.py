"""
Generează efectele sonore „realiste” ale jocului ca fișiere MP3 (fără înregistrări: totul e
sintetizat din fizică simplificată, ca să nu depindem de sunete cu licență):

  - împușcături pe armă: pocnitura gurii țevii (unda de șoc), bubuitura joasă, mecanismul
    (clic, închizătorul) și coada care se pierde în pădure (ecouri + reverb);
  - reîncărcare, tuburi de cartuș care zornăie pe jos, clic în gol;
  - târnăcopul: șuieratul prin aer, „toc”-ul în lemn (rezonanțe de lemn), clinchetul în piatră
    (rezonanțe de metal + pietriș), zăpada; bradul care trosnește și cade; zăcământul care se sparge;
  - drujba (motor + lanț în lemn);
  - pescuitul: aruncarea, mulineta, „plop”-ul plutei, peștele care se zbate, firul care se rupe;
  - atacurile zombilor: ghearele (șuierat + sfâșiere), bâta (lovitură grea), mușcătura;
  - explozii, pași în zăpadă.

Ingrediente: zgomot filtrat, sinusoide amortizate (rezonanțe „modale” — cum sună un obiect lovit),
anvelope, saturație și un reverb de exterior (ecouri rare + coadă care se stinge).

Rulare:  pip install numpy scipy  &&  python3 tools/sfx_synth.py
Scrie fișierele în src/assets/sfx/ (are nevoie de ffmpeg pentru MP3).
"""

import os
import subprocess
import wave

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), "..", "src", "assets", "sfx")
rng = np.random.default_rng(11)


# ---------------------------------------------------------------- ingrediente

def n_of(sec):
    return max(1, int(sec * SR))


def t_of(sec):
    return np.arange(n_of(sec)) / SR


def noise(sec):
    return rng.standard_normal(n_of(sec))


def filt(x, kind, f, order=2):
    """Filtru Butterworth: kind = low / high / band (f = (lo, hi))."""
    if kind == "band":
        sos = butter(order, [f[0] / (SR / 2), min(0.99, f[1] / (SR / 2))], "bandpass", output="sos")
    else:
        sos = butter(order, min(0.99, f / (SR / 2)), "lowpass" if kind == "low" else "highpass", output="sos")
    return sosfilt(sos, x)


def exp_env(sec, tau, attack=0.001):
    t = t_of(sec)
    a = np.clip(t / max(attack, 1e-5), 0, 1)
    return a * np.exp(-t / tau)


def sweep_sine(sec, f0, f1, tau_f=None):
    """Sinusoidă care alunecă de la f0 la f1 (exponențial)."""
    t = t_of(sec)
    if tau_f is None:
        f = f0 * (f1 / f0) ** (t / sec)
    else:
        f = f1 + (f0 - f1) * np.exp(-t / tau_f)
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def modal(sec, modes, strike=0.002):
    """
    Obiect lovit: o sumă de sinusoide amortizate [(frecvență, amplitudine, timp de stingere)].
    Așa sună lemnul (puține rezonanțe joase, scurte) și metalul (multe, înalte, lungi).
    """
    t = t_of(sec)
    out = np.zeros_like(t)
    for f, a, tau in modes:
        f = f * (1 + rng.uniform(-0.015, 0.015))
        out += a * np.sin(2 * np.pi * f * t + rng.uniform(0, 6.28)) * np.exp(-t / tau)
    out *= np.clip(t / strike, 0, 1)
    return out


def grains(sec, rate, dur=0.004, band=(1500, 6000), decay=None):
    """Pietriș / zăpadă / așchii: multe pocnituri mici, aleatoare."""
    n = n_of(sec)
    out = np.zeros(n)
    count = int(rate * sec)
    g = n_of(dur)
    for _ in range(count):
        i = int(rng.uniform(0, 1) ** (1.6 if decay else 1) * (n - g - 1))
        amp = rng.uniform(0.2, 1.0) * (np.exp(-i / SR / decay) if decay else 1)
        out[i:i + g] += rng.standard_normal(g) * np.hanning(g) * amp
    return filt(out, "band", band)


def place(dst, src, at, gain=1.0):
    """Pune `src` în `dst` la secunda `at` (prelungește dacă e nevoie)."""
    i = n_of(at) if at > 0 else 0
    need = i + len(src)
    if need > len(dst):
        dst = np.concatenate([dst, np.zeros(need - len(dst))])
    dst[i:i + len(src)] += src * gain
    return dst


def mix(length, *parts):
    """parts = (semnal, la_secunda, câștig)."""
    out = np.zeros(n_of(length))
    for p in parts:
        out = place(out, p[0], p[1] if len(p) > 1 else 0, p[2] if len(p) > 2 else 1)
    return out


def sat(x, drive):
    return np.tanh(x * drive) / np.tanh(drive)


_IR_CACHE = {}


def outdoor_ir(tail=1.6, echoes=((0.13, 0.35), (0.31, 0.22), (0.58, 0.12)), damp=2500):
    """Reverb de exterior, iarna: câteva ecouri de la case / pădure + o coadă difuză întunecată."""
    key = (tail, echoes, damp)
    if key in _IR_CACHE:
        return _IR_CACHE[key]
    n = n_of(tail)
    # Coada difuză: energia ei totală e ~ -9 dB față de sunetul direct (altfel „spală” lovitura).
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / SR / (tail / 5))
    ir = filt(ir, "low", damp)
    ir[: n_of(0.02)] *= np.linspace(0, 1, n_of(0.02))  # coada începe după sunetul direct
    ir *= np.sqrt(0.12 / np.sum(ir ** 2))
    ir[0] = 1.0
    for at, g in echoes:
        # Fiecare ecou: o „pată” scurtă cu energia g² (deci mai încet decât originalul).
        e = filt(rng.standard_normal(n_of(0.03)) * np.hanning(n_of(0.03)), "low", damp * 0.8)
        e *= g / np.sqrt(np.sum(e ** 2))
        i = n_of(at)
        if i + len(e) < n:
            ir[i:i + len(e)] += e
    _IR_CACHE[key] = ir
    return ir


def reverb(x, wet=0.35, **kw):
    ir = outdoor_ir(**kw)
    w = fftconvolve(x, ir)[: len(x) + len(ir) - 1]
    dry = np.concatenate([x, np.zeros(len(w) - len(x))])
    return dry * (1 - wet * 0.3) + (w - dry) * wet


def finish(x, peak=0.92, trim_db=-60):
    """Normalizează, taie liniștea de la coadă și face un fade scurt (fără clicuri)."""
    x = x - np.mean(x[: n_of(0.01)]) * 0
    m = np.max(np.abs(x)) + 1e-9
    x = x / m * peak
    thr = 10 ** (trim_db / 20) * peak
    idx = np.where(np.abs(x) > thr)[0]
    end = min(len(x), (idx[-1] if len(idx) else len(x) - 1) + n_of(0.02))
    x = x[:end]
    f = min(len(x) // 4, n_of(0.015))
    x[-f:] *= np.linspace(1, 0, f)
    x[: n_of(0.0015)] *= np.linspace(0, 1, n_of(0.0015))
    return x


def save(name, data, kbps=80):
    os.makedirs(OUT, exist_ok=True)
    data = finish(data)
    wav = os.path.join(OUT, name + ".wav")
    with wave.open(wav, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(data, -1, 1) * 32767).astype(np.int16).tobytes())
    mp3 = os.path.join(OUT, name + ".mp3")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-ac", "1", "-b:a", f"{kbps}k", mp3], check=True)
    os.remove(wav)
    print("✓", name, f"{os.path.getsize(mp3) // 1024} KB", f"{len(data) / SR:.2f}s")


# ---------------------------------------------------------------- arme

def gunshot(body_hz, boom_hz, crack=1.0, body=1.0, boom=1.0, body_tau=0.06, boom_tau=0.12,
            tail=1.4, mech=None, rough=0.0, wet=0.45, length=1.2):
    """
    O împușcătură: (1) unda de șoc — un „crack” scurt, foarte larg; (2) corpul exploziei — zgomot
    saturat în banda armei; (3) bubuitura joasă din piept; (4) mecanismul; (5) ecourile.
    """
    crack_s = filt(noise(0.006) * np.hanning(n_of(0.006)), "high", 1800) * crack
    b = noise(0.4)
    b = filt(b, "band", (body_hz * 0.35, body_hz * 2.8)) * exp_env(0.4, body_tau, 0.0008)
    if rough:
        b *= 1 + rough * filt(noise(0.4), "low", 90) * 3  # metal care vibrează, țeavă ruginită
    b = sat(b * 4, 2.5) * body
    lo = sweep_sine(0.5, boom_hz * 2.2, boom_hz, tau_f=0.02) * exp_env(0.5, boom_tau, 0.002) * boom
    parts = [(crack_s, 0, 1.4), (b, 0.0005, 1.0), (lo, 0, 0.9)]
    if mech:
        parts += mech
    x = mix(length, *parts)
    return reverb(x, wet=wet, tail=tail)


def click(freq=4200, dur=0.012, tau=0.004, gain=1.0):
    return modal(dur + 0.03, [(freq, 1, tau), (freq * 1.53, 0.6, tau * 0.7), (freq * 0.42, 0.4, tau * 1.5)]) * gain


def slide(sec=0.09, lo=1200, hi=5000):
    """Metal care alunecă pe metal (închizătorul)."""
    s = filt(noise(sec), "band", (lo, hi)) * np.hanning(n_of(sec)) * (1 + 0.6 * np.sin(2 * np.pi * 80 * t_of(sec)))
    return s * 0.5


def casing(at_list=(0.0, 0.11, 0.19)):
    """Tubul de alamă care cade și sare pe zăpadă tare: 3 clinchete tot mai mici."""
    out = np.zeros(n_of(0.5))
    for k, at in enumerate(at_list):
        c = modal(0.12, [(5200, 1, 0.025), (7900, 0.6, 0.018), (11300, 0.3, 0.012), (3100, 0.3, 0.03)])
        out = place(out, c, at, 0.6 / (k + 1))
    return out


def string_twang(f0, sec=0.5, bright=0.6):
    """Coarda arcului / arbaletei: Karplus-Strong (o coardă ciupită)."""
    n = n_of(sec)
    period = int(SR / f0)
    buf = rng.uniform(-1, 1, period)
    out = np.zeros(n)
    for i in range(n):
        out[i] = buf[i % period]
        buf[i % period] = 0.5 * (buf[i % period] + buf[(i + 1) % period]) * (0.985 + 0.012 * bright)
    return out * exp_env(sec, sec / 3)


def make_guns():
    for v in range(2):
        # Pistol: pocnitură scurtă, medie, închizătorul care sare înapoi.
        save(f"gun_pistol{v + 1}", gunshot(1400, 95, crack=1.1, body_tau=0.035, boom=0.6, boom_tau=0.07, tail=1.0, wet=0.4,
                                         mech=[(click(3800), 0.004, 0.25), (slide(0.05), 0.03, 0.4)]))
        # Pușca: unda de șoc supersonică (crack tăios) + bubuitură adâncă și coadă lungă prin pădure.
        save(f"gun_rifle{v + 1}", gunshot(900, 70, crack=1.6, body_tau=0.08, boom=1.0, boom_tau=0.18, tail=2.2, wet=0.55, length=1.6))
        # Pușca de asalt: strânsă, puternică, coadă scurtă (să nu se îngrămădească la rafală).
        save(f"gun_ar{v + 1}", gunshot(1100, 85, crack=1.2, body_tau=0.045, boom=0.8, boom_tau=0.09, tail=0.9, wet=0.3, length=0.7,
                                     mech=[(click(4500, tau=0.003), 0.002, 0.2)]))
        # Flinta cu alice: lată, „BUM” gros, mult zgomot.
        save(f"gun_shotgun{v + 1}", gunshot(650, 60, crack=0.8, body=1.3, body_tau=0.11, boom=1.2, boom_tau=0.22, tail=2.0, wet=0.55, length=1.6))
        # Țeava ruginită / mitraliera din țevi: murdară, zăngăne.
        save(f"gun_rusty{v + 1}", gunshot(1000, 80, crack=0.9, body_tau=0.06, boom=0.8, rough=0.8, tail=1.3, wet=0.45,
                                        mech=[(modal(0.25, [(1900, 0.5, 0.05), (2700, 0.4, 0.04), (850, 0.5, 0.07)]), 0.01, 0.35)]))
        save(f"gun_pipe{v + 1}", gunshot(1250, 90, crack=1.0, body_tau=0.04, boom=0.7, boom_tau=0.08, rough=0.5, tail=0.8, wet=0.3, length=0.6))
    # Arbaleta de os: coarda (twang) + lemnul care lovește + șuieratul săgeții.
    for v in range(2):
        tw = string_twang(rng.uniform(95, 115), 0.45) * 0.8
        thwack = modal(0.15, [(260, 1, 0.025), (620, 0.6, 0.015), (1400, 0.3, 0.008)])
        whiz = filt(noise(0.35), "band", (2500, 7000)) * np.hanning(n_of(0.35)) * 0.25
        save(f"gun_bow{v + 1}", reverb(mix(0.6, (tw, 0, 1), (thwack, 0, 0.9), (whiz, 0.03, 1)), wet=0.25, tail=0.8))
    # Lancea de gheață: pocnitură + gheață care se sparge + sclipire cristalină.
    ice = modal(0.9, [(2637, 0.5, 0.35), (3951, 0.4, 0.28), (5274, 0.3, 0.22), (7040, 0.2, 0.15)])
    save("gun_ice", reverb(mix(1.0, (gunshot(1300, 90, crack=1.3, body_tau=0.04, boom=0.5, tail=0.6, wet=0.2, length=0.4), 0, 0.8),
                                (ice, 0.01, 0.6), (grains(0.25, 300, band=(3000, 9000), decay=0.08), 0.0, 0.4)), wet=0.4))

    # Reîncărcarea: încărcătorul iese (clic + plastic), intră (clac), închizătorul (alunecare + clic).
    mag_out = mix(0.25, (click(2600, tau=0.006), 0, 0.8), (slide(0.08, 600, 2500), 0.02, 0.6))
    mag_in = mix(0.25, (modal(0.2, [(1700, 1, 0.02), (2900, 0.6, 0.015), (900, 0.7, 0.03)]), 0, 1), (click(5200), 0.008, 0.7))
    bolt = mix(0.35, (slide(0.12, 1500, 6000), 0, 0.8), (click(3600, tau=0.005), 0.12, 1.0), (click(4800), 0.16, 0.6))
    save("reload_out", mag_out)
    save("reload_in", mag_in)
    save("reload_bolt", bolt)
    # Pompa flintei: „cik-ciac”.
    save("reload_pump", mix(0.45, (slide(0.08, 500, 3000), 0, 0.9), (click(2400, tau=0.008), 0.08, 1.0),
                            (slide(0.07, 700, 3500), 0.2, 0.9), (click(3000, tau=0.008), 0.27, 1.0)))
    save("dry_click", mix(0.15, (click(3300, tau=0.004), 0, 1)))
    save("casing1", casing())
    save("casing2", casing((0.0, 0.09, 0.15, 0.2)))


# ---------------------------------------------------------------- unelte

def whoosh(sec=0.28, lo=300, hi=1600, gain=1.0):
    """Ceva greu care taie aerul: zgomot într-o bandă care urcă, cu volum în formă de clopot."""
    t = t_of(sec)
    out = np.zeros_like(t)
    hop = 256
    x = noise(sec)
    for i in range(0, len(t), hop):
        k = i / len(t)
        f = lo + (hi - lo) * np.sin(np.pi * k * 0.5)
        seg = x[max(0, i - 512): i + hop]
        y = filt(seg, "band", (f * 0.6, f * 1.5))[-hop:]
        out[i:i + len(y)] = y[: len(out) - i]
    return out * np.sin(np.pi * t / sec) ** 2 * gain


def wood_hit(big=1.0):
    """Târnăcopul / toporul în lemn înghețat: „toc” (rezonanțe de lemn) + scârțâit + așchii."""
    m = modal(0.35, [(165 * big, 1, 0.06), (390, 0.6, 0.035), (730, 0.45, 0.02), (1250, 0.3, 0.012), (2100, 0.15, 0.008)])
    knock = filt(noise(0.02) * np.hanning(n_of(0.02)), "band", (800, 4000)) * 0.8
    chips = grains(0.25, 120, band=(1500, 6000), decay=0.06) * 0.35
    creak = sweep_sine(0.3, 210, 150) * exp_env(0.3, 0.1, 0.02) * 0.08
    snow = grains(0.5, 60, band=(2000, 7000), decay=0.2) * 0.2  # zăpadă care cade din crengi
    return reverb(mix(0.8, (m, 0, 1), (knock, 0, 1), (chips, 0.005, 1), (creak, 0.02, 1), (snow, 0.05, 1)), wet=0.3, tail=1.0)


def stone_hit():
    """Târnăcop de fier în piatră: clinchet metalic (multe rezonanțe înalte) + pietriș + scântei."""
    m = modal(0.9, [(1180, 0.6, 0.12), (2650, 1, 0.09), (3720, 0.7, 0.07), (5180, 0.5, 0.05), (7400, 0.3, 0.03)])
    thud = sweep_sine(0.15, 220, 120) * exp_env(0.15, 0.04) * 0.6
    gravel = grains(0.4, 260, band=(1200, 7000), decay=0.12) * 0.55
    return reverb(mix(1.0, (m, 0, 0.8), (thud, 0, 1), (gravel, 0.008, 1)), wet=0.3, tail=1.2)


def snow_hit():
    """În gol: târnăcopul intră în zăpadă (scârțâit moale, granulat)."""
    crunch = grains(0.18, 600, dur=0.003, band=(900, 5000), decay=0.07)
    thump = sweep_sine(0.12, 140, 80) * exp_env(0.12, 0.03) * 0.5
    return mix(0.3, (crunch, 0, 1), (thump, 0, 1))


def flesh_hit(heavy=1.0):
    """Lovitură în carne: bufnitură joasă + umed (zgomot jos cu „lipăit”)."""
    thud = sweep_sine(0.25, 150 / heavy, 55 / heavy) * exp_env(0.25, 0.07 * heavy, 0.002)
    wet = filt(noise(0.15), "band", (300, 1800)) * exp_env(0.15, 0.03) * (1 + np.sin(2 * np.pi * 35 * t_of(0.15)))
    return mix(0.35, (thud, 0, 1), (wet, 0.003, 0.6))


def make_tools():
    for v in range(3):
        save(f"pick_wood{v + 1}", wood_hit(1 + v * 0.08))
        save(f"pick_stone{v + 1}", stone_hit())
    save("pick_snow1", snow_hit())
    save("pick_snow2", snow_hit())
    save("swing1", whoosh(0.3, 250, 1400))
    save("swing2", whoosh(0.26, 320, 1700))
    save("hit_flesh1", flesh_hit(1.0))
    save("hit_flesh2", flesh_hit(1.3))
    # Bradul cade: trosnet lung de lemn, apoi prăbușirea în zăpadă și crengile.
    crack = np.zeros(n_of(1.2))
    for k in range(18):
        at = (k / 18) ** 1.5 * 1.1
        crack = place(crack, modal(0.12, [(300 + k * 30, 1, 0.02), (900, 0.5, 0.01)]) * (0.3 + k / 18), at)
    crash = filt(noise(1.6), "low", 900) * exp_env(1.6, 0.35, 0.03)
    branches = grains(1.4, 180, band=(1000, 6000), decay=0.4) * 0.6
    boom = sweep_sine(0.8, 90, 40) * exp_env(0.8, 0.25) * 0.9
    save("tree_fall", reverb(mix(3.0, (crack, 0, 0.8), (crash, 1.15, 1.0), (branches, 1.1, 1.0), (boom, 1.15, 1.0)), wet=0.45, tail=2.0))
    # Zăcământul se sparge: bubuitură + bolovani care se rostogolesc + clinchete.
    rocks = np.zeros(n_of(1.2))
    for k in range(9):
        rocks = place(rocks, modal(0.2, [(rng.uniform(400, 900), 1, 0.03), (rng.uniform(1200, 2400), 0.5, 0.02)]) * rng.uniform(0.3, 1), rng.uniform(0.02, 0.9))
    save("ore_break", reverb(mix(1.6, (stone_hit(), 0, 0.8), (filt(noise(0.6), "low", 700) * exp_env(0.6, 0.15), 0, 0.9),
                                 (rocks, 0.05, 0.8), (grains(1.0, 300, band=(1500, 7000), decay=0.3), 0.02, 0.6)), wet=0.4, tail=1.5))
    # Drujba: motorul în doi timpi (fierăstrău jos, modulat) + lanțul care mușcă din lemn.
    sec = 0.7
    t = t_of(sec)
    f = 105 + 12 * np.sin(2 * np.pi * 3 * t) + 4 * filt(noise(sec), "low", 20) * 30
    ph = np.cumsum(f) / SR
    motor = (2 * (ph % 1) - 1) * (0.6 + 0.4 * np.sign(np.sin(2 * np.pi * ph)))
    motor = filt(sat(motor * 2, 2), "low", 3500)
    chain = filt(noise(sec), "band", (1800, 6500)) * (0.6 + 0.4 * np.sin(2 * np.pi * 210 * t))
    chips = grains(sec, 200, band=(1500, 7000)) * 0.5
    env = np.minimum(1, t / 0.03) * np.minimum(1, (sec - t) / 0.05)
    save("saw_cut1", mix(sec, (motor * env, 0, 0.8), (chain * env, 0, 0.45), (chips * env, 0, 1)))
    f2 = 72 + 6 * np.sin(2 * np.pi * 2 * t)
    ph2 = np.cumsum(f2) / SR
    idle = filt(sat((2 * (ph2 % 1) - 1) * 2, 2), "low", 1800) * env
    save("saw_idle", mix(sec, (idle, 0, 0.8)))


# ---------------------------------------------------------------- pescuit

def bloop(f0=380, f1=900, sec=0.12):
    """Bulbuc de apă: un ton care urcă repede (bula care se închide)."""
    return sweep_sine(sec, f0, f1) * exp_env(sec, sec / 3, 0.004)


def splash(sec=0.6, size=1.0):
    """Stropi: zgomot cu bulbuci, picături care recad."""
    body = filt(noise(sec), "band", (500 / size, 5000)) * exp_env(sec, sec / 4, 0.005)
    drops = np.zeros(n_of(sec + 0.6))
    for _ in range(int(14 * size)):
        drops = place(drops, bloop(rng.uniform(500, 1400), rng.uniform(1500, 3200), rng.uniform(0.03, 0.07)) * rng.uniform(0.1, 0.4), rng.uniform(0.05, sec + 0.4))
    return mix(sec + 0.7, (body, 0, 1), (drops, 0, 1))


def ratchet(sec=0.35, rate=38, freq=3200):
    """Mulineta: clicuri rapide de clichet."""
    out = np.zeros(n_of(sec))
    i = 0.0
    while i < sec:
        out = place(out, click(freq * rng.uniform(0.95, 1.05), tau=0.002) * rng.uniform(0.6, 1), i)
        i += 1 / rate
    return out[: n_of(sec)]


def make_fishing():
    zip_line = filt(noise(0.45), "band", (2500, 8000)) * np.hanning(n_of(0.45)) * 0.5
    save("fish_cast", mix(1.4, (whoosh(0.35, 500, 2500), 0, 0.7), (ratchet(0.4, 70, 3800), 0.05, 0.4), (zip_line, 0.08, 1),
                          (bloop(300, 700, 0.15), 0.75, 0.8), (splash(0.25, 0.5), 0.75, 0.5)))
    save("fish_bite", mix(0.5, (bloop(260, 650, 0.14), 0, 1), (bloop(420, 1000, 0.08), 0.12, 0.7), (splash(0.15, 0.4), 0.02, 0.4)))
    save("fish_reel1", mix(0.4, (ratchet(0.32, 40, 3000), 0, 0.8), (sweep_sine(0.3, 1800, 2400) * exp_env(0.3, 0.12) * 0.15, 0, 1)))
    save("fish_reel2", mix(0.4, (ratchet(0.3, 46, 3400), 0, 0.8), (splash(0.12, 0.4), 0.05, 0.4)))
    # Peștele se smucește: firul zbârnâie (coardă) și apa plescăie tare.
    save("fish_tug", mix(0.8, (string_twang(320, 0.4, 0.9) * 0.6, 0, 1), (splash(0.3, 0.9), 0.02, 0.9)))
    # Prins: peștele sare din apă, stropi mari, apoi se zbate pe gheață (pocnituri moi).
    flaps = np.zeros(n_of(0.8))
    for k in range(7):
        flaps = place(flaps, flesh_hit(0.7) * 0.5, 0.05 + k * 0.1 + rng.uniform(0, 0.03))
    save("fish_catch", mix(1.8, (splash(0.6, 1.4), 0, 1), (flaps, 0.6, 0.6)))
    # Pierdut: firul se rupe (pocnitură + coardă care se destinde), apoi un „plop”.
    save("fish_lost", mix(0.8, (click(2400, tau=0.01), 0, 1), (string_twang(180, 0.35, 0.3) * 0.5, 0, 1), (bloop(500, 300, 0.12), 0.3, 0.5)))


# ---------------------------------------------------------------- atacurile zombilor, explozii, pași

def make_attacks():
    for v in range(3):
        # Ghearele: brațul taie aerul, ghearele sfâșie (zgomot rupt, modulat) și carnea.
        tear = filt(noise(0.18), "band", (900, 5000)) * exp_env(0.18, 0.05, 0.004) * (1 + 0.8 * np.sign(np.sin(2 * np.pi * rng.uniform(60, 110) * t_of(0.18))))
        save(f"claw{v + 1}", reverb(mix(0.6, (whoosh(0.2, 600, 2600), 0, 0.7), (tear, 0.14, 0.9), (flesh_hit(1.0), 0.15, 0.8)), wet=0.2, tail=0.7))
    for v in range(2):
        # Bâta brutei / pumnul boss-ului: șuierat greu, apoi o bufnitură uriașă cu os care trosnește.
        crunch = grains(0.15, 500, dur=0.003, band=(800, 4000), decay=0.05)
        save(f"club{v + 1}", reverb(mix(1.0, (whoosh(0.35, 150, 900), 0, 0.9), (flesh_hit(1.8), 0.3, 1.0), (crunch, 0.31, 0.7),
                                         (sweep_sine(0.5, 70, 30) * exp_env(0.5, 0.15), 0.3, 0.8)), wet=0.35, tail=1.2))
    # Mușcătura (fugari): dinți care se închid + sfâșiere scurtă.
    save("bite1", mix(0.4, (click(1800, tau=0.008) * 0.8, 0, 1), (grains(0.12, 600, dur=0.003, band=(600, 3000), decay=0.05), 0.01, 1), (flesh_hit(0.8), 0.02, 0.7)))
    # În zid: lemn care crapă.
    save("wall_hit1", reverb(mix(0.6, (wood_hit(0.8), 0, 1), (grains(0.3, 200, band=(800, 4000), decay=0.1), 0.01, 0.8)), wet=0.25))
    # Explozii: tunul / mina / umflatul.
    for v in range(2):
        boom = sweep_sine(2.0, 120, 30, tau_f=0.08) * exp_env(2.0, 0.45, 0.004)
        blast = sat(filt(noise(2.0), "low", 1800) * exp_env(2.0, 0.3, 0.002) * 3, 2.0)
        debris = grains(2.0, 120, band=(800, 5000), decay=0.6) * 0.6
        save(f"explosion{v + 1}", reverb(mix(2.6, (boom, 0, 1.0), (blast, 0, 0.9), (filt(noise(0.01), "high", 2000), 0, 1.5), (debris, 0.2, 1)), wet=0.6, tail=2.5))
    wet_burst = filt(noise(0.8), "band", (150, 1500)) * exp_env(0.8, 0.18, 0.003) * (1 + np.sin(2 * np.pi * 22 * t_of(0.8)))
    hiss = filt(noise(1.4), "high", 3000) * exp_env(1.4, 0.5, 0.05) * 0.25
    save("burst_gas", reverb(mix(2.0, (flesh_hit(2.2), 0, 1), (wet_burst, 0, 1), (hiss, 0.05, 1)), wet=0.45))
    # Pași în zăpadă: scârțâit granulat („cronț”), 4 variante.
    for v in range(4):
        crunch = grains(0.16, 900, dur=0.0025, band=(700, 4500), decay=0.06)
        save(f"step{v + 1}", mix(0.25, (crunch, 0, 1), (sweep_sine(0.08, 120, 70) * exp_env(0.08, 0.02) * 0.4, 0, 1)), kbps=48)


if __name__ == "__main__":
    make_guns()
    make_tools()
    make_fishing()
    make_attacks()
