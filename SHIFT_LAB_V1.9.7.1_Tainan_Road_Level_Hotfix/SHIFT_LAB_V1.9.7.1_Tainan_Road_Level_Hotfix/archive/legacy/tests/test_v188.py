"""Source/adapter QA for the single-interface desktop browser game.
This does not substitute for real-browser Rapier collision verification.
"""
from v190_compat import check_v1_preserved
from pathlib import Path
import re, subprocess, json, unittest
ROOT=Path(__file__).resolve().parents[3]
WEB=ROOT/'desktop3d'

class UnifiedWebQA(unittest.TestCase):
    def test_legacy_v1_solver_centerline_stays_identical(self):
        baseline=Path('/mnt/data/SHIFT_LAB_V1.8.7.2_3D_Force_Stability_Hotfix')
        # This case is self-contained when distributed without the baseline ZIP.
        self.assertTrue(check_v1_preserved())
        if baseline.exists():
            self.assertTrue(check_v1_preserved())
            for file in ['chassis.mjs','obstacles.mjs','scenarios.mjs']:
                self.assertEqual((WEB/'src'/file).read_bytes(),(baseline/'desktop3d/src'/file).read_bytes())

    def test_visual_left_right_unit(self):
        proc=subprocess.run(['node',str(WEB/'tests/validate-steering.mjs')],capture_output=True,text=True)
        self.assertEqual(proc.returncode,0,proc.stdout+proc.stderr)
        self.assertIn('PASS v1.8.8',proc.stdout)

    def test_one_entry_and_hidden_engine_only(self):
        root=(ROOT/'index.html').read_text()
        game=(WEB/'index.html').read_text()
        self.assertIn('desktop3d/',root)
        self.assertIn('3D 自由駕駛',game)
        self.assertIn('aria-hidden="true"',game)
        self.assertIn('src="./physics.html"',game)
        self.assertEqual(game.count('id="view"'),1)
        self.assertNotIn('src="./physics.html"',root)
        self.assertNotIn('id="view"',root)

    def test_controls_are_present_and_wired(self):
        html=(WEB/'index.html').read_text()
        main=(WEB/'src/main.mjs').read_text()
        fields=['car-preset','road-surface','abs-toggle','tcs-toggle','steer-direction',
                'handling-balance','brake-bias','steering-preset','pad-invert']
        for field in fields:
            self.assertIn('id="'+field+'"',html)
            self.assertIn("'"+field+"'",main)
        self.assertIn('legacyDirectionalKey(key)',main)
        self.assertIn('legacySteerFromVisualAxis(steerFiltered',main)
        self.assertIn('visualSteeringFromLegacy(m.steerInput)',main)
        self.assertIn('Object.assign(d.advancedSteering,d.ADV_STEER_PRESETS',main)

    def test_web_dependency_contract(self):
        pkg=json.loads((WEB/'package.json').read_text())
        self.assertEqual(pkg['version'],'1.9.1')
        self.assertEqual(pkg['dependencies']['three'],'0.180.0')
        self.assertEqual(pkg['dependencies']['@dimforge/rapier3d-compat'],'0.18.2')
        self.assertTrue((ROOT/'START_WEB_WINDOWS.cmd').is_file())
        self.assertTrue((ROOT/'START_WEB_UNIX.sh').is_file())
        self.assertTrue((WEB/'scripts/serve-and-open.mjs').is_file())
        for f in [*list((WEB/'src').glob('*.mjs')),WEB/'scripts/serve-and-open.mjs']:
            with self.subTest(source=f.name):
                proc=subprocess.run(['node','--check',str(f)],capture_output=True,text=True)
                self.assertEqual(proc.returncode,0,proc.stderr)

if __name__=='__main__':unittest.main(verbosity=2)
