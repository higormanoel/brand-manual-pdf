"""Optional Pillow fallback for real timestamped Studio recording frames."""
import json
import sys
from pathlib import Path
from PIL import Image

source, destination = Path(sys.argv[1]), Path(sys.argv[2])
frames = json.loads((source / "frames.json").read_text())
images, durations = [], []
for index, frame in enumerate(frames):
    with Image.open(source / frame["name"]) as image:
        image = image.convert("RGB")
        image.thumbnail((960, 960), Image.Resampling.LANCZOS)
        images.append(image.quantize(colors=128))
    next_time = frames[index + 1]["time"] if index + 1 < len(frames) else frame["time"] + 200
    durations.append(max(20, round((next_time - frame["time"]) / 10) * 10))
images[0].save(destination, save_all=True, append_images=images[1:], duration=durations, loop=0, optimize=True)
