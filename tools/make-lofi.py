#!/usr/bin/env python3
"""Original instrumental lo-fi bed for Grip 'N Rip.

Written for this game in 2026. No samples from other songs. Synthesized
from sines, a soft noise hat, and a quiet vinyl hiss, then encoded to mp3.
Public-domain dedication: the author of this file waives copyright in the
resulting audio to the extent allowed.
"""
import math, random, struct, wave, subprocess, os

SR = 22050
BPM = 76
BEAT = 60 / BPM
BARS = 8
DUR = BARS * 4 * BEAT
N = int(SR * DUR)
random.seed(7)

buf = [0.0] * N

def add(t0, t1, fn, gain):
    a = max(0, int(t0 * SR))
    b = min(N, int(t1 * SR))
    for i in range(a, b):
        buf[i] += fn((i - a) / SR, (b - a) / SR) * gain

def env(u, dur, a=0.02, rel=0.08):
    if u < 0 or u > dur:
        return 0.0
    att = min(1.0, u / a) if a else 1
    relv = min(1.0, (dur - u) / rel) if rel else 1
    return att * relv

def tone(freq, u, dur, partials):
    e = env(u, dur, 0.018, min(0.35, dur * 0.45))
    s = 0.0
    for k, g in partials:
        s += math.sin(2 * math.pi * freq * k * u) * g
    return s * e

# ii–V–I in D, jazzy sevenths. Chords only, no borrowed melody.
# Dmaj7, Bm7, Em7, A7, repeating with a small voicing change.
CHORDS = [
    (0, [73.4, 110.0, 146.8, 220.0, 277.2]),          # Dmaj7
    (2, [61.7, 92.5, 123.5, 185.0, 233.1]),           # B minor-ish low
    (4, [82.4, 123.5, 164.8, 246.9, 311.1]),          # Em7
    (6, [55.0, 110.0, 164.8, 220.0, 277.2]),          # A7-ish
]
RHODES = [(1, 1.0), (2, 0.28), (3, 0.12), (4.01, 0.05)]

for bar in range(BARS):
    step = bar % 4
    start, notes = CHORDS[step]
    t = bar * 4 * BEAT
    # soft electric-piano stab, slightly detuned second layer
    for n in notes:
        add(t, t + BEAT * 3.2, lambda u, d, f=n: tone(f, u, d, RHODES), 0.045)
        add(t, t + BEAT * 3.2, lambda u, d, f=n * 1.004: tone(f, u, d, RHODES), 0.02)
    # bass on beats 1 and 3
    root = notes[0]
    for beat in (0, 2):
        tb = t + beat * BEAT
        add(tb, tb + BEAT * 0.9, lambda u, d, f=root: tone(f * 0.5, u, d, [(1, 1), (2, 0.15)]), 0.16)

# dusty kick + hat. Kick is a falling sine, not a square wave.
for bar in range(BARS):
    for beat in range(4):
        t = (bar * 4 + beat) * BEAT
        def kick(u, d):
            f = 90 * (0.45 ** (u / 0.12))
            return math.sin(2 * math.pi * f * u) * env(u, 0.18, 0.004, 0.08)
        add(t, t + 0.2, kick, 0.34 if beat % 2 == 0 else 0.2)
        # hat on the off-8ths
        for k in (0.5,):
            th = t + k * BEAT
            def hat(u, d, ph=random.random()):
                return (random.random() * 2 - 1) * env(u, 0.04, 0.002, 0.02)
            add(th, th + 0.045, hat, 0.035)

# quiet filtered hiss so the loop isn't sterile
rnd = random.Random(3)
hiss = [rnd.random() * 2 - 1 for _ in range(N)]
acc = 0.0
for i in range(N):
    acc = acc * 0.92 + hiss[i] * 0.08
    buf[i] += acc * 0.015

# gentle fade in/out so the file can loop without a click
fade = int(0.04 * SR)
for i in range(fade):
    buf[i] *= i / fade
    buf[-1 - i] *= i / fade

peak = max(1e-6, max(abs(x) for x in buf))
scale = 0.72 / peak
pcm = b''.join(struct.pack('<h', max(-32767, min(32767, int(x * scale * 32767)))) for x in buf)
wav = '/tmp/lofi-switchback.wav'
with wave.open(wav, 'w') as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm)
out = os.path.join(os.path.dirname(__file__), '..', 'music', 'lofi-switchback.mp3')
subprocess.check_call(['ffmpeg', '-y', '-i', wav, '-codec:a', 'libmp3lame', '-qscale:a', '8', '-ac', '1', out], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
print(os.path.abspath(out), os.path.getsize(out), 'bytes', round(DUR, 2), 's')
