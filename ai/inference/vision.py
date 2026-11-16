"""Frame classifier for environmental submissions.

MobileNetV2 sees objects in sampled frames. It does not prove that a person
performed the declared activity, and it does not prove the video is real.
License of the checkpoint: Apache-2.0, ONNX Model Zoo, about 14 MB.
"""

import math
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

MODEL_URL = "https://media.githubusercontent.com/media/onnx/models/main/validated/vision/classification/mobilenet/model/mobilenetv2-12.onnx"
MAX_MODEL_BYTES = 16_000_000
EXPECTED_MODEL_BYTES = 13_964_571
MODEL_DIR = Path(__file__).resolve().parents[1] / "models"
MODEL_PATH = MODEL_DIR / "mobilenetv2-12.onnx"
LABEL_PATH = MODEL_DIR / "imagenet_classes.txt"

ACTION_LABELS = {
    "PICK_UP_LITTER": {"plastic bag", "water bottle", "packet", "ashcan", "bucket", "carton", "hamper", "garbage truck", "pop bottle", "milk can"},
    "RECYCLING": {"water bottle", "water jug", "bottlecap", "beer bottle", "wine bottle", "carton", "packet", "pop bottle", "pill bottle", "milk can"},
    "PARK_CLEANUP": {"park bench", "fountain", "lawn mower", "picket fence", "worm fence", "plastic bag", "ashcan", "chainlink fence"},
    "BEACH_CLEANUP": {"seashore", "sandbar", "lakeside", "promontory", "cliff", "plastic bag", "water bottle", "ashcan"},
    "TREE_PLANTING": {"pot", "daisy", "acorn", "buckeye", "corn", "cardoon", "rapeseed", "yellow lady's slipper"},
    "ENVIRONMENTAL_EVENT": {"park bench", "microphone", "backpack", "umbrella", "sunglass", "scoreboard"},
}

MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def model_ready():
    return MODEL_PATH.is_file() and LABEL_PATH.is_file() and MODEL_PATH.stat().st_size == EXPECTED_MODEL_BYTES


def ensure_model():
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    if not LABEL_PATH.is_file():
        raise FileNotFoundError("imagenet_classes.txt is missing")
    if model_ready():
        return
    request = urllib.request.Request(MODEL_URL, method="GET")
    with urllib.request.urlopen(request, timeout=60) as response:
        payload = response.read(MAX_MODEL_BYTES + 1)
    if len(payload) != EXPECTED_MODEL_BYTES or len(payload) > MAX_MODEL_BYTES:
        raise RuntimeError("refusing unexpected MobileNet file size")
    MODEL_PATH.write_bytes(payload)


def labels():
    return [line.strip() for line in LABEL_PATH.read_text(encoding="utf-8").splitlines() if line.strip()]


def matches(declared_action, observed_labels):
    allowed = ACTION_LABELS.get(declared_action)
    if not allowed:
        return False
    return any(label in allowed for label in observed_labels)


def average_hash(image):
    small = image.convert("L").resize((8, 8))
    pixels = list(small.getdata())
    average = sum(pixels) / len(pixels)
    bits = "".join("1" if pixel >= average else "0" for pixel in pixels)
    return f"{int(bits, 2):016x}"


def hamming(left, right):
    return (int(left, 16) ^ int(right, 16)).bit_count()


def near_duplicate(frame_hashes, prior_hashes, limit=8):
    for current in frame_hashes:
        for previous in prior_hashes:
            if previous and hamming(current, previous) <= limit:
                return True
    return False


def _softmax(values):
    peak = max(values)
    shifted = [math.exp(value - peak) for value in values]
    total = sum(shifted)
    return [item / total for item in shifted]


def classify_images(images):
    import onnxruntime as ort

    ensure_model()
    names = labels()
    session = ort.InferenceSession(str(MODEL_PATH), providers=["CPUExecutionProvider"])
    input_name = session.get_inputs()[0].name
    observed = []
    for image in images:
        array = np.asarray(image.convert("RGB").resize((224, 224)), dtype=np.float32) / 255.0
        array = (array - MEAN) / STD
        array = np.transpose(array, (2, 0, 1))[None, :, :, :]
        scores = session.run(None, {input_name: array})[0][0].tolist()
        probabilities = _softmax(scores)
        ranked = sorted(enumerate(probabilities), key=lambda item: item[1], reverse=True)[:5]
        observed.extend(names[index] for index, probability in ranked if probability >= 0.05)
    return observed


def sample_video(path, frame_count=8):
    import cv2

    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        raise RuntimeError("undecodable_video")
    total = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    if total <= 0:
        total = frame_count
    indexes = {min(total - 1, max(0, round(i * (total - 1) / max(frame_count - 1, 1)))) for i in range(frame_count)}
    images = []
    hashes = []
    for index in sorted(indexes):
        capture.set(cv2.CAP_PROP_POS_FRAMES, index)
        ok, frame = capture.read()
        if not ok:
            continue
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        image = Image.fromarray(rgb)
        images.append(image)
        hashes.append(average_hash(image))
    capture.release()
    if not images:
        raise RuntimeError("undecodable_video")
    return images, hashes
