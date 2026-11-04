"""v1.8.9.1 automatic mode and manual shifter separation.

Uses actual Chromium keyboard/DOM events and the production automatic decision
module but a simulated gearbox; it does not claim Rapier collision validation.
"""
from pathlib import Path
import re, subprocess, unittest
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[3]
WEB=ROOT/'desktop3d'

class TransmissionPolicyQA(unittest.TestCase):
    def test_real_policy_across_four_vehicle_presets(self):
        done=subprocess.run(['node',str(WEB/'tests/validate-auto-transmission.mjs')],
                            capture_output=True,text=True,timeout=15)
        self.assertEqual(done.returncode,0,done.stdout+done.stderr)
        self.assertIn('PASS v1.8.9.2',done.stdout)
    def test_physics_and_collision_solver_unchanged(self):
        old=Path('/mnt/data/SHIFT_LAB_V1.8.9_Procedural_Map_Game_UI/desktop3d')
        if old.exists():
            for item in ['public/physics.html','src/chassis.mjs','src/road.mjs','src/obstacles.mjs',
                         'src/scenarios.mjs','src/steering-input.mjs']:
                self.assertEqual((WEB/item).read_bytes(),(old/item).read_bytes(),item)

class TransmissionBrowserQA(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pw=sync_playwright().start()
        cls.browser=cls.pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,
                                            args=['--no-sandbox'])
    @classmethod
    def tearDownClass(cls):
        cls.browser.close();cls.pw.stop()
    def setUp(self):
        self.page=self.browser.new_page()
        self.addCleanup(self.page.close)
        page=(WEB/'index.html').read_text().replace('src="./physics.html"','src="about:blank"')
        page=page.replace('<script type="module" src="./src/main.mjs"></script>','')
        self.page.set_content(page,wait_until='load')
        self.page.eval_on_selector('#screen-overlay','e=>e.remove()')
        modules='\n'.join(re.sub(r'^import .*?;\s*$','',(WEB/'src'/name).read_text(),flags=re.MULTILINE).replace('export const','const')
           .replace('export function','function') for name in
           ['steering-input.mjs','procedural-map.mjs','game-modes.mjs','automatic-transmission.mjs','automatic-range.mjs'])
        main=re.sub(r'^import .*?;\s*$','',(WEB/'src/main.mjs').read_text(),flags=re.MULTILINE)
        main=main.replace('boot().catch(failure);','')
        injected='''
const SCENARIOS={free:{description:'free'}};
window.__GEAR_QA__={
    init(){
      d={inputKeys:new Set(),hostControls:{steer:0,throttle:0,brake:0,clutch:0},requests:[],
        params:{ratios:{1:3.55,2:2.06,3:1.40,4:1.03,5:.84,6:.72},finalDrive:3.9,
          wheelRadius:.31,idleRPM:850,redlineRPM:6800},
        state:{gear:5,pendingGear:null,velocity:12,engineOmega:1700*2*Math.PI/60,
          time:4,clutch:.95,engineOn:true,throttle:0,brake:1},
        requestGear(g){this.requests.push(g);this.state.pendingGear=g;this.state.gear=0;return true;},
        startEngine(){this.state.engineOn=true;}};
      labReady=true;autoRange='D';installEvents();driveFocus();
    },
    get(){return {mode:$('drive-mode').value,clutch:d.hostControls.clutch,
      disabled:gearSelect.disabled,coreKeys:[...d.inputKeys],requests:[...d.requests],
      pendingGear:d.state.pendingGear};},
    autoStep(){updateAutoDrive();return this.get()},
    clear(){d.requests=[];d.state.pendingGear=null;d.state.gear=5;},
    mode(m){$('drive-mode').value=m;$('drive-mode').dispatchEvent(new Event('change',{bubbles:true}));
        driveFocus();return this.get();}
};'''
        self.page.add_script_tag(content=modules+'\n'+main+'\n'+injected)
        self.page.evaluate('window.__GEAR_QA__.init()')
    def test_auto_mode_ignores_keyboard_gear_commands_and_clutch(self):
        initial=self.page.evaluate('window.__GEAR_QA__.get()')
        self.assertEqual(initial['mode'],'assisted')
        self.assertTrue(initial['disabled'])
        for keys in ['Shift+1','Shift+6','2','0','r','Numpad3']:
            with self.subTest(keys=keys):
                self.page.keyboard.press(keys)
                data=self.page.evaluate('window.__GEAR_QA__.get()')
                self.assertEqual(data['requests'],[])
                self.assertNotIn('shift',data['coreKeys'])
        self.page.keyboard.down('Shift')
        self.assertNotIn('shift',self.page.evaluate('window.__GEAR_QA__.get().coreKeys'))
        self.page.keyboard.up('Shift')
    def test_auto_downshift_on_braking_through_original_request_interface(self):
        state=self.page.evaluate('window.__GEAR_QA__.autoStep()')
        self.assertEqual(state['requests'],[4])
        self.assertEqual(state['pendingGear'],4)
        self.assertEqual(state['clutch'],1)
        state=self.page.evaluate('window.__GEAR_QA__.autoStep()')
        self.assertEqual(state['requests'],[4])
    def test_manual_mode_retains_shift_and_number_keys(self):
        state=self.page.evaluate("window.__GEAR_QA__.mode('manual')")
        self.assertEqual(state['mode'],'manual')
        self.assertFalse(state['disabled'])
        self.page.keyboard.down('Shift')
        self.assertIn('shift',self.page.evaluate('window.__GEAR_QA__.get().coreKeys'))
        self.page.keyboard.press('4')
        state=self.page.evaluate('window.__GEAR_QA__.get()')
        self.assertEqual(state['requests'],[4])
        self.page.keyboard.up('Shift')
        self.assertNotIn('shift',self.page.evaluate('window.__GEAR_QA__.get().coreKeys'))
    def test_manual_selector_does_not_silently_switch_auto_to_manual(self):
        self.page.evaluate('''()=>{
          const g=document.getElementById('gear');g.value='3';
          g.dispatchEvent(new Event('change',{bubbles:true}));
        }''')
        state=self.page.evaluate('window.__GEAR_QA__.get()')
        self.assertEqual(state['mode'],'assisted')
        self.assertEqual(state['requests'],[])
        self.assertTrue(state['disabled'])

if __name__=='__main__':unittest.main(verbosity=2)
