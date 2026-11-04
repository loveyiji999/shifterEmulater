"""SHIFT LAB v1.9.0 road v2 integration source, geometry and Chromium checks."""
from pathlib import Path
import subprocess
import unittest
from v190_compat import check_v1_preserved

ROOT=Path(__file__).resolve().parents[3]
THREE=ROOT/'desktop3d'

class RoadV2QA(unittest.TestCase):
    def test_legacy_engine_unchanged_and_new_generator_loaded(self):
        self.assertTrue(check_v1_preserved())
        engine=(THREE/'public/road-generator-v2.js').read_text(encoding='utf8')
        self.assertIn('root.SHIFT_ROAD_V2=',engine)
        self.assertIn('function audit(state)',engine)
        core=(THREE/'public/physics.html').read_text(encoding='utf8')
        self.assertIn('route.config.generator===2',core)
        self.assertIn('route.quality=engine.audit(',core)
    def test_single_settings_selector_and_qa_readout(self):
        html=(THREE/'index.html').read_text(encoding='utf8')
        main=(THREE/'src/main.mjs').read_text(encoding='utf8')
        self.assertEqual(html.count('id="map-generator"'),1)
        self.assertIn('id="map-stats"',html)
        self.assertIn('DEFAULT_MAP',main)
        self.assertIn('get roadQuality()',main)
        self.assertIn('MAP_STORAGE_KEY=',main)
        self.assertIn("version:'1.9.1'",main)
        self.assertNotIn('d.state.gear=',main)
    def test_original_engine_chromium(self):
        proc=subprocess.run(['python3',str(ROOT/'archive/legacy/browser-tests/browser_v190_core.py')],
            capture_output=True,text=True,timeout=35)
        self.assertEqual(proc.returncode,0,proc.stdout+proc.stderr)
        self.assertIn('PASS v1.9.0 Chromium original-engine integration',proc.stdout)
    def test_map_validation(self):
        proc=subprocess.run(['node',str(THREE/'tests/validate-procedural-map.mjs')],
            capture_output=True,text=True,timeout=10)
        self.assertEqual(proc.returncode,0,proc.stdout+proc.stderr)
        self.assertIn('PASS v1.9.0',proc.stdout)

if __name__=='__main__':unittest.main(verbosity=2)
