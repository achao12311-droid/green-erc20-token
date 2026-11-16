import hashlib
import unittest

from ai.fraud_detection.duplicates import compare_sha256, perceptual_status, sha256_hex
from ai.inference.adapters import action_recognition
from ai.inference.vision import matches
from ai.verification.decision import decide


class DecisionTest(unittest.TestCase):
    def test_unconfigured_model_is_not_approved(self):
        result = decide(False, False, False, None)
        self.assertEqual(result["decision"], "rejected")
        self.assertEqual(result["reason"], "model_not_configured")

    def test_exact_duplicate_is_rejected(self):
        result = decide(True, True, False, True)
        self.assertEqual(result["decision"], "rejected")
        self.assertEqual(result["reason"], "exact_duplicate")
        self.assertEqual(result["duplicateKind"], "sha256")

    def test_near_duplicate_is_rejected_without_a_person(self):
        result = decide(True, False, True, True)
        self.assertEqual(result["decision"], "rejected")
        self.assertEqual(result["reason"], "near_duplicate")
        self.assertNotEqual(result["duplicateKind"], "sha256")

    def test_matching_action_is_approved_without_a_person(self):
        result = decide(True, False, False, True)
        self.assertEqual(result["decision"], "approved")
        self.assertEqual(result["reason"], "action_match")

    def test_sha256_detects_the_same_bytes(self):
        digest = sha256_hex(b"same-video")
        self.assertEqual(digest, hashlib.sha256(b"same-video").hexdigest())
        same = compare_sha256(digest, digest)
        self.assertTrue(same["exact"])
        self.assertEqual(same["scope"], "identical_bytes_only")
        self.assertFalse(compare_sha256(digest, sha256_hex(b"other"))["exact"])

    def test_perceptual_hash_is_not_faked(self):
        self.assertEqual(perceptual_status()["status"], "not_configured")

    def test_action_adapter_does_not_invent_a_label(self):
        self.assertIsNone(action_recognition("BEACH_CLEANUP")["predictedAction"])

    def test_object_labels_must_match_the_declared_action(self):
        self.assertTrue(matches("RECYCLING", ["water bottle", "tabby"]))
        self.assertFalse(matches("BEACH_CLEANUP", ["sports car", "tabby"]))
        self.assertFalse(matches("RECYCLING", []))


if __name__ == "__main__":
    unittest.main()
