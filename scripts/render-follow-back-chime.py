#!/usr/bin/env python3
"""Render assets/sounds/follow-back.wav: the chime "Follow back all" plays when it appears.

Same notes as the web's src/lib/follow-back-chime.ts: G5 then D6 75ms later,
each a sine plus a faint octave, 6ms attack and an exponential fall.
Usage: python3 scripts/render-follow-back-chime.py
"""
import math, struct, wave, os

RATE = 44100
NOTES = [(784.0, 0.0, 0.32), (1175.0, 0.075, 0.42)]
PARTIALS = [(1, 1.0), (2, 0.18)]
PEAK = 0.06
FLOOR = 0.0001
ATTACK = 0.006
# Normalised so the loudest sample sits near 0.5 full scale; the player sets the level.
GAIN = 0.5 / (PEAK * 2.36)

length = max(at + dur for _, at, dur in NOTES) + 0.03
samples = [0.0] * int(RATE * length)
for freq, at, dur in NOTES:
    for multiple, level in PARTIALS:
        peak = PEAK * level
        start = int(at * RATE)
        for i in range(int((dur + 0.02) * RATE)):
            t = i / RATE
            if t < ATTACK:
                env = FLOOR * (peak / FLOOR) ** (t / ATTACK)
            elif t < dur:
                env = peak * (FLOOR / peak) ** ((t - ATTACK) / (dur - ATTACK))
            else:
                env = 0.0
            samples[start + i] += env * math.sin(2 * math.pi * freq * multiple * t)

out = os.path.join(os.path.dirname(__file__), "..", "assets", "sounds", "follow-back.wav")
with wave.open(out, "wb") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(RATE)
    w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, s * GAIN)) * 32767)) for s in samples))
print(out, len(samples), "samples")
