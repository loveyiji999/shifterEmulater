"""Reproducibility, release and browser checks for the V1.8.4 P1 test archive.

Offline source-data tests use a bona fide public MAT file only when P1_RAW_DIR
is supplied. Synthetic model unit tests are NEVER called empirical validation.
"""
from __future__ import annotations
import json, os, sys, tempfile, unittest
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'research/calibration'))
import fit_p1_real_runs as fit

class ModelAndProvenance(unittest.TestCase):
    def test_force_zero_at_zero_steer_zero_rate(self):
        _,yawdot,ay=fit.lateral_equations(0.,0.,10.,0.,fit.CF,fit.CR,1.)
        self.assertAlmostEqual(yawdot,0.,places=10)
        self.assertAlmostEqual(ay,0.,places=10)
    def test_symmetric_wheel_tire_sign(self):
        for delta in [.01,.04,.1,.3]:
            a=fit.lateral_equations(0.,0.,10.,delta,fit.CF,fit.CR,1.)
            b=fit.lateral_equations(0.,0.,10.,-delta,fit.CF,fit.CR,1.)
            self.assertAlmostEqual(a[1],-b[1],places=10)
    def test_lateral_force_saturates_under_large_input(self):
        cf=fit.CF;cr=fit.CR;mu=.88
        _,_,ay=fit.lateral_equations(0.,0.,10.,.9,cf,cr,mu)
        self.assertLessEqual(abs(ay),mu*fit.G+1e-8)
    def test_integration_finite(self):
        t=np.arange(0,8.02,.02)
        v=np.full(len(t),10.); d=np.where(t<1,0,.1)
        y,r,ay=fit.integrate_measured_inputs(t,v,d,0.,0.,np.array([1.,1.,.9]))
        self.assertTrue(np.isfinite(y).all() and np.isfinite(r).all() and np.isfinite(ay).all())
        self.assertTrue(abs(r[-1])<1.0)
    def test_fixed_training_holdout_protocol(self):
        self.assertEqual(fit.WINDOWS[0][0],'left_training')
        self.assertTrue(all(w[-1]=='holdout' for w in fit.WINDOWS[1:]))
        self.assertNotEqual(fit.WINDOWS[0][1],fit.WINDOWS[2][1])
    def test_all_required_source_ids_are_grounded(self):
        self.assertEqual(len(fit.SOURCE_DATA),6)
        self.assertEqual(fit.SOURCE_DATA['craig_2018-07-19_ab']['file_id'],'13vyUJg81hSoyXy64LlMjua5b-vRXdySX')
        self.assertTrue(all(len(x['sha256'])==64 for x in fit.SOURCE_DATA.values()))
    def test_reject_bad_source_header(self):
        with tempfile.TemporaryDirectory() as d:
            f=Path(d)/'craig_2018-07-19_ab.mat.bin';f.write_bytes(b'fake measured vehicle data')
            with self.assertRaisesRegex(ValueError,'not a MATLAB'):fit.load_real('craig_2018-07-19_ab',Path(d))
    def test_require_raw_does_not_make_up_measurements(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(FileNotFoundError):fit.load_real('craig_2018-07-19_ab',Path(d))
    def test_reject_source_hash_drift(self):
        with tempfile.TemporaryDirectory() as d:
            f=Path(d)/'craig_2018-07-19_ab.mat.bin'
            f.write_bytes(b'MATLAB'+b'\0'*100)
            with self.assertRaisesRegex(ValueError,'SHA256 changed'):fit.load_real('craig_2018-07-19_ab',Path(d))
    def test_calibration_results_match_table(self):
        data=json.loads((ROOT/'research/calibration/results/p1_fit_results.json').read_text())
        self.assertAlmostEqual(data['fit']['stiffness_multiplier'],.8226312,places=5)
        self.assertAlmostEqual(data['fit']['effective_mu_in_surrogate'],.8778691,places=5)
        self.assertEqual(len(data['metrics']),7)
        for group in ['left_release','right_ramp','step_steer','increasing_speed_circle']:
            self.assertLess(data['metrics'][group]['fitted_tanh']['yaw_rmse_deg_s'],data['metrics'][group]['published_chassis_nominal_tanh']['yaw_rmse_deg_s'])
    def test_holdout_failure_not_concealed(self):
        data=json.loads((ROOT/'research/calibration/results/p1_fit_results.json').read_text())
        f=data['metrics']['test_track_loop']
        self.assertGreater(f['fitted_tanh']['yaw_rmse_deg_s'],f['published_chassis_nominal_tanh']['yaw_rmse_deg_s'])
    def test_two_source_geometry_sensitivity_is_explicit(self):
        a=json.loads((ROOT/'research/calibration/results/p1_geometry_sensitivity.json').read_text())
        self.assertEqual(a['primary_webpage_rear_b_m'],1.10)
        self.assertEqual(a['historical_script_rear_b_m'],1.15)
        self.assertEqual(len(a['cases']),2)
        self.assertGreater(a['cases'][1]['cornering_stiffness_common_multiplier']-a['cases'][0]['cornering_stiffness_common_multiplier'],.17)
        self.assertIn('校方連結的歷史 MATLAB', (ROOT/'archive/legacy/shiftlab-2d-reference.html').read_text())
    def test_default_and_historical_rear_b_produce_different_lateral_response(self):
        a=fit.lateral_equations(.3,.1,10.,.05,fit.CF,fit.CR,.9,1.10)
        b=fit.lateral_equations(.3,.1,10.,.05,fit.CF,fit.CR,.9,1.15)
        self.assertNotAlmostEqual(a[1],b[1],places=4)
    def test_source_download_script_never_bypasses_hash(self):
        s=(ROOT/'research/calibration/get_public_p1.py').read_text()
        self.assertIn('sha!=source[',s)
        self.assertIn('source hash mismatch',s)
    def test_raw_originals_not_in_release_directory(self):
        self.assertFalse(list(ROOT.rglob('*.mat')))
        self.assertFalse(list(ROOT.rglob('*.mat.bin')))

    def test_html_no_full_car_application(self):
        content=(ROOT/'archive/legacy/shiftlab-2d-reference.html').read_text()
        self.assertIn('id="p1-dynamic-benchmark"',content)
        self.assertIn('P1_REAL_DYNAMICS=Object.freeze',content)
        self.assertIn('automaticallyAppliedToFourWheelSimulator',content)
        self.assertIn('BODY DYNAMICS V1.8.5',content)  # version label expected to evolve, physics API remains unchanged
    def test_measured_mat_file_replay_when_available(self):
        raw=os.environ.get('P1_RAW_DIR')
        if not raw:self.skipTest('Raw P1 file not bundled; supply P1_RAW_DIR to reproduce')
        with tempfile.TemporaryDirectory() as d:
            s=fit.run(Path(raw),Path(d),plots=False)
            self.assertEqual(len(s['metrics']),7)
            self.assertAlmostEqual(s['metrics']['right_ramp']['fitted_tanh']['yaw_rmse_deg_s'],2.36999,delta=.03)
            self.assertEqual(s['metrics']['right_ramp']['split'],'holdout')
            self.assertEqual(s['metrics']['left_training']['rows'],2651)

class BrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:from playwright.sync_api import sync_playwright
        except ImportError:raise unittest.SkipTest('Playwright not available')
        cls.p=sync_playwright().start();cls.browser=cls.p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    @classmethod
    def tearDownClass(cls):cls.browser.close();cls.p.stop()
    def page(self,width):
        b=self.browser.new_page(viewport={'width':width,'height':840});self.addCleanup(b.close)
        b.add_init_script('window.requestAnimationFrame=()=>0;');err=[]
        b.on('pageerror',lambda e:err.append(str(e)))
        b.set_content((ROOT/'archive/legacy/shiftlab-2d-reference.html').read_text(),wait_until='load',timeout=40000)
        return b,err
    def test_physics_debug_unchanged_and_fitting_readonly(self):
        p,errors=self.page(1366)
        q=p.evaluate('''() => {const b=window.__SHIFT_LAB_DEBUG__;return {p1:b.P1_REAL_DYNAMICS, funcs:[typeof b.wheelCornerForce,typeof b.steeringRackStep,typeof b.advancePhysics],gate:b.evaluateMeasuredTransferGate({knownVehicleGeometry:true,verifiedUnitMapping:true,holdoutRmse:.8,baselineHoldoutRmse:1,identifiedPhysicalCoefficient:false})}}''')
        self.assertEqual(q['p1']['originalHz'],500)
        self.assertFalse(q['p1']['automaticallyAppliedToFourWheelSimulator'])
        self.assertFalse(q['gate']['approved'])
        self.assertTrue(all(v=='function' for v in q['funcs']))
        self.assertEqual(errors,[])
    def test_desktop_real_p1_panel(self):
        p,errors=self.page(1366)
        p.evaluate('''() => {document.querySelector('#vehicle-panel').open=true;document.querySelector('#reference-calibration-panel').open=true;document.querySelector('#p1-dynamic-benchmark').open=true;}''')
        node=p.locator('#p1-dynamic-benchmark');self.assertTrue(node.is_visible())
        self.assertIn('2.370',node.inner_text())
        self.assertIn('test-track',node.inner_text().lower())
        node.scroll_into_view_if_needed();node.screenshot(path=str(ROOT/'artifacts/research/figures/v184_p1_desktop.png'))
        self.assertEqual(errors,[])
    def test_mobile_real_p1_panel_and_no_overflow(self):
        p,errors=self.page(390)
        p.evaluate('''() => {document.querySelector('#vehicle-panel').open=true;document.querySelector('#reference-calibration-panel').open=true;document.querySelector('#p1-dynamic-benchmark').open=true;}''')
        node=p.locator('#p1-dynamic-benchmark');self.assertTrue(node.is_visible())
        w=p.evaluate('({document:document.documentElement.scrollWidth,viewport:innerWidth})')
        self.assertLessEqual(w['document'],w['viewport']+2)
        node.scroll_into_view_if_needed();node.screenshot(path=str(ROOT/'artifacts/research/figures/v184_p1_mobile.png'))
        self.assertEqual(errors,[])

if __name__=='__main__':unittest.main(verbosity=2)
