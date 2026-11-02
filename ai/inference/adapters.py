"""Model adapters. No checkpoint is downloaded or loaded."""


def action_recognition(declared_action):
    return {
        "status": "not_configured",
        "declaredAction": declared_action,
        "predictedAction": None,
        "model": None,
    }


def scene_classification():
    return {"status": "not_configured", "scene": None, "model": None}


def forensics():
    return {
        "status": "not_configured",
        "claim": "No forensic model is loaded. This service cannot prove a video is real.",
    }
