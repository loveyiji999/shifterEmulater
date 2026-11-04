"""v1.8.9 seeded-map and game-mode contracts, no external npm dependencies."""
from v190_compat import check_v1_preserved
from pathlib import Path
from playwright.sync_api import sync_playwright
import unittest, subprocess, json
ROOT=Path(__file__).resolve().parents[3]
WEB=ROOT/'desktop3d'

class V189Contracts(unittest.TestCase):
    def test_generated_map_validation(self):
        p=subprocess.run(['node',str(WEB/'tests/validate-procedural-map.mjs')],capture_output=True,text=True)
        self.assertEqual(p.returncode,0,p.stderr)
        self.assertIn('PASS v1.9.0',p.stdout)

    def test_road_rebuild_clears_all_physics_and_visual_objects(self):
        p=subprocess.run(['node',str(WEB/'tests/validate-road-reset.mjs')],capture_output=True,text=True)
        self.assertEqual(p.returncode,0,p.stderr)
        self.assertIn('PASS v1.8.9.2 road',p.stdout)

    def test_physics_solver_and_qa_scenarios_unmodified(self):
        base=Path('/mnt/data/SHIFT_LAB_V1.8.8_Unified_Web_Drive/desktop3d')
        self.assertTrue(check_v1_preserved())
        if base.exists():
            for name in ['chassis.mjs','scenarios.mjs','obstacles.mjs','steering-input.mjs']:
                self.assertEqual((WEB/'src'/name).read_bytes(),(base/'src'/name).read_bytes())
        code=(WEB/'src/main.mjs').read_text()
        self.assertIn('ensureScenarioMap(id)',code)
        self.assertIn('const desired=id===\'free\'?userMapConfig:REFERENCE_MAP',code)
        self.assertIn('obstacles.dispose();',code)
        self.assertIn('road.clear();',code)
        self.assertIn('d.generateRoad(next)',code)
        road=(WEB/'src/road.mjs').read_text()
        self.assertIn('this.world.removeCollider(chunk.collider,true)',road)
        self.assertIn('this.scene.remove(chunk.mesh)',road)
        self.assertIn('this.groundHandles.delete(chunk.collider.handle)',road)

    def test_game_is_one_canvas_with_separate_modes(self):
        html=(WEB/'index.html').read_text()
        self.assertEqual(html.count('id="view"'),1)
        self.assertIn('id="dashboard"',html)
        self.assertIn('id="dash-speed"',html)
        self.assertIn('id="dash-rpm"',html)
        self.assertIn('id="dash-gear"',html)
        self.assertIn('id="settings-panel"',html)
        self.assertIn('id="tests-panel"',html)
        self.assertIn('id="map-seed"',html)
        self.assertIn('id="map-generate"',html)
        self.assertIn('id="map-random"',html)
        self.assertIn('id="route-preview"',html)
        self.assertIn('aria-hidden="true"',html)
        self.assertIn('id="panel-overlay" hidden',html)
        self.assertIn('id="tests-panel" class="panel" role="dialog" aria-label="車輛物理測試模式" hidden',html)

    def test_full_host_route_switch_restores_player_seed(self):
        p=subprocess.run(['python',str(ROOT/'archive/legacy/tests/route_switch_probe.py')],capture_output=True,text=True,timeout=45)
        self.assertEqual(p.returncode,0,p.stdout+p.stderr)
        self.assertIn('PASS 3D-host v1/v2 map regenerate',p.stdout)

    def test_all_scripts_parse(self):
        sources=list((WEB/'src').glob('*.mjs'))+list((WEB/'tests').glob('*.mjs'))
        for file in sources:
            with self.subTest(name=file.name):
                p=subprocess.run(['node','--check',str(file)],capture_output=True,text=True)
                self.assertEqual(p.returncode,0,p.stderr)

class V189SeededRouteBrowser(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pw=sync_playwright().start()
        cls.browser=cls.pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    @classmethod
    def tearDownClass(cls):cls.browser.close();cls.pw.stop()

    def test_original_seeded_generator_reproduces_route(self):
        page=self.browser.new_page()
        try:
            page.set_content((WEB/'public/physics.html').read_text(),wait_until='load')
            payload=page.evaluate('''()=>{
              const d=window.__SHIFT_LAB_DEBUG__,config={...d.route.config,seed:'TEST-189',turnChance:80};
              d.generateRoad(config);
              const first=d.route.points.filter((p,i)=>i%180===0).map(p=>[p.s,p.x,p.y,p.z,p.heading]);
              const length=d.roadTotalDistance();
              d.generateRoad(config);
              const second=d.route.points.filter((p,i)=>i%180===0).map(p=>[p.s,p.x,p.y,p.z,p.heading]);
              d.generateRoad({...config,seed:'DIFFERENT-189'});
              const third=d.route.points.filter((p,i)=>i%180===0).map(p=>[p.s,p.x,p.y,p.z,p.heading]);
              return {same:JSON.stringify(first)===JSON.stringify(second),different:JSON.stringify(first)!==JSON.stringify(third),length,startingRoadStraight:d.route.segments[0].type==='straight'};
            }''')
            self.assertTrue(payload['same'])
            self.assertTrue(payload['different'])
            self.assertTrue(payload['startingRoadStraight'])
            self.assertGreater(payload['length'],8000)
        finally:page.close()

if __name__=='__main__':unittest.main(verbosity=2)
