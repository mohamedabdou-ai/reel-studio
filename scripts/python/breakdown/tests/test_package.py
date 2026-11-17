# scripts/python/breakdown/tests/test_package.py
# Keeps discovery non-empty: Python 3.12+ unittest exits 5 when no test runs.
import unittest

from breakdown import VERSION


class Package(unittest.TestCase):
    def test_version(self):
        self.assertRegex(VERSION, r"^\d+\.\d+\.\d+$")


if __name__ == "__main__":
    unittest.main()
