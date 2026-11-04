"""Source-integrity and gate-behavior tests (NOT a Rapier/WASM browser runtime test)."""
from __future__ import annotations
from v190_compat import check_v1_preserved
import json,re,subprocess,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
THREE=ROOT/'desktop3d'

class V187QA(unittest.TestCase):
    def test_scenarios_fail_safe_when_telemetry_is_bad(self):
        result=subprocess.run(['node',str(THREE/'tests/validate-scenarios.mjs')],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stdout+'\n'+result.stderr)
        self.assertIn('PASS scenario',result.stdout)

    def test_module_syntax(self):
        for js in [*list((THREE/'src').glob('*.mjs')),THREE/'vite.config.mjs']:
            with self.subTest(js=js.name):
                p=subprocess.run(['node','--check',str(js)],capture_output=True,text=True)
                self.assertEqual(p.returncode,0,p.stderr)

    def test_every_explicit_dom_selector_exists(self):
        html=(THREE/'index.html').read_text()
        js=(THREE/'src/main.mjs').read_text()
        required=set(re.findall(r"\$\(\s*['\"]([^'\"]+)['\"]\s*\)",js))
        present=set(re.findall(r'''\bid=['"]([^'"]+)['"]''',html))
        self.assertGreater(len(required),15)
        self.assertEqual(required-present,set())

    def test_original_model_not_duplicated(self):
        self.assertTrue(check_v1_preserved())
        js=(THREE/'src/chassis.mjs').read_text()
        self.assertEqual(js.count('this.world.step()'),1)
        self.assertIn('this.rigidBody.addForceAtPoint',js)
        self.assertIn('world.timestep=h;this.world.step();',js)
        self.assertIn('setCcdEnabled(true)',js)
        self.assertNotIn('setNextKinematicTranslation',js)

    def test_collider_labels_and_real_impulse_sampling(self):
        road=(THREE/'src/road.mjs').read_text()
        ch=(THREE/'src/chassis.mjs').read_text()
        obstacles=(THREE/'src/obstacles.mjs').read_text()
        self.assertIn('railHandles',road)
        self.assertIn('barrierHandles',road)
        self.assertIn('groundHandles',road)
        self.assertIn('contactImpulse(i)',ch)
        self.assertIn('contactDist(i)',ch)
        self.assertIn('contactPair(this.collider,other',ch)
        self.assertIn('setCcdEnabled(true)',ch)
        self.assertIn('ColliderDesc.trimesh',obstacles)
        self.assertIn('ColliderDesc.cuboid',obstacles)

    def test_guardrail_chassis_uses_four_point_forces(self):
        script=(THREE/'src/chassis.mjs').read_text()
        self.assertIn('for(const id of d.WHEEL_IDS)',script)
        self.assertIn('wheel.fxBody',script)
        self.assertIn('wheel.fyBody',script)
        self.assertNotIn('addTorque({x:0,y:yawMoment',script)

    def test_qa_host_has_single_controlled_stepping_path(self):
        main=(THREE/'src/main.mjs').read_text()
        self.assertEqual(main.count('d.advancePhysics(FIXED_DT);'),1)
        self.assertIn('const FIXED_DT=1/120;',main)
        self.assertIn('await new Promise(resolve=>requestAnimationFrame(resolve))',main)
        self.assertIn('maxBarrierPenetration',main)
        self.assertIn('dropSteps',main)
        self.assertIn('updateAutoDrive();',main)
        self.assertIn('driveFocus()',main)
        self.assertIn('__SHIFT_LAB_3D_QA__',main)

    def test_keyboard_works_after_clicking_control_buttons(self):
        main=(THREE/'src/main.mjs').read_text()
        self.assertIn("['INPUT','SELECT','TEXTAREA'].includes(e.target?.tagName)",main)
        self.assertNotIn("['INPUT','BUTTON','SELECT','TEXTAREA'].includes(e.target?.tagName)",main)
        self.assertIn("KeyW:'w'",main)
        self.assertIn("ShiftLeft:'shift'",main)

    def test_version_and_start_scripts_exist(self):
        package=json.loads((THREE/'package.json').read_text())
        self.assertEqual(package['version'],'1.9.1')
        self.assertIn('rapier3d-compat',str(package['dependencies']))
        self.assertTrue((THREE/'START_WINDOWS.cmd').exists())
        self.assertTrue((THREE/'START_UNIX.sh').exists())
        self.assertEqual((THREE/'vite.config.mjs').read_text().count("base:'./'"),1)

    def test_old_python_tests_still_bundled(self):
        for name in ['test_v183.py','test_v184.py','test_v185.py','test_v186.py']:
            self.assertTrue((ROOT/'archive/legacy/tests'/name).is_file())

if __name__=='__main__':unittest.main(verbosity=2)
