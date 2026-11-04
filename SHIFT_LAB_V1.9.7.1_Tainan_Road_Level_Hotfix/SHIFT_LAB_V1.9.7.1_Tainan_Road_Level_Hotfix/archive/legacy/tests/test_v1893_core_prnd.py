"""Live original SHIFT LAB engine + real DOM controls in Chromium.
No Vite/Three.js/Rapier needed: exercises the original 4-wheel drivetrain.
The separate real 3D WebGL end-to-end suite is browser_v1893.py.
"""
import re
import unittest
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[3]
WEB=ROOT/'desktop3d'

class RealCorePRND(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pw=sync_playwright().start()
        cls.browser=cls.pw.chromium.launch(executable_path='/usr/bin/chromium',
            headless=True,args=['--no-sandbox'])
        cls.page=cls.browser.new_page(viewport={'width':1300,'height':850})
        html=(WEB/'index.html').read_text().replace('src="./physics.html"','src="about:blank"')
        cls.page.set_content(html.replace('<script type="module" src="./src/main.mjs"></script>',''),wait_until='load')
        iframe=cls.page.locator('#physics').element_handle().content_frame()
        iframe.set_content((WEB/'public/physics.html').read_text(),wait_until='load')
        helpers=[]
        for name in ['steering-input.mjs','procedural-map.mjs','game-modes.mjs',
                     'automatic-transmission.mjs','automatic-range.mjs',
                     'manual-gear.mjs','physics-health.mjs']:
            code=(WEB/'src'/name).read_text()
            code=re.sub(r'^import .*?;\s*$','',code,flags=re.MULTILINE)
            code=code.replace('export const','const').replace('export function','function')
            code=code.replace('export async function','async function')
            helpers.append(code)
        main=re.sub(r'^import .*?;\s*$','',(WEB/'src/main.mjs').read_text(),flags=re.MULTILINE)
        main=main.replace('boot().catch(failure);','')
        extension='''
updateHud=()=>{};
window.__PRND_TEST__={
  init(preset='standard'){
    d=$('physics').contentWindow.__SHIFT_LAB_DEBUG__;
    d.setExternalClock(true);
    d.reset();d.applyVehicle(preset);d.hostControls.active=true;
    bridge={rigidBody:{linvel:()=>({x:0,y:0,z:d.state.velocity})}};
    scenarioId='free';labReady=true;paused=false;
    $('drive-mode').value='assisted';
    installEvents();
    autoRange='P';d.hostControls.parkPawl=true;
    syncTransmissionUI();
    $('screen-overlay').remove();
    return this.snap();
  },
  snap(){const s=d.state;return {range:autoRange,gear:s.gear,
    pendingGear:s.pendingGear,kmh:s.velocity*3.6,parkPawl:s.parkPawl,
    clutch:s.clutch,engineOn:s.engineOn,brake:s.brake,
    rpm:s.engineOmega*60/(2*Math.PI),lastShift:s.lastEvent,
    shiftState:s.shiftState,time:s.time};},
  reset(preset='standard'){
    d.reset();d.applyVehicle(preset);d.hostControls.active=true;
    Object.assign(d.hostControls,{steer:0,throttle:0,brake:0,clutch:0,parkPawl:true});
    autoRange='P';paused=false;d.inputKeys.clear();syncTransmissionUI();
    return this.snap();
  },
  setGrade(value){const core=$('physics').contentWindow;
    core.document.getElementById('grade-slider').value=String(value);
    d.route.gradeMode='manual';},
  pedals({throttle=0,brake=0}){d.hostControls.throttle=throttle;d.hostControls.brake=brake;},
  step(n){const snapshots=[];for(let i=0;i<n;i++){
    updateAutoDrive();d.advancePhysics(1/120);
    if(i%120===0)snapshots.push(this.snap());
  }return {end:this.snap(),samples:snapshots};},
  select:range=>selectAutomaticRange(range),
  setPaused:mode=>{paused=true;gameModes.open(mode);}
};'''
        cls.page.add_script_tag(content='\n'.join(helpers)+'\n'+main+'\n'+extension)
        cls.page.evaluate('window.__PRND_TEST__.init()')
    @classmethod
    def tearDownClass(cls):
        cls.browser.close();cls.pw.stop()

    def test_park_brake_holds_9percent_grade(self):
        api='window.__PRND_TEST__'
        self.page.evaluate(f'{api}.reset()')
        self.page.evaluate(f'{api}.setGrade(9)')
        parked=self.page.evaluate(f'{api}.step(1100)')
        self.assertTrue(parked['end']['parkPawl'])
        self.assertEqual(parked['end']['gear'],0)
        self.assertLess(abs(parked['end']['kmh']),1.3,parked)

    def test_parked_settings_selector_allows_reverse_without_live_brake(self):
        api='window.__PRND_TEST__'
        self.page.evaluate(f'{api}.reset()')
        self.page.evaluate(f'{api}.setPaused("settings")')
        self.page.locator('#auto-range').select_option('R')
        self.assertEqual(self.page.evaluate(f'{api}.snap().range'),'R')
        self.page.evaluate("gameModes.open('drive')")
        reverse=self.page.evaluate(f'{api}.step(360)')
        self.assertEqual(reverse['end']['gear'],-1,reverse)
        self.page.evaluate(f'{api}.reset()')

    def test_prnd_reverses_and_parks(self):
        api='window.__PRND_TEST__'
        self.page.evaluate(f'{api}.reset()')
        # Accelerating in P must not transmit engine torque to wheels.
        self.page.evaluate(f'{api}.pedals({{throttle:.75}})')
        parked=self.page.evaluate(f'{api}.step(180)')
        self.assertEqual(parked['end']['range'],'P')
        self.assertEqual(parked['end']['gear'],0)
        self.assertTrue(parked['end']['parkPawl'])
        self.assertLess(abs(parked['end']['kmh']),1.0)
        # Reverse selection requires brake; dashboard button is connected.
        self.assertFalse(self.page.evaluate(f'{api}.select("R")'))
        self.page.evaluate(f'{api}.pedals({{brake:1}})')
        self.page.locator('#auto-shifter [data-range="R"]').click()
        self.assertEqual(self.page.evaluate(f'{api}.snap().range'),'R')
        selected=self.page.evaluate(f'{api}.step(360)')
        self.assertEqual(selected['end']['gear'],-1,selected)
        self.page.evaluate(f'{api}.pedals({{throttle:.65}})')
        reverse=self.page.evaluate(f'{api}.step(1080)')
        print('REVERSE:',reverse['end'],flush=True)
        self.assertLess(reverse['end']['kmh'],-2,reverse)
        # Neutral can be selected at speed, releases the mechanical reverse.
        self.page.evaluate(f'{api}.select("N")')
        neutral=self.page.evaluate(f'{api}.step(40)')
        self.assertEqual(neutral['end']['gear'],0,neutral)
        # Cannot go directly from rolling neutral to forward or P.
        self.assertFalse(self.page.evaluate(f'{api}.select("D")'))
        self.assertFalse(self.page.evaluate(f'{api}.select("P")'))
        self.page.evaluate(f'{api}.pedals({{brake:1}})')
        braking=self.page.evaluate(f'{api}.step(1000)')
        print('BRAKING:',braking['end'],flush=True)
        self.assertLess(abs(braking['end']['kmh']),1.26,braking)
        self.assertTrue(self.page.evaluate(f'{api}.select("D")'))
        self.page.evaluate(f'{api}.step(360)')
        self.assertGreaterEqual(self.page.evaluate(f'{api}.snap().gear'),1)
        self.page.evaluate(f'{api}.pedals({{throttle:.7}})')
        forward=self.page.evaluate(f'{api}.step(850)')
        print('FORWARD:',forward['end'],flush=True)
        self.assertGreater(forward['end']['kmh'],2,forward)
        self.assertFalse(self.page.evaluate(f'{api}.select("P")'))
        self.page.evaluate(f'{api}.pedals({{brake:1}})')
        self.page.evaluate(f'{api}.step(1200)')
        self.assertTrue(self.page.evaluate(f'{api}.select("P")'))
        self.page.evaluate(f'{api}.step(120)')
        result=self.page.evaluate(f'{api}.snap()')
        self.assertEqual(result['gear'],0)
        self.assertTrue(result['parkPawl'])

if __name__=='__main__': unittest.main(verbosity=2)
