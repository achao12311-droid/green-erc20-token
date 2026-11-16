"""Read one video and print a verification decision. No signing key is used."""

import argparse
import json

from ai.inference.vision import classify_images, matches, near_duplicate, sample_video
from ai.verification.decision import decide


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", required=True)
    parser.add_argument("--action", required=True)
    parser.add_argument("--priors", default="")
    args = parser.parse_args()
    try:
        images, frame_hashes = sample_video(args.file)
        observed = classify_images(images)
        priors = [item for item in args.priors.split(",") if item]
        similar = near_duplicate(frame_hashes, priors)
        result = decide(True, False, similar, matches(args.action, observed))
        payload = {
            "decision": result["decision"],
            "reason": result["reason"],
            "predictedAction": args.action if result["decision"] == "approved" else None,
            "modelsConfigured": True,
            "exactDuplicate": False,
            "nearDuplicate": similar,
            "perceptual": "average_hash",
            "observedLabels": observed[:12],
            "frameHashes": frame_hashes,
            "model": "mobilenetv2-12",
        }
    except Exception as error:
        payload = {
            "decision": "rejected",
            "reason": str(error) if str(error) == "undecodable_video" else "model_failed",
            "predictedAction": None,
            "modelsConfigured": False,
            "exactDuplicate": False,
            "nearDuplicate": False,
            "perceptual": "average_hash",
            "observedLabels": [],
            "frameHashes": [],
            "model": None,
        }
    print(json.dumps(payload))


if __name__ == "__main__":
    main()
