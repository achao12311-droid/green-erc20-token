from fastapi import FastAPI
from pydantic import BaseModel

from ai.fraud_detection.duplicates import perceptual_status, sha256_hex
from ai.inference.adapters import action_recognition, forensics, scene_classification
from ai.verification.decision import decide

app = FastAPI(title="ECO verification", version="0.1.0")


class VerifyRequest(BaseModel):
    submissionId: str
    declaredAction: str
    videoSha256: str | None = None


@app.get("/health")
def health():
    return {"ok": True, "modelsConfigured": False, "gpuRequired": False}


@app.post("/verify")
def verify(body: VerifyRequest):
    decision = decide(False, False, False, None)
    return {
        "submissionId": body.submissionId,
        "predictedAction": None,
        "models": {
            "action": action_recognition(body.declaredAction),
            "scene": scene_classification(),
            "forensics": forensics(),
        },
        "duplicateDetection": {"sha256": body.videoSha256, "perceptual": perceptual_status()},
        "fraudRisk": decision["fraudRisk"],
        "decision": decision["decision"],
        "reason": decision["reason"],
    }


@app.post("/hash")
def hash_video(payload: bytes):
    return {"sha256": sha256_hex(payload)}
