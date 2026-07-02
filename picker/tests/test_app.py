"""Regression test: /api/stocks payload must be strict-JSON safe.

Python's json module tolerates NaN/Infinity, but browsers' JSON.parse does
not. If load_database() lets NaN through, jsonify() emits invalid JSON and
the whole dashboard fails to load.

Run from the project root: venv/bin/python3 tests/test_app.py
"""
import json
import os
import sys
import tempfile
import unittest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)
import app  # noqa: E402


class LoadDatabaseStrictJsonTest(unittest.TestCase):
    def test_load_database_output_survives_strict_json(self):
        db = app.load_database()
        self.assertTrue(db.get("stocks"), "expected portfolio_data.json to load with stocks")
        try:
            json.dumps(db, allow_nan=False)
        except ValueError as e:
            self.fail(f"load_database() returned NaN/Infinity; browsers cannot parse this: {e}")


class PortfolioDataFileStrictJsonTest(unittest.TestCase):
    """The static deployment serves portfolio_data.json directly to browsers,
    so the file on disk (not just the Flask-sanitized payload) must be strict JSON."""

    def test_portfolio_data_file_is_strict_json(self):
        with open(os.path.join(PROJECT_ROOT, "portfolio_data.json")) as f:
            text = f.read()

        def reject(token):
            self.fail(f"portfolio_data.json contains bare {token}; browsers' JSON.parse cannot read it")

        data = json.loads(text, parse_constant=reject)
        self.assertTrue(data.get("stocks"), "expected portfolio_data.json to contain stocks")


class SaveDatabaseStrictJsonTest(unittest.TestCase):
    def test_save_database_writes_strict_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "db.json")
            original = app.PORTFOLIO_FILE
            app.PORTFOLIO_FILE = path
            try:
                ok = app.save_database({
                    "last_updated": "2026-07-02 00:00:00",
                    "stocks": [{"ticker": "TST", "pe": float("nan"), "growth": float("inf")}],
                })
            finally:
                app.PORTFOLIO_FILE = original
            self.assertTrue(ok, "save_database reported failure")

            with open(path) as f:
                text = f.read()

            def reject(token):
                self.fail(f"save_database wrote bare {token}; browsers' JSON.parse cannot read it")

            data = json.loads(text, parse_constant=reject)
            self.assertIsNone(data["stocks"][0]["pe"])
            self.assertIsNone(data["stocks"][0]["growth"])


if __name__ == "__main__":
    unittest.main()
