"""Decision rules for environmental submissions.

APPROVED is intentionally absent. A model result is not allowed to mint ECO.
"""


def decide(models_configured, exact_duplicate, near_duplicate, action_matches):
    if exact_duplicate or near_duplicate:
        return {"decision": "rejected", "reason": "duplicate", "fraudRisk": "high"}
    if not models_configured or action_matches is None:
        return {"decision": "pending_review", "reason": "model_not_configured", "fraudRisk": "unknown"}
    if action_matches is False:
        return {"decision": "pending_review", "reason": "action_mismatch", "fraudRisk": "unknown"}
    return {"decision": "pending_review", "reason": "human_review_required", "fraudRisk": "unknown"}
