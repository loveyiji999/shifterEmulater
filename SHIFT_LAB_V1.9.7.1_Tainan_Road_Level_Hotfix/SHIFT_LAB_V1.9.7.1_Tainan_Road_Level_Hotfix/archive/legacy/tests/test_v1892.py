"""SHIFT LAB v1.8.9.2 source integration and deterministic Node policies.

Browser/Rapier acceptance is a separate test: desktop3d/tests/browser_v1892.py.
"""
from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[3]
WEB = ROOT / 'desktop3d'


class StableIntegration(unittest.TestCase):
    def test_new_transmission_and_health_guards(self):
        for script in ('validate-auto-transmission.mjs', 'validate-manual-gear.mjs',
                       'validate-physics-health.mjs', 'validate-road-reset.mjs'):
            with self.subTest(script=script):
                result = subprocess.run(['node', str(WEB / 'tests' / script)],
                                        capture_output=True, text=True, timeout=15)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertIn('PASS', result.stdout)

    def test_single_page_and_diesel_preset_available(self):
        html = (WEB / 'index.html').read_text(encoding='utf-8')
        core = (WEB / 'public' / 'physics.html').read_text(encoding='utf-8')
        self.assertIn('<option value="diesel">', html)
        self.assertIn("diesel:{name:", core)
        self.assertIn('id="gear"', html)
        self.assertIn('id="tests-panel"', html)
        self.assertIn('id="reload-game"', html)
        self.assertIn('v1.9.1', html)

    def test_live_main_integration_and_fail_closed(self):
        source = (WEB / 'src' / 'main.mjs').read_text(encoding='utf-8')
        for token in ('engageParkedManualGear', 'assertPhysicsHealth',
                      'road.assertClean()', 'road.resourceStats()',
                      "version:'1.9.1'", "if(!observe(data,start))break"):
            with self.subTest(token=token):
                self.assertIn(token, source)
        self.assertNotIn("console.error('v1.8.9.1 game:'", source)

    def test_current_real_browser_qa_not_hidden_button(self):
        original = (ROOT / 'archive/legacy/browser-tests' / 'browser_v187.py').read_text(encoding='utf-8')
        current = (ROOT / 'archive/legacy/browser-tests' / 'browser_v1892.py').read_text(encoding='utf-8')
        self.assertIn('from browser_v1892 import main', original)
        self.assertIn("openMode('drive')", current)
        self.assertNotIn("locator('#drive-now').click()", current)
        self.assertIn('runSuite()', current)
        self.assertIn('map-rebuilds', current)
        self.assertIn('drive-seconds', current)


if __name__ == '__main__':
    unittest.main(verbosity=2)
