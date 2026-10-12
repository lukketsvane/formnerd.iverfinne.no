import csv
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent


class ContractTests(unittest.TestCase):
    def test_openapi_references_resolve(self):
        contract = json.loads((ROOT / "openapi.json").read_text(encoding="utf-8"))
        self.assertEqual(contract["openapi"], "3.1.0")
        stack = [contract]
        references = []
        while stack:
            value = stack.pop()
            if isinstance(value, dict):
                if "$ref" in value:
                    references.append(value["$ref"])
                stack.extend(value.values())
            elif isinstance(value, list):
                stack.extend(value)
        self.assertGreater(len(references), 8)
        for reference in references:
            self.assertTrue(reference.startswith("#/"))
            target = contract
            for segment in reference[2:].split("/"):
                target = target[segment]

    def test_test_matrix_has_all_required_stages(self):
        with (ROOT / "test_matrix.csv").open(newline="", encoding="utf-8") as handle:
            rows = list(csv.DictReader(handle))
        self.assertGreaterEqual(len(rows), 15)
        self.assertEqual(len({row["id"] for row in rows}), len(rows))
        self.assertTrue({"mock", "iPhone EVT", "wireless EVT", "wired EVT", "performance EVT", "resilience EVT", "security EVT", "power EVT", "release"}.issubset({row["stage"] for row in rows}))


if __name__ == "__main__":
    unittest.main()
