import pathlib
import unittest
from breakdown.build_pins import public_metadata


class PublicMetadata(unittest.TestCase):
    def test_symbol_proof_retains_correct_offset_without_build_directory(self):
        symbol='EigenNonBlockingThreadPool.h'
        marker=str(pathlib.Path.cwd()/'compiler'/symbol)
        result=public_metadata({'markers':[marker],'markerOffsets':{marker:123}})
        self.assertEqual(result['markers'],[symbol])
        self.assertEqual(result['markerOffsets'][symbol],123+marker.index(symbol))

    def test_approval_is_a_neutral_statement_with_a_date(self):
        result=public_metadata({'name':'FFmpeg','approval':{'date':'2026-11-15','sourceFile':'notes.md'}})
        self.assertEqual(set(result['approval']),{'date','statement'})
        self.assertIn('FFmpeg',result['approval']['statement'])


if __name__ == '__main__':
    unittest.main()
