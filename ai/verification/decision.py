"""Decision rules for environmental submissions.

A matching model result can approve the submission. The model cannot sign a mint.
"""


def decide(models_configured, exact_duplicate, near_duplicate, action_matches):
    if exact_duplicate:
        return {"decision": "rejected", "reason": "exact_duplicate", "fraudRisk": "high", "duplicateKind": "sha256"}
    if near_duplicate:
        return {"decision": "rejected", "reason": "near_duplicate", "fraudRisk": "high", "duplicateKind": "perceptual"}
    if not models_configured or action_matches is None:
        return {"decision": "rejected", "reason": "model_not_configured", "fraudRisk": "unknown"}
    if action_matches is False:
        return {"decision": "rejected", "reason": "action_mismatch", "fraudRisk": "unknown"}
    return {"decision": "approved", "reason": "action_match", "fraudRisk": "unknown"}
