import hashlib
import unittest

from ai.fraud_detection.duplicates import compare_sha256, perceptual_status, sha256_hex
from ai.inference.adapters import action_recognition
from ai.verification.decision import decide


class DecisionTest(unittest.TestCase):
    def test_unconfigured_model_is_not_approved(self):
        result = decide(False, False, False, None)
        self.assertEqual(result["decision"], "pending_review")
        self.assertNotEqual(result["fraudRisk"], "low")

    def test_exact_duplicate_is_rejected(self):
        result = decide(True, True, False, True)
        self.assertEqual(result["decision"], "rejected")

    def test_matching_action_still_needs_a_person(self):
        result = decide(True, False, False, True)
        self.assertEqual(result["decision"], "pending_review")
        self.assertEqual(result["reason"], "human_review_required")

    def test_sha256_detects_the_same_bytes(self):
        digest = sha256_hex(b"same-video")
        self.assertEqual(digest, hashlib.sha256(b"same-video").hexdigest())
        self.assertTrue(compare_sha256(digest, digest)["exact"])
        self.assertFalse(compare_sha256(digest, sha256_hex(b"other"))["exact"])

    def test_perceptual_hash_is_not_faked(self):
        self.assertEqual(perceptual_status()["status"], "not_configured")

    def test_action_adapter_does_not_invent_a_label(self):
        self.assertIsNone(action_recognition("BEACH_CLEANUP")["predictedAction"])


if __name__ == "__main__":
    unittest.main()
