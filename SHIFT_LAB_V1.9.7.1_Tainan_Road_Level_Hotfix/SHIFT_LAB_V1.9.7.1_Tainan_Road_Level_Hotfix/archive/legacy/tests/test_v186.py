"""Desktop V1.8.6 gameplay regression; simulated setups are software QA, NOT real-car validation."""
from __future__ import annotations
from v190_compat import check_v1_preserved
import math,sys,unittest,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]

class BrowserDriving(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from playwright.sync_api import sync_playwright
        cls.playwright=sync_playwright().start()
        cls.browser=cls.playwright.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    @classmethod
    def tearDownClass(cls): cls.browser.close();cls.playwright.stop()
    def page(self):
        pg=self.browser.new_page()
        self.addCleanup(pg.close)
        self.errors=[]
        pg.on('pageerror',lambda e:self.errors.append(str(e)))
        pg.add_init_script('window.requestAnimationFrame=()=>0')
        pg.set_content((ROOT/'archive/legacy/shiftlab-2d-reference.html').read_text(),wait_until='load')
        return pg
    def split_run(self,enable):
        pg=self.page()
        r=pg.evaluate('''(enable)=>{
          const d=window.__SHIFT_LAB_DEBUG__;
          d.reset();d.state.velocity=20;d.wheelModel.splitMu='left_ice';
          document.getElementById('brake-slider').value='100';
          document.getElementById('abs-enabled').checked=true;
          d.setESCEnabled(enable);
          for(const id of d.WHEEL_IDS)d.wheelModel[id].omega=20/d.params.wheelRadius;
          let maxBrake=0,maxTrim=0;
          for(let j=0;j<144;j++){
            d.advancePhysics(1/120);
            maxBrake=Math.max(maxBrake,d.handling.escBrakeNm);
            maxTrim=Math.max(maxTrim,d.handling.escTrim);
          }
          return {yaw:d.vehicleMotion.yawRate,escBrake:maxBrake,trim:maxTrim,phase:d.handling.phase};
        }''',enable)
        self.assertEqual(self.errors,[])
        return r
    def test_esc_corrects_split_mu_straightline(self):
        off=self.split_run(False)
        on=self.split_run(True)
        self.assertGreater(abs(off['yaw']),.5)
        self.assertLess(abs(on['yaw']),abs(off['yaw'])*.70)
        self.assertGreater(on['escBrake'],5)
        self.assertGreater(on['trim'],.10)
        self.assertEqual(off['trim'],0)
        self.assertEqual(off['phase'],'偏航偏離')
    def test_tire_friction_peak_and_recovery(self):
        pg=self.page()
        got=pg.evaluate('''()=>{
          const d=window.__SHIFT_LAB_DEBUG__, results=[];
          for(const feel of ['raw','sport','balanced']){
            d.setHandlingFeel(feel);
            const cap=3000,normal=3000;
            results.push({feel,peak:d.peakSlipCurve(1,d.effectiveTireSlideRetention('lat'),.9),
              tail:d.peakSlipCurve(2.8,d.effectiveTireSlideRetention('lat'),.9),
              combined:d.combineTireForces(4000,4000,cap,3,3)});
          }
          return results;
        }''')
        self.assertEqual([r['feel'] for r in got],['raw','sport','balanced'])
        self.assertTrue(all(r['peak']==1 for r in got))
        self.assertLess(got[0]['tail'],got[1]['tail'])
        self.assertLess(got[1]['tail'],got[2]['tail'])
        for r in got:self.assertLessEqual(math.hypot(r['combined']['fx'],r['combined']['fy']),3000+1e-8)
    def test_high_yaw_no_old_clamp(self):
        pg=self.page()
        got=pg.evaluate('''()=>{
          const d=window.__SHIFT_LAB_DEBUG__;d.reset();d.vehicleMotion.yawRate=1.5;
          d.integrateFourCornerChassis(0,0,100000,1/120);
          return d.vehicleMotion.yawRate;
        }''')
        self.assertGreater(got,1.65)
    def test_planar_guardrail_impulse_no_speed_growth(self):
        pg=self.page()
        got=pg.evaluate('''()=>{
          const d=window.__SHIFT_LAB_DEBUG__;d.reset();
          d.state.velocity=18;d.vehicleMotion.lateralVelocity=4;
          d.vehicleMotion.x=4.5;
          const speedBefore=Math.hypot(d.state.velocity,d.vehicleMotion.lateralVelocity);
          d.updateVehicleRoadPosition(1/120);
          return {hits:d.vehicleMotion.guardrailHits,contact:d.vehicleMotion.contact,
            speedBefore,speedAfter:Math.hypot(d.state.velocity,d.vehicleMotion.lateralVelocity),
            offset:d.vehicleMotion.offset,yaw:d.vehicleMotion.yawRate};
        }''')
        self.assertEqual(got['hits'],1)
        self.assertTrue(got['contact'])
        self.assertLess(got['speedAfter'],got['speedBefore'])
        self.assertLessEqual(abs(got['offset']),4.0)
        self.assertTrue(math.isfinite(got['yaw']))
    def test_planar_disabled_guardrail_is_passable(self):
        pg=self.page()
        got=pg.evaluate('''()=>{
          const d=window.__SHIFT_LAB_DEBUG__;d.reset();d.roadAppearance.guardrails='off';
          d.vehicleMotion.x=4.5;d.state.velocity=18;
          d.updateVehicleRoadPosition(1/120);
          return {contact:d.vehicleMotion.contact,offset:d.vehicleMotion.offset};
        }''')
        self.assertFalse(got['contact']);self.assertGreater(got['offset'],4)
    def test_keyboard_reverse_and_release(self):
        pg=self.page()
        got=pg.evaluate('''()=>{
          const d=window.__SHIFT_LAB_DEBUG__;d.reset();
          d.inputKeys.add('d');
          for(let i=0;i<72;i++)d.keyboardSteeringStep(1/120);
          const right=d.keyboardSteering.value;
          d.inputKeys.delete('d');d.inputKeys.add('a');
          for(let i=0;i<48;i++)d.keyboardSteeringStep(1/120);
          const opposite=d.keyboardSteering.value;
          d.inputKeys.clear();
          for(let i=0;i<200;i++)d.keyboardSteeringStep(1/120);
          return {right,opposite,returned:d.keyboardSteering.value,active:d.keyboardSteering.active};
        }''')
        self.assertGreater(got['right'],0)
        self.assertLess(got['opposite'],got['right'])
        self.assertEqual(got['returned'],0)
        self.assertFalse(got['active'])
    def test_single_authority_external_chassis(self):
        pg=self.page()
        got=pg.evaluate('''()=>{
          const d=window.__SHIFT_LAB_DEBUG__;d.reset();const calls=[];
          const bridge={reset(p,P){calls.push('reset')},
            beforeForces(h){calls.push('before')},
            stepForces(fx,fy,moment,drag,h){calls.push('step')}};
          const valid=d.setChassisBridge(bridge);
          const x=d.vehicleMotion.x;
          d.integrateFourCornerChassis(3500,750,2000,1/120);
          const notMoved=d.vehicleMotion.x===x;
          d.setChassisBridge(null);
          return {valid,notMoved,calls,restored:d.suspension.enabled};
        }''')
        self.assertTrue(got['valid'])
        self.assertTrue(got['notMoved'])
        self.assertEqual(got['calls'],['reset','step'])
        self.assertTrue(got['restored'])
    def test_original_v185_panels_preserved(self):
        pg=self.page()
        self.assertEqual(pg.locator('#v185-gasoline-validation').count(),1)
        self.assertEqual(pg.locator('#handling-feel').count(),1)
        self.assertEqual(self.errors,[])

class Native3DSource(unittest.TestCase):
    def test_js_syntax(self):
        for src in [ROOT/'archive/legacy/current_inline.js',*list((ROOT/'desktop3d/src').glob('*.mjs'))]:
            result=subprocess.run(['node','--check',str(src)],capture_output=True,text=True)
            self.assertEqual(result.returncode,0,f'{src.name}: {result.stderr}')
    def test_3d_uses_same_physics_page(self):
        self.assertTrue(check_v1_preserved())
        content=(ROOT/'desktop3d/src/chassis.mjs').read_text()
        self.assertIn('world.timestep=h;this.world.step();',content)
        self.assertIn('addForceAtPoint',content)
        self.assertIn('stepForces',content)
        self.assertIn('setCcdEnabled(true)',content)
        self.assertIn('contactPairsWith',content)
        self.assertNotIn('setNextKinematicTranslation',content)

if __name__=='__main__':unittest.main(verbosity=2)
