"""Transcribes a vocal stem on this machine with faster-whisper, word by word.

    python3 -I py/words.py <vocals audio> <out.json> [--model small] [--language en]

Writes {"words": [{"start", "end", "text", "probability"}]}. Run it on the vocal stem, not the mix: the music
buries words. Whisper hears speech and voice-over well and often misses sung lines; name those by ear.
"""
import argparse
import json
import subprocess

import numpy as np
from faster_whisper import WhisperModel


def decode(path):
    """16 kHz mono float32 via ffmpeg, which the kit needs anyway (whisper's own decoder breaks across PyAV versions)."""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("audio")
    p.add_argument("out")
    p.add_argument("--model", default="small")
    p.add_argument("--language", default=None)
    a = p.parse_args()
    # the CPU, always: "auto" picks a GPU whose CUDA libraries are often only half installed, and crashes
    model = WhisperModel(a.model, device="cpu", compute_type="int8")
    # Each segment starts fresh: carrying text over makes whisper repeat a chorus it has already heard. A gentle voice
    # filter skips the stem's silent stretches, where whisper invents words and where faster-whisper 1.2's word
    # alignment crashes on a segment with no text.
    segments, _ = model.transcribe(decode(a.audio), language=a.language, word_timestamps=True, condition_on_previous_text=False,
                                   vad_filter=True, vad_parameters={"threshold": 0.15, "min_silence_duration_ms": 1500, "speech_pad_ms": 500})
    words = [{"start": round(w.start, 2), "end": round(w.end, 2), "text": w.word.strip(), "probability": round(w.probability, 3)}
             for s in segments for w in (s.words or []) if w.word.strip()]
    with open(a.out, "w") as f:
        json.dump({"words": words}, f, indent=1)
    print(f"{len(words)} words")


if __name__ == "__main__":
    main()
