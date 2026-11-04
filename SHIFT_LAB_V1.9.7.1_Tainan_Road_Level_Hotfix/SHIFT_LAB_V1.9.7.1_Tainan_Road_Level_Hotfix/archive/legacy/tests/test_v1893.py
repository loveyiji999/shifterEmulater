"""SHIFT LAB v1.8.9.3 PRND integration source and UI contracts.
The real original-engine exercise lives in test_v1893_core_prnd.py.
"""
from v190_compat import check_v1_preserved
import subprocess
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[3]
WEB=ROOT/'desktop3d'

class V1893Contracts(unittest.TestCase):
    def test_prnd_controller(self):
        process=subprocess.run(['node',str(WEB/'tests/validate-automatic-range.mjs')],
            capture_output=True,text=True,timeout=20)
        self.assertEqual(process.returncode,0,process.stdout+process.stderr)
        self.assertIn('PASS v1.8.9.3 PRND',process.stdout)

    def test_one_shifter_ui_and_settings_selector(self):
        html=(WEB/'index.html').read_text()
        self.assertEqual(html.count('id="auto-shifter"'),1)
        self.assertEqual(html.count('id="auto-range"'),1)
        for selected in ['P','R','N','D']:
            self.assertIn(f'data-range="{selected}"',html)
            self.assertIn(f'<option value="{selected}">',html)
        self.assertIn('aria-live="polite"',html)
        self.assertIn('id="gear"',html,'the existing manual gearbox stays exposed')
        self.assertIn('id="tests-panel"',html)

    def test_mechanical_reverse_and_separate_park_brake(self):
        code=(WEB/'src/main.mjs').read_text()
        core=(WEB/'public/physics.html').read_text()
        for item in ['checkAutomaticRange({','automaticRangeRequest({',
            'd.requestGear(desired)','d.hostControls.parkPawl=target',
            "automaticDisplayGear(autoRange,s.gear)",
            "version:'1.9.1'"]:
            self.assertIn(item,code)
        self.assertNotIn('d.state.gear=',code)
        self.assertIn('state.parkPawl=hostControls.active&&hostControls.parkPawl===true',core)
        self.assertIn('parkingBraking*.25',core)
        self.assertIn('g===-1 && Math.abs(state.velocity)>.28',core)
        self.assertTrue(check_v1_preserved())

    def test_new_real_3d_browser_runner_is_preserved(self):
        code=(ROOT/'archive/legacy/browser-tests/browser_v1893.py').read_text()
        for item in ["'1.8.9.3'",'parkPawl','[data-range="R"]','runSuite()',
                     'map-rebuilds','drive-seconds','signedVelocity']:
            self.assertIn(item,code)
        import py_compile
        py_compile.compile(str(ROOT/'archive/legacy/browser-tests/browser_v1893.py'),doraise=True)

if __name__=='__main__':
    unittest.main(verbosity=2)
