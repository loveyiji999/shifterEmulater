"""V1.8.5 gasoline reference + measured-force-channel evidence gates.

No synthetic sequence is EVER counted as a real vehicle fit. Optional original
P1 MAT files can be supplied with P1_RAW_DIR. BMW raw source is never bundled.
"""
from __future__ import annotations
import hashlib, json, math, os, subprocess, sys, tempfile, unittest
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'research/calibration'))
import validate_bmw_m235i as bmw
import validate_p1_force_channels as p1force

class EvidenceIntegrity(unittest.TestCase):
    def test_bmw_real_observation_identity(self):
        a=json.loads((ROOT/'research/results/bmw_gasoline_fit.json').read_text())
        self.assertEqual(a['records'],4708)
        self.assertEqual(a['train_n'],1411)
        self.assertEqual(a['holdout_n'],1357)
        self.assertEqual(a['git_blob_sha1'],bmw.EXPECTED_GIT_BLOB_SHA1)
    def test_bmw_model_training_selected_and_holdout_disclosed(self):
        d=json.loads((ROOT/'research/results/bmw_gasoline_fit.json').read_text())
        self.assertLess(d['selected_on_training']['training_rmse_m_s2'],d['static_baseline']['training_rmse_m_s2'])
        self.assertGreater(d['selected_on_training']['holdout_rmse_m_s2'],d['static_baseline']['holdout_rmse_m_s2'])
        self.assertFalse(d['selected_beats_static_on_holdout'])
        self.assertAlmostEqual(d['static_baseline']['holdout_rmse_m_s2'],0.4015427,places=6)
        self.assertAlmostEqual(d['selected_on_training']['holdout_rmse_m_s2'],0.4048804,places=6)
    def test_bmw_no_fake_yaw_or_tire_transfer(self):
        d=json.loads((ROOT/'research/results/bmw_gasoline_fit.json').read_text())
        self.assertFalse(d['direct_yaw_rate_signal'])
        self.assertFalse(d['raw_data_license_confirmed'])
        self.assertFalse(d['gameplay_auto_transfer_allowed'])
    def test_temporal_purge(self):
        d=json.loads((ROOT/'research/results/bmw_gasoline_fit.json').read_text())
        self.assertEqual(d['purged_gap_s'],[185,205])
        self.assertGreater(d['holdout_time_s'][0],d['train_time_s'][1])
    def test_bmw_public_raw_checksum_rejects_tampered_data(self):
        with self.assertRaisesRegex(ValueError,'Git blob SHA1 mismatch'):bmw.parse_measured(b'invented real data')
    def test_bmw_candidate_grid_is_predeclared(self):
        self.assertEqual(len(bmw.LAGS)*len(bmw.SATURATIONS),60)
        d=json.loads((ROOT/'research/results/bmw_gasoline_fit.json').read_text())
        self.assertEqual(d['candidate_models'],60)
    def test_fitted_formula_is_signed_and_unbounded_speeds_guarded(self):
        fake={'time_s':np.array([0.,.5,1.]),'speed':np.array([0.,10.,20.]),'delta':np.array([0.,.1,.1])}
        out=bmw.response_variable(fake,0,0)
        self.assertAlmostEqual(out[-1],40.)
    def test_regression_least_squares_correct(self):
        x=np.array([-3.,-1.,1.,3.]);y=-2*x+.5
        k,b=bmw.fit_linear(x,y)
        self.assertAlmostEqual(k,-2.);self.assertAlmostEqual(b,.5)
    def test_constant_input_fit_rejected(self):
        with self.assertRaisesRegex(ValueError,'No measured steering'):bmw.fit_linear(np.ones(6),np.ones(6))
    def test_prevent_raw_csv_redistribution(self):
        self.assertEqual(list(ROOT.rglob('dataset1_car.csv')),[])
        self.assertEqual(list(ROOT.rglob('*.mat')),[])
        self.assertEqual(list(ROOT.rglob('*.mat.bin')),[])
    def test_real_source_meta_branches(self):
        d=json.loads((ROOT/'research/results/v185_validated_reference.json').read_text())
        self.assertFalse(d['ford_manual_dataset']['lfs_original_obtained'])
        self.assertFalse(d['bmw_gasoline']['automaticallyAppliedToFourWheelSimulator'])
        self.assertFalse(d['p1_force_channel_audit']['automaticallyAppliedToFourWheelSimulator'])
    def test_all_p1_force_channels_flagged_unfit(self):
        q=json.loads((ROOT/'research/results/p1_force_channel_quality.json').read_text())
        self.assertEqual(len(q['sessions']),6)
        self.assertFalse(q['all_runs_pass'])
        self.assertTrue(all(not x['passes_both_channel_load_gate'] for x in q['sessions']))
        self.assertFalse(q['tire_force_coefficient_fit_approved'])
    def test_force_channel_group_indices(self):
        self.assertEqual(p1force.WHEEL_GROUP['left_fz'],127)
        self.assertEqual(p1force.WHEEL_GROUP['right_fz'],135)
    def test_reject_missing_real_mat(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(FileNotFoundError):p1force.analyze_one(p1force.FILE_IDS[0],Path(d))
    def test_real_p1_force_channels_when_available(self):
        path=os.environ.get('P1_RAW_DIR')
        if not path:self.skipTest('Optional authentic Bucknell source files not supplied')
        got=p1force.run(Path(path))
        self.assertFalse(got['all_runs_pass'])
        self.assertEqual(len(got['sessions']),6)
        for r in got['sessions']:
            self.assertFalse(r['passes_both_channel_load_gate'])
            self.assertLess(r['fraction_both_positive_above_floor'],.1)

class BrowserReference(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from playwright.sync_api import sync_playwright
        cls.p=sync_playwright().start();cls.browser=cls.p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    @classmethod
    def tearDownClass(cls):cls.browser.close();cls.p.stop()
    def page(self,width=1366):
        p=self.browser.new_page(viewport={'width':width,'height':840});self.addCleanup(p.close)
        p.add_init_script('window.requestAnimationFrame=()=>0;');errors=[]
        p.on('pageerror',lambda e:errors.append(str(e)))
        p.set_content((ROOT/'archive/legacy/shiftlab-2d-reference.html').read_text(),wait_until='load',timeout=60000)
        return p,errors
    def open_reference(self,p):
        p.evaluate('''() => {document.querySelector('#vehicle-panel').open=true;document.querySelector('#reference-calibration-panel').open=true;document.querySelector('#v185-gasoline-validation').open=true;}''')
    def test_real_gasoline_panel(self):
        p,e=self.page();self.open_reference(p)
        el=p.locator('#v185-gasoline-validation')
        self.assertTrue(el.is_visible())
        self.assertIn('0.4015',el.inner_text())
        self.assertIn('0.4049',el.inner_text())
        self.assertIn('Ford Fiesta',el.inner_text())
        el.scroll_into_view_if_needed();el.screenshot(path=str(ROOT/'artifacts/research/screenshots/v185_bmw_reference_desktop.png'))
        self.assertEqual(e,[])
    def test_mobile_responsive_and_visible(self):
        p,e=self.page(390);self.open_reference(p)
        el=p.locator('#v185-gasoline-validation')
        self.assertTrue(el.is_visible())
        w=p.evaluate('''() => ({s:document.documentElement.scrollWidth,w:innerWidth})''')
        self.assertLessEqual(w['s'],w['w']+2)
        el.scroll_into_view_if_needed();el.screenshot(path=str(ROOT/'artifacts/research/screenshots/v185_bmw_reference_mobile.png'))
        self.assertEqual(e,[])
    def test_no_automatic_transfer_and_physics_unchanged(self):
        p,e=self.page()
        out=p.evaluate('''() => {const b=window.__SHIFT_LAB_DEBUG__, x=b.V185_GASOLINE_VALIDATION;return {bmw:x.bmw_gasoline,ford:x.ford_manual_dataset,force:x.p1_force_channel_audit,physics:[typeof b.fourCornerForces,typeof b.steeringRackStep,typeof b.advancePhysics]}}''')
        self.assertEqual(out['bmw']['n'],4708)
        self.assertFalse(out['bmw']['automaticallyAppliedToFourWheelSimulator'])
        self.assertFalse(out['ford']['lfs_original_obtained'])
        self.assertFalse(out['force']['raw_forceFitApproved'])
        self.assertEqual(out['physics'],['function']*3)
        self.assertEqual(e,[])
    def test_original_p1_and_reference_panels_preserved(self):
        p,e=self.page();self.open_reference(p)
        p.evaluate('''() => {document.querySelector('#p1-dynamic-benchmark').open=true;}''')
        self.assertTrue(p.locator('#p1-dynamic-benchmark').is_visible())
        self.assertTrue(p.locator('#reference-fit-enabled').count()==1)
        self.assertEqual(e,[])

if __name__=='__main__':unittest.main(verbosity=2)
