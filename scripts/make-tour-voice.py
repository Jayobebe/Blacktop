"""
Records the demo tour's narration in the pilot voice, ahead of time.

The tour used to make every line on the phone with the downloaded pilot voice,
which on a first run (the engine still starting) handed early lines to the
phone's own voice and the rest to the pilot: two voices, and lines out of time.
Now each line is a small file the tour plays through the same radio chain, so
it's always the pilot voice, on time, with nothing to download first.

Every line is read from the `voice: [...]` lists in src/pages/DemoTour.tsx (both
sides of a ride / drive or lean choice included) and its `tourSay(tr("..."))`
calls, translated from the app's
locale files, and spoken with the same Piper voice the app downloads for that
language (src/lib/pilotVoice/voices.ts) at its default settings. Languages
without a pilot voice (uk, ja, ko, zh, id, hi) get no files and keep the
phone's voice in radio style.

    py -3.11 -m pip install piper-tts soundfile numpy
    py -3.11 scripts/make-tour-voice.py            # every language
    py -3.11 scripts/make-tour-voice.py en de      # just these

Writes public/tour-voice/<lang>/<id>.mp3 (id = FNV-1a of the line as it's spoken,
in that language, as `voiceId` in src/components/demo/tourVoice.ts works it out:
keep the two in step) and
public/tour-voice/index.json, and removes files no line uses any more. Models
are cached in node_modules/.cache/tour-voice. Run it after changing a voice line
or its translation.
"""

import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
import soundfile as sf
from piper import PiperVoice

ROOT = Path(__file__).resolve().parent.parent
TOUR = ROOT / "src/pages/DemoTour.tsx"
VOICES = ROOT / "src/lib/pilotVoice/voices.ts"
LOCALES = ROOT / "src/lib/i18n/locales"
OUT = ROOT / "public/tour-voice"
CACHE = ROOT / "node_modules/.cache/tour-voice"
SAMPLE_RATE = 16_000  # the radio chain keeps 300-3,400 Hz: 16 kHz loses nothing it would let through


def fnv1a(text: str) -> str:
    h = 0x811C9DC5
    for b in text.encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return f"{h:08x}"


def tr_strings(block: str) -> list[str]:
    out = []
    for m in re.finditer(r'tr\("((?:[^"\\]|\\.)*)"', block):
        out.append(json.loads(f'"{m.group(1)}"'))
    return out


def tour_lines() -> list[str]:
    src = TOUR.read_text(encoding="utf-8")
    lines: list[str] = []
    blocks = [m.group(1) for m in re.finditer(r"voice: \[(.*?)\n\s*\],", src, re.S)]
    blocks += [m.group(0) for m in re.finditer(r'tourSay\(tr\("(?:[^"\\]|\\.)*"', src)]
    for block in blocks:
        for s in tr_strings(block):
            if s not in lines:
                lines.append(s)
    if not lines:
        sys.exit("No voice lines found in DemoTour.tsx")
    return lines


def pilot_voices() -> dict[str, tuple[str, str]]:
    """lang -> (voice id, HF path), as voices.ts builds them."""
    src = VOICES.read_text(encoding="utf-8")
    base = re.search(r"HF_BASE = '([^']+)'", src).group(1)
    out = {}
    for lang, vid in re.findall(r"^\s+(\w+): V\('([^']+)'", src, re.M):
        locale, name, quality = vid.split("-")
        path = f"{locale.split('_')[0]}/{locale}/{name}/{quality}/{vid}.onnx"
        out[lang] = (vid, f"{base}/{urllib.parse.quote(path)}")
    return out


def fetch(url: str, to: Path):
    if to.exists() and to.stat().st_size > 0:
        return
    to.parent.mkdir(parents=True, exist_ok=True)
    print(f"  downloading {to.name}")
    tmp = to.with_suffix(to.suffix + ".part")
    with urllib.request.urlopen(url) as res, open(tmp, "wb") as f:
        while chunk := res.read(1 << 20):
            f.write(chunk)
    tmp.replace(to)


def resample(audio: np.ndarray, rate: int) -> np.ndarray:
    if rate == SAMPLE_RATE:
        return audio
    n = int(round(len(audio) * SAMPLE_RATE / rate))
    return np.interp(np.linspace(0, len(audio) - 1, n), np.arange(len(audio)), audio).astype(np.float32)


def main():
    lines = tour_lines()
    voices = pilot_voices()
    langs = sys.argv[1:] or list(voices)
    index_file = OUT / "index.json"
    index = json.loads(index_file.read_text(encoding="utf-8")) if index_file.exists() else {}
    for lang in langs:
        if lang not in voices:
            print(f"{lang}: no pilot voice, skipped")
            continue
        vid, url = voices[lang]
        model = CACHE / f"{vid}.onnx"
        fetch(url, model)
        fetch(url + ".json", Path(str(model) + ".json"))
        voice = PiperVoice.load(str(model))
        dic = {} if lang == "en" else json.loads((LOCALES / f"{lang}.json").read_text(encoding="utf-8"))
        folder = OUT / lang
        folder.mkdir(parents=True, exist_ok=True)
        made = []
        for line in lines:
            text = line if lang == "en" else dic.get(line)
            if not text:
                print(f"  {lang}: no translation for {line!r}, left to the phone's voice")
                continue
            ident = fnv1a(text)
            chunks = list(voice.synthesize(text))
            audio = np.concatenate([c.audio_float_array for c in chunks]).astype(np.float32)
            audio = resample(audio, chunks[0].sample_rate)
            sf.write(folder / f"{ident}.mp3", audio, SAMPLE_RATE, format="MP3", bitrate_mode="CONSTANT", compression_level=0.9)
            made.append(ident)
        for old in folder.glob("*.mp3"):
            if old.stem not in made:
                old.unlink()
        index[lang] = sorted(made)
        size = sum(p.stat().st_size for p in folder.glob("*.mp3"))
        print(f"{lang}: {len(made)} lines, {size // 1024} KB")
    index_file.write_text(json.dumps(dict(sorted(index.items())), indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
