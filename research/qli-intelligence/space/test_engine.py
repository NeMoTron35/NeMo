import unittest
from engine import scenarios, swap


class SpaceMathTests(unittest.TestCase):
    def test_basic_constant_product(self):
        r = swap("1000", "1000", "100")
        self.assertEqual(r["amountOut"], "90")
        self.assertEqual(r["feeAmount"], "1")
        self.assertTrue(r["invariantNondecreasing"])
        self.assertFalse(r["calibrated"])

    def test_exact_u64_boundaries(self):
        maximum = str((1 << 64) - 1)
        r = swap(maximum, maximum, maximum)
        self.assertLess(int(r["amountOut"]), int(maximum))
        self.assertGreater(int(r["amountOut"]), 0)

    def test_bad_inputs_are_rejected(self):
        for invalid in ["0", "-1", "1.0", "1e2", "01", " 1", str(1 << 64), True, 1.3]:
            with self.subTest(invalid=invalid):
                with self.assertRaises(ValueError):
                    swap("1000", "1000", invalid)
        with self.assertRaises(ValueError):
            swap("1000", "1000", "1", 1001)

    def test_stress_is_reproducible(self):
        a = scenarios(100000, 200000, 1000)
        b = scenarios("100000", "200000", "1000")
        self.assertEqual(a, b)
        self.assertEqual(len(a["scenarios"]), 5)
        self.assertEqual(len(a["offchainSha256"]), 64)
        baseline = int(a["scenarios"][0]["amountOut"])
        self.assertLessEqual(int(a["worstOutput"]), baseline)
        self.assertGreaterEqual(int(a["bestOutput"]), baseline)
        self.assertEqual(a["provenance"], "synthetic")
        self.assertFalse(a["prediction"])

    def test_changes_produce_different_hash(self):
        a = scenarios("100000", "200000", "1000")["offchainSha256"]
        b = scenarios("100000", "200000", "1001")["offchainSha256"]
        self.assertNotEqual(a, b)


if __name__ == "__main__":
    unittest.main()
