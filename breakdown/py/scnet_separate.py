"""Splits a mix into drums, bass, other and vocals with SCNet XL IHF (MIT; py/scnet/LICENSE).

    python -I py/scnet_separate.py <mix> <checkpoint> <out folder>

Overlapping 11 s windows, each faded in and out, are added back together, as the model's own inference does. Writes
<out>/drums.wav, bass.wav, other.wav and vocals.wav (44.1 kHz stereo, float). Needs numpy, PyTorch and ffmpeg. On the
test tracks it took about 8 s per second of music on 8 CPU cores, against Demucs' 1.
"""
import os
import subprocess
import sys
import warnings

import numpy as np
import torch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scnet import SCNet  # noqa: E402

SR = 44100
SOURCES = ["drums", "bass", "other", "vocals"]
# the checkpoint's own configuration (config_musdb18_scnet_xl_more_wide_v5.yaml)
CONFIG = dict(sources=SOURCES, audio_channels=2, dims=[4, 64, 128, 256], nfft=4096, hop_size=1024, win_size=4096,
              normalized=True, band_SR=[0.230, 0.370, 0.400], band_stride=[1, 4, 4], band_kernel=[3, 4, 4],
              conv_depths=[3, 3, 3], compress=4, conv_kernel=3, num_dplayer=8, expand=1)
CHUNK, OVERLAP = 485100, 4  # 11 s windows, each sample covered by four


def read(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-vn", "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).T.copy()


def write(path, x):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-",
                    "-c:a", "pcm_f32le", path], input=np.ascontiguousarray(x.T, dtype=np.float32).tobytes(), check=True)


def demix(model, mix):
    step, fade, border = CHUNK // OVERLAP, CHUNK // 10, CHUNK - CHUNK // OVERLAP
    length = mix.shape[1]
    # padded at both ends so the first and last seconds get the same four windows as the middle
    x = np.pad(mix, ((0, 0), (border, border)), mode="reflect" if length > border else "constant")
    out = np.zeros((len(SOURCES), 2, x.shape[1]), dtype=np.float32)
    weight = np.zeros(x.shape[1], dtype=np.float32)
    w = np.ones(CHUNK, dtype=np.float32)
    w[:fade], w[-fade:] = np.linspace(0, 1, fade), np.linspace(1, 0, fade)
    with torch.inference_mode():
        for i in range(0, x.shape[1], step):
            part = x[:, i:i + CHUNK]
            n = part.shape[1]
            if n < CHUNK:
                part = np.pad(part, ((0, 0), (0, CHUNK - n)))
            y = model(torch.from_numpy(part)[None])[0].numpy()
            out[:, :, i:i + n] += y[:, :, :n] * w[:n]
            weight[i:i + n] += w[:n]
    out /= np.maximum(weight, 1e-8)
    return out[:, :, border:border + length]


def main():
    if len(sys.argv) != 4:
        sys.exit("usage: python -I py/scnet_separate.py <mix> <checkpoint> <out folder>")
    mix, ckpt, out = sys.argv[1:]
    # the model was trained with a rectangular STFT window; PyTorch warns about it on every window
    warnings.filterwarnings("ignore", message="A window was not provided")
    model = SCNet(**CONFIG)
    state = torch.load(ckpt, map_location="cpu", weights_only=True)
    model.load_state_dict(state.get("state_dict", state))
    model.eval()
    stems = demix(model, read(mix))
    os.makedirs(out, exist_ok=True)
    for name, s in zip(SOURCES, stems):
        write(os.path.join(out, f"{name}.wav"), s)


if __name__ == "__main__":
    main()
