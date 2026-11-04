from pathlib import Path
import re
from playwright.sync_api import sync_playwright
D=Path(__file__).resolve().parents[3]/'desktop3d'
html=(D/'index.html').read_text().replace('src="./physics.html"','src="about:blank"').replace('<script type="module" src="./src/main.mjs"></script>','')
helper='\n'.join(re.sub(r'^import .*?;\s*$','',(D/'src'/name).read_text(),flags=re.MULTILINE).replace('export const','const').replace('export async function','async function').replace('export function','function') for name in ['steering-input.mjs','procedural-map.mjs','game-modes.mjs','automatic-transmission.mjs','automatic-range.mjs','manual-gear.mjs','physics-health.mjs'])
sc=(D/'src/scenarios.mjs').read_text().replace('export const','const').replace('export async function','async function').replace('export function','function')
main=re.sub(r'^import .*?;\s*$', '', (D/'src/main.mjs').read_text(), flags=re.MULTILINE).replace('boot().catch(failure);','')
extra='''
window.__V189_ROUTE_PROBE__={
  async init(){
    d=document.getElementById('physics').contentWindow.__SHIFT_LAB_DEBUG__;
    labReady=true;let p;
    const self=this;
    road={clear(){self.calls.push('clear');},assertClean(){self.calls.push('assertClean');return true;},
      resourceStats(){return {chunks:6,ground:6,rails:20,barriers:0,obstacles:0};},
      ensure(s){self.calls.push('ensure:'+Math.floor(s));},
      position(s,side){const q=d.roadPointAt(s);return {x:q.x,y:q.y,z:q.z}}};
    obstacles={activeScenario:'free',barrierCenter:{z:104},dispose(){self.calls.push('dispose');},
      configure(id){self.calls.push('scenario:'+id)}};
    world={updateSceneQueries(){self.calls.push('updateQueries')}};
    const fakeBody={mass(){return d.params.mass},translation(){return {x:0,y:2,z:0}},
      linvel(){return {x:0,y:0,z:0}},angvel(){return {x:0,y:0,z:0}},
      rotation(){return {x:0,y:0,z:0,w:1}}};
    bridge={rigidBody:fakeBody,collider:{},maxExternalForceN:0,maxExternalTorqueNm:0,
      invalidWheelLoads:0,wheelCastHits:0,wheelCastMisses:0,
      railHits:0,barrierHits:0,maxImpactImpulse:0,maxBarrierPenetration:0,
      eventHistory:[],forceResetCount:0,collisionCount:0,contactMicrosteps:0,
      teleport({roadPoint}){self.calls.push('teleport:'+Math.floor(roadPoint.s));}};
    installEvents();
    updateMapInfo();
  },
  calls:[],
  regenerate(seed,generator=2){applyMap({...DEFAULT_MAP,seed,generator});return {...d.route.config};},
  qa(){resetDriving('settle');return d.route.config.seed;},
  free(){resetDriving('free');return d.route.config.seed;},
  gear(){return {gear:d.state.gear,pending:d.state.pendingGear,clutch:d.state.clutch};}

};
'''
with sync_playwright() as pw:
 b=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=b.new_page()
 page.on('pageerror',lambda error: print('JSERR',error))
 page.set_content(html,wait_until='load')
 page.frame_locator('#physics')
 f=page.frame(name='') if False else page.locator('#physics').element_handle().content_frame()
 f.set_content((D/'public/physics.html').read_text().replace(
    '<script src="./road-generator-v2.js"></script>',
    '<script>'+(D/'public/road-generator-v2.js').read_text()+'</script>',1),wait_until='load')
 page.evaluate("document.getElementById('screen-overlay').remove()")
 page.add_script_tag(content=helper+'\n'+sc+'\n'+main+'\n'+extra)
 page.evaluate('window.__V189_ROUTE_PROBE__.init()')
 print('before',page.evaluate('window.__V189_ROUTE_PROBE__.calls'))
 assert page.evaluate("window.__V189_ROUTE_PROBE__.regenerate('V190-CHOSEN').seed")=='V190-CHOSEN'
 assert page.evaluate('window.__V189_ROUTE_PROBE__.free()')=='V190-CHOSEN'
 assert page.evaluate('window.__V189_ROUTE_PROBE__.regenerate("V190-CHOSEN",1).generator')==1
 assert page.evaluate('window.__V189_ROUTE_PROBE__.regenerate("V190-CHOSEN",2).generator')==2
 print('call history',page.evaluate('window.__V189_ROUTE_PROBE__.calls'))
 assert page.evaluate('window.__V189_ROUTE_PROBE__.qa()')=='SHIFT-2026-MOUNTAIN-07'
 assert page.evaluate('window.__V189_ROUTE_PROBE__.free()')=='V190-CHOSEN'
 calls=page.evaluate('window.__V189_ROUTE_PROBE__.calls');assert calls.count('clear')==5 and calls.count('dispose')==5 and calls.count('updateQueries')==5,calls
 # Test the actual legacy clutch/synchronizer with the paused settings UI.
 page.evaluate("document.getElementById('drive-mode').value='manual'; document.getElementById('drive-mode').dispatchEvent(new Event('change'))")
 page.evaluate("window.__V189_ROUTE_PROBE__.free()")
 page.evaluate("openGameMode('settings')")
 page.locator('#gear').select_option('1')
 page.wait_for_function("document.getElementById('input-status').textContent.includes('已透過原始離合器')",timeout=18000)
 gear=page.evaluate('window.__V189_ROUTE_PROBE__.gear()')
 assert gear['gear']==1 and gear['pending'] is None,gear
 print('PASS real four-wheel iframe physics: paused manual settings -> clutch -> synchronizer -> first gear')
 print('PASS 3D-host v1/v2 map regenerate -> reference QA -> restored v2 player route')
 b.close()
