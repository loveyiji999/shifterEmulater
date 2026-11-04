#!/usr/bin/env python3
"""V1.8.3 reference-QA tests. Fixtures are synthetic and NEVER advertised as field measurements."""
import contextlib
import io
import json
import math
import os
from pathlib import Path
import tempfile
import unittest
import sys

ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'research/tools'))
import verify_public_references as ref


def fixture_adma():
    header=['field_'+str(i) for i in range(344)]
    for i,key in [(27,'z'),(96,'ins_yaw'),(109,'ins_time_msec')]:header[i]=key
    lines=[','.join(header)]
    heading=122.5
    for i in range(999):
        angle=0.6*math.sin(.9*i*.01)+.2*math.sin(.13*i*.01)
        heading+=angle*.01
        row=['0']*344
        row[27]=f'{angle:.12f}'
        row[96]=f'{heading:.12f}'
        row[109]=str(309352410+i*10)
        row[53]='-0.35'
        lines.append(','.join(row))
    return ('\n'.join(lines)+'\n').encode('utf-8')


def fixture_civic():
    seg=[]
    for j in range(25):
        t=[i*.1 for i in range(22)]
        slope=.45+.04*j
        v=[.1+j*.3+slope*u+.02*u*u for u in t]
        a=[slope+.04*u for u in t]
        seg.append({'start_idx':j*1000,'end_idx':j*1000+21,'duration':2.1,'t':t,'v':v,'a':a,
                    'padel':[.5]*len(t),'max_padel':.5})
    return json.dumps({'synthetic_fixture_only':[seg]}).encode()


class SourceProcessingTests(unittest.TestCase):
    def test_git_blob_hash_rejects_modified_file(self):
        with tempfile.TemporaryDirectory() as d:
            f=Path(d)/'bad.csv';f.write_bytes(b'definitely not the original data')
            with self.assertRaisesRegex(ValueError,'Source hash mismatch'):
                ref.fetch_or_read(f,'https://invalid.example',ref.ADMA_SHA)

    def test_adma_fields_hz_holdout_and_numeric_fit(self):
        x=ref.verify_adma_bytes(fixture_adma())
        self.assertEqual((x['raw_rows'],x['derived_heading_rate_rows']), (999,989))
        self.assertEqual((x['train_rows'],x['holdout_rows']), (645,344))
        self.assertAlmostEqual(x['sample_hz'],100)
        self.assertLess(abs(x['fit_gain_dimensionless']-1),.02)
        self.assertLess(x['holdout']['corrected_gyro']['rmse_deg_s'],.025)

    def test_adma_schema_drift_fails(self):
        raw=fixture_adma().replace(b'ins_yaw',b'unknown',1)
        with self.assertRaisesRegex(ValueError,'schema drift'):ref.verify_adma_bytes(raw)

    def test_adma_irregular_timestamps_fail(self):
        raw=fixture_adma().decode().splitlines()
        r=raw[201].split(',');r[109]=str(int(r[109])+3);raw[201]=','.join(r)
        with self.assertRaisesRegex(ValueError,'not exactly 100 Hz'):
            ref.verify_adma_bytes(('\n'.join(raw)+'\n').encode())

    def test_civic_bins_and_gradient(self):
        x=ref.verify_civic_bytes(fixture_civic())
        self.assertEqual(x['segments'],25)
        self.assertEqual(x['interior_observations'],500)
        self.assertAlmostEqual(x['derived_actual_hz'],10,places=6)
        self.assertLess(x['a_vs_speed_gradient_rmse_mps2'],.000001)
        self.assertTrue(x['acceleration_bins'])

    def test_civic_missing_groups_fail_closed(self):
        with self.assertRaisesRegex(ValueError,'Not enough'):
            ref.verify_civic_bytes(b'{"one":[[]]}')

    def test_p1_theoretical_not_measured(self):
        x=ref.p1_reference()
        self.assertAlmostEqual(x['wheelbase_m'],2.45)
        self.assertEqual(x['yaw_inertia_kg_m2'],1300)
        self.assertGreater(x['linear_understeer_coefficient_s2_per_m'],0)
        self.assertAlmostEqual(x['hypothetical_3deg_roadwheel_steer'][0]['predicted_yaw_deg_s'],6.5325,places=3)
        self.assertIn('NOT road measurements',x['note'])

    def test_read_only_bundle_results_and_provenance(self):
        adm=json.loads((ROOT/'research/metrics/adma_metrics.json').read_text())
        civic=json.loads((ROOT/'research/metrics/civic_metrics.json').read_text())
        prov=json.loads((ROOT/'research/metrics/source_assessment.json').read_text())
        self.assertEqual(adm['raw_rows'],999)
        self.assertEqual(civic['segments'],63)
        self.assertFalse(adm['applied_to_chassis_physics'])
        self.assertFalse(civic['applied_to_drivetrain_physics'])
        self.assertEqual(len(prov['sources']),6)
        self.assertEqual(sum(a['used'] for a in prov['sources']),3)

    def test_fixture_sha_must_not_match_actual(self):
        self.assertNotEqual(ref.blob_sha(fixture_adma()),ref.ADMA_SHA)
        self.assertNotEqual(ref.blob_sha(fixture_civic()),ref.CIVIC_SHA)


class BrowserIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            from playwright.sync_api import sync_playwright
        except ImportError as e:
            raise unittest.SkipTest(f'Playwright not installed: {e}')
        cls.pw=sync_playwright().start()
        cls.browser=cls.pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])

    @classmethod
    def tearDownClass(cls):
        cls.browser.close();cls.pw.stop()

    def _page(self,viewport):
        p=self.browser.new_page(viewport=viewport,device_scale_factor=1)
        self.addCleanup(p.close)
        p.add_init_script('window.requestAnimationFrame = () => 0;')
        self.errors=[]
        p.on('pageerror', lambda exc: self.errors.append(str(exc)))
        p.set_content(ROOT.joinpath('archive/legacy/shiftlab-2d-reference.html').read_text(encoding='utf-8'),wait_until='load',timeout=30000)
        return p

    def test_browser_debug_data_and_no_physics_override(self):
        p=self._page({'width':1366,'height':850})
        d=p.evaluate('''() => {const b=window.__SHIFT_LAB_DEBUG__;return {
          source:b.MEASURED_DATA_QUALITY,ref:b.referenceCalibration,heldout:b.REAL_OBD_BENCHMARK,
          bad:b.evaluateMeasuredTransferGate({knownVehicleGeometry:true,verifiedUnitMapping:true,
              holdoutRmse:1.463,baselineHoldoutRmse:.931,identifiedPhysicalCoefficient:false}),
          good:b.evaluateMeasuredTransferGate({knownVehicleGeometry:true,verifiedUnitMapping:true,
              holdoutRmse:.8,baselineHoldoutRmse:1.0,identifiedPhysicalCoefficient:true}),
          parts:[typeof b.advancePhysics,typeof b.steeringRackStep,typeof b.wheelCornerForce]};}''')
        self.assertFalse(d['source']['physicalParametersAutomaticallyUpdated'])
        self.assertEqual(d['source']['adma']['samples'],999)
        self.assertFalse(d['bad']['approved'])
        self.assertTrue(d['good']['approved'])
        self.assertTrue(all(x=='function' for x in d['parts']))
        self.assertEqual(self.errors,[])

    def test_desktop_reference_panel_render(self):
        p=self._page({'width':1366,'height':850})
        p.evaluate('''() => {document.querySelector('#vehicle-panel').open=true;
            document.querySelector('#reference-calibration-panel').open=true;
            document.querySelector('#real-external-panel').open=true;}''')
        item=p.locator('#real-external-panel')
        self.assertEqual(item.count(),1)
        self.assertTrue(item.is_visible())
        self.assertIn('100 Hz',item.inner_text())
        self.assertIn('Bucknell P1',item.inner_text())
        item.scroll_into_view_if_needed()
        item.screenshot(path=str(ROOT/'artifacts/research/figures/v183_reference_panel_desktop.png'),timeout=30000)
        self.assertEqual(self.errors,[])

    def test_mobile_render_without_horizontal_overflow(self):
        p=self._page({'width':390,'height':844})
        p.evaluate('''() => {document.querySelector('#vehicle-panel').open=true;
            document.querySelector('#reference-calibration-panel').open=true;
            document.querySelector('#real-external-panel').open=true;}''')
        node=p.locator('#real-external-panel')
        self.assertTrue(node.is_visible())
        w=p.evaluate('({scroll:document.documentElement.scrollWidth,viewport:innerWidth})')
        self.assertLessEqual(w['scroll'],w['viewport']+2,msg=str(w))
        node.scroll_into_view_if_needed()
        node.screenshot(path=str(ROOT/'artifacts/research/figures/v183_reference_panel_mobile.png'),timeout=30000)
        self.assertEqual(self.errors,[])


if __name__=='__main__':
    unittest.main(verbosity=2)
