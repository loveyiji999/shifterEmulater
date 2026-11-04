"""Accelerate -> brake to stop -> accelerate again using the actual SHIFT LAB
four-wheel and drivetrain engine, without Vite/Three/Rapier dependencies.
This validates automatic gear-control integration, NOT the 3D collision world.
"""
import re, unittest
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[3]
WEB=ROOT/'desktop3d'

class RealCoreAutoShift(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pw=sync_playwright().start()
        cls.browser=cls.pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,
                                           args=['--no-sandbox'])
        cls.page=cls.browser.new_page()
        html=(WEB/'index.html').read_text().replace('src="./physics.html"','src="about:blank"')
        cls.page.set_content(html.replace('<script type="module" src="./src/main.mjs"></script>',''),
                             wait_until='load')
        iframe=cls.page.locator('#physics').element_handle().content_frame()
        iframe.set_content((WEB/'public/physics.html').read_text(),wait_until='load')
        helpers='\n'.join(re.sub(r'^import .*?;\s*$', '',(WEB/'src'/name).read_text(),flags=re.MULTILINE)
                            .replace('export const','const').replace('export function','function') for name in
                            ['steering-input.mjs','procedural-map.mjs','game-modes.mjs','automatic-transmission.mjs','automatic-range.mjs'])
        main=re.sub(r'^import .*?;\s*$','',(WEB/'src/main.mjs').read_text(),flags=re.MULTILINE)
        main=main.replace('boot().catch(failure);','')
        extension='''
window.__DRIVETRAIN_QA__={
  init(){d=$('physics').contentWindow.__SHIFT_LAB_DEBUG__;d.setExternalClock(true);
    scenarioId='free';labReady=true;installEvents();},
  run(preset){
    d.reset();d.applyVehicle(preset);d.hostControls.active=true;
    autoDrive.lastShiftTime=-100;autoDrive.shiftTarget=0;
    d.inputKeys.clear();$('drive-mode').value='assisted';autoRange='D';d.hostControls.parkPawl=false;syncTransmissionUI();
    const records=[];
    for(let i=0;i<4800;i++){
      if(i===0)d.inputKeys.add('w');
      if(i===1800){d.inputKeys.delete('w');d.inputKeys.add('s');}
      if(i===3000){d.inputKeys.delete('s');d.inputKeys.add('w');}
      updateAutoDrive();d.advancePhysics(1/120);
      if(i%120===0)records.push({time:i/120,gear:d.state.gear,
        pendingGear:d.state.pendingGear,kmh:d.state.velocity*3.6,
        engineOn:d.state.engineOn,rpm:d.state.engineOmega*60/(2*Math.PI)});
    }
    return records;
  }
};'''
        cls.page.add_script_tag(content=helpers+'\n'+main+'\n'+extension)
        cls.page.evaluate('window.__DRIVETRAIN_QA__.init()')
    @classmethod
    def tearDownClass(cls):
        cls.browser.close();cls.pw.stop()

    def test_continuous_accel_brake_reaccelerate_four_real_vehicle_presets(self):
        for car in ['standard','city','turbo','diesel']:
            with self.subTest(car=car):
                samples=self.page.evaluate('(car)=>window.__DRIVETRAIN_QA__.run(car)',car)
                acceleration=[s for s in samples if s['time']<15]
                braking=[s for s in samples if 15<=s['time']<=25]
                return_accel=[s for s in samples if s['time']>=25]
                self.assertGreater(max(x['kmh'] for x in acceleration),30,car+' acceleration')
                self.assertTrue(any(x['gear']>=2 for x in acceleration),car+' upshift')
                self.assertTrue(any(x['gear']==1 for x in braking),car+' braking -> first')
                self.assertLess(min(abs(x['kmh']) for x in braking),3,car+' near stop')
                self.assertTrue(any(x['gear']>=2 for x in return_accel),car+' restart and upshift')
                self.assertTrue(all(x['engineOn'] for x in samples[2:]),car+' engine stability')
                self.assertTrue(all(abs(x['kmh'])<250 for x in samples),car+' velocity finite/safe')

if __name__=='__main__': unittest.main(verbosity=2)
