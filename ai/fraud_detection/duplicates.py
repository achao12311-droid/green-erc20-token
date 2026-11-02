import hashlib


def sha256_hex(payload):
    if not isinstance(payload, (bytes, bytearray)):
        raise TypeError("payload must be bytes")
    return hashlib.sha256(payload).hexdigest()


def compare_sha256(left, right):
    return {"exact": left == right, "method": "sha256"}


def perceptual_status():
    return {"status": "not_configured", "reason": "frame_hasher_not_installed"}
