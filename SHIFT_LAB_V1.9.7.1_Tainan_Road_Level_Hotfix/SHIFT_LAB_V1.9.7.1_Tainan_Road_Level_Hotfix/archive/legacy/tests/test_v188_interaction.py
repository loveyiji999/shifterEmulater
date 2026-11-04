"""Real Chromium DOM/keyboard interaction test with a stubbed 3D renderer.
This exercises installed browser event handlers; it does NOT solve Rapier collisions.
"""
from pathlib import Path
import re, unittest
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[3]
D=ROOT/'desktop3d'

class SteeringInputBrowser(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pw=sync_playwright().start()
        cls.browser=cls.pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])

    @classmethod
    def tearDownClass(cls):
        cls.browser.close();cls.pw.stop()

    def setUp(self):
        self.page=self.browser.new_page()
        self.addCleanup(self.page.close)
        html=(D/'index.html').read_text().replace('src="./physics.html"','src="about:blank"')
        html=html.replace('<script type="module" src="./src/main.mjs"></script>','')
        self.page.set_content(html,wait_until='load')
        self.page.eval_on_selector('#screen-overlay','el=>el.remove()')
        helper='\n'.join(re.sub(r'^import .*?;\s*$','',(D/'src'/name).read_text(),flags=re.MULTILINE).replace('export const','const').replace('export function','function') for name in ['steering-input.mjs','procedural-map.mjs','game-modes.mjs','automatic-transmission.mjs','automatic-range.mjs'])
        main=(D/'src/main.mjs').read_text()
        main=re.sub(r'^import .*?;\s*$', '', main,flags=re.MULTILINE)
        main=main.replace('boot().catch(failure);','')
        # Only the UI event handlers and input filtering are executed. No physics mocks
        # are allowed to claim successful chassis runtime; the target is control polarity.
        extra='''
const SCENARIOS={free:{description:'free'}};
window.__V188_INPUT_TEST__={
  install(fake){d=fake;labReady=true;installEvents();},
  readInputs(dt){readInputs(dt)},
  keys(){return [...trackedKeys]},
  coreKeys(){return [...d.inputKeys]},
  controls(){return {...d.hostControls}}
};'''
        self.page.add_script_tag(content=helper+'\n'+main.replace('const $=id=>document.getElementById(id);','const $=id=>document.getElementById(id);')+'\n'+extra)
        self.page.evaluate('''()=>{
          window.__V188_INPUT_TEST__.install({
            inputKeys:new Set(),hostControls:{},advancedSteering:{padFilter:0,padSpeed:0,padInvert:false},
            state:{velocity:0},normalizedAdvancedAxis(raw){return raw}
          });
        }''')
        self.page.locator('#view').focus()

    def test_keyboard_arrows_translate_to_visual_left_right(self):
        for key,model,driver in [('a','d','a'),('d','a','d'),('ArrowLeft','d','a'),('ArrowRight','a','d')]:
            with self.subTest(key=key):
                self.page.keyboard.down(key)
                self.assertEqual(self.page.evaluate('window.__V188_INPUT_TEST__.coreKeys()'),[model])
                self.assertEqual(self.page.evaluate('window.__V188_INPUT_TEST__.keys()'),[driver])
                self.page.keyboard.up(key)
                self.assertEqual(self.page.evaluate('window.__V188_INPUT_TEST__.coreKeys()'),[])
        self.page.keyboard.down('w')
        self.assertEqual(self.page.evaluate('window.__V188_INPUT_TEST__.coreKeys()'),['w'])
        self.page.keyboard.up('w')

    def test_menu_settings_test_mode_block_driving_keys(self):
        self.page.keyboard.press('F1')
        self.assertFalse(self.page.locator('#settings-panel').is_hidden())
        self.assertTrue(self.page.locator('#dashboard').is_hidden())
        self.page.keyboard.down('a')
        self.assertEqual(self.page.evaluate('window.__V188_INPUT_TEST__.coreKeys()'),[])
        self.page.keyboard.up('a')
        self.page.keyboard.press('F2')
        self.assertFalse(self.page.locator('#tests-panel').is_hidden())
        self.page.keyboard.press('Escape')
        self.assertFalse(self.page.locator('#dashboard').is_hidden())
        self.page.keyboard.down('a')
        self.assertEqual(self.page.evaluate('window.__V188_INPUT_TEST__.coreKeys()'),['d'])
        self.page.keyboard.up('a')

    def test_standard_gamepad_and_optional_extra_inversion(self):
        self.page.evaluate('''()=>{
          Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[
            {connected:true,index:0,id:'Test Gamepad',axes:[-1],buttons:[]}
          ]});
          window.__V188_INPUT_TEST__.readInputs(.1);
        }''')
        out=self.page.evaluate('window.__V188_INPUT_TEST__.controls()')
        self.assertGreater(out['steer'],0) # visually LEFT => legacy +X
        self.page.evaluate("document.getElementById('pad-invert').checked=true")
        self.page.evaluate('window.__V188_INPUT_TEST__.readInputs(.1)')
        out=self.page.evaluate('window.__V188_INPUT_TEST__.controls()')
        self.assertLess(out['steer'],0)

if __name__=='__main__':unittest.main(verbosity=2)
