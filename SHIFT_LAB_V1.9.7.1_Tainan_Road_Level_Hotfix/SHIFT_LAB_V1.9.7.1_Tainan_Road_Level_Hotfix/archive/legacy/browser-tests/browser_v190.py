"""SHIFT LAB 1.9.0 real Chromium / Three.js / Rapier WASM acceptance.

Requires npm dependencies, a running Vite server, Playwright and Chromium.
python archive/legacy/browser-tests/browser_v190.py --url http://127.0.0.1:5173/ \
    --drive-seconds 10 --map-rebuilds 3
For prolonged running: --drive-seconds 1800

This script is NOT a mock test. Fails if Rapier/WebGL2 cannot start.
"""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright

HERE=Path(__file__).resolve().parent
SNAP='window.__SHIFT_LAB_3D_QA__.snapshot()'

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--url',default='http://127.0.0.1:5173/')
    parser.add_argument('--browser',default='/usr/bin/chromium')
    parser.add_argument('--timeout',type=int,default=180000)
    parser.add_argument('--drive-seconds',type=int,default=10)
    parser.add_argument('--map-rebuilds',type=int,default=3)
    parser.add_argument('--skip-suite',action='store_true')
    args=parser.parse_args()
    output=Path(__file__).resolve().parents[3]/'artifacts/tests/legacy-browser'
    output.mkdir(parents=True,exist_ok=True)
    errors=[]
    results={'version':'1.9.0','started':datetime.now(timezone.utc).isoformat(),
             'url':args.url,'driveSeconds':args.drive_seconds,'mapRebuilds':args.map_rebuilds}
    with sync_playwright() as pw:
        opts={'headless':True,'args':['--no-sandbox','--use-gl=angle',
             '--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']}
        if args.browser and Path(args.browser).is_file():
            opts['executable_path']=args.browser
        browser=pw.chromium.launch(**opts)
        page=browser.new_page(viewport={'width':1600,'height':920})
        page.on('pageerror',lambda err:errors.append(str(err)))
        def hold(key,ms):
            page.keyboard.down(key)
            page.wait_for_timeout(ms)
            page.keyboard.up(key)
        def brake_until_stopped(timeout=20000):
            page.keyboard.down('s')
            page.wait_for_function(f'''()=>{{const x={SNAP};
               return Math.abs(x.signedVelocity)<.24&&
                 Math.hypot(x.vx,x.vz)<.29;}}''',timeout=timeout)
        try:
            page.goto(args.url,wait_until='domcontentloaded',timeout=30000)
            page.wait_for_function('window.__SHIFT_LAB_3D_QA__?.ready===true',timeout=args.timeout)
            assert page.evaluate('window.__SHIFT_LAB_3D_QA__.version')=='1.9.1'
            page.evaluate("window.__SHIFT_LAB_3D_QA__.openMode('drive')")
            page.locator('#view').click(position={'x':120,'y':110})
            page.wait_for_timeout(850)
            initial=page.evaluate(SNAP)
            assert page.evaluate('window.__SHIFT_LAB_3D_QA__.map.generator')==2, 'new profiles must start with road v2'
            initial_quality=page.evaluate('window.__SHIFT_LAB_3D_QA__.roadQuality')
            assert initial_quality and initial_quality['ok'],initial_quality
            results['initialRoadQuality']=initial_quality
            assert initial['autoRange']=='P' and initial['gear']==0,initial
            assert page.locator('#dash-gear').inner_text()=='P'
            hold('w',650)
            parked=page.evaluate(SNAP)
            assert parked['gear']==0 and parked['autoRange']=='P',parked
            assert parked['parkPawl'],parked
            assert abs(parked['signedVelocity'])<.4,parked
            results['parkInitial']=parked

            # Reject reverse without the brake; Shift+digit must not enter manual gear.
            page.keyboard.press('r')
            assert page.evaluate(SNAP)['autoRange']=='P','R must need a held brake'
            page.keyboard.press('Shift+6')
            assert page.evaluate(SNAP)['gear']==0,'Manual gear shortcut leaked into AMT'

            page.keyboard.down('s')
            page.locator('#auto-shifter [data-range="R"]').click()
            assert page.evaluate(SNAP)['autoRange']=='R'
            page.wait_for_function(f'{SNAP}.gear===-1',timeout=12000)
            page.keyboard.up('s')
            hold('w',2700)
            reverse=page.evaluate(SNAP)
            results['reverse']=reverse
            assert reverse['signedVelocity']<-.35,reverse
            assert reverse['gear']==-1 and reverse['pendingGear'] is None,reverse
            # Rolling reverse -> no P or D; N always available.
            page.keyboard.press('p')
            assert page.evaluate(SNAP)['autoRange']=='R','P illegally accepted at speed'
            page.keyboard.press('f')
            assert page.evaluate(SNAP)['autoRange']=='R','D illegally accepted at speed'
            page.keyboard.press('n')
            page.wait_for_function(f'{SNAP}.gear===0',timeout=3000)
            assert page.evaluate(SNAP)['autoRange']=='N'
            results['neutralAfterReverse']=page.evaluate(SNAP)

            brake_until_stopped()
            page.keyboard.press('f')
            assert page.evaluate(SNAP)['autoRange']=='D','D must be selectable with brake at rest'
            page.wait_for_function(f'{SNAP}.gear>=1',timeout=12000)
            page.keyboard.up('s')
            hold('w',2500)
            forward=page.evaluate(SNAP)
            results['forward']=forward
            assert forward['signedVelocity']>.3 and forward['gear']>0,forward

            brake_until_stopped()
            page.keyboard.press('p')
            assert page.evaluate(SNAP)['autoRange']=='P'
            page.keyboard.up('s')
            page.wait_for_timeout(450)
            final_park=page.evaluate(SNAP)
            assert final_park['gear']==0 and final_park['parkPawl'],final_park
            results['parkFinal']=final_park

            # The older manual clutch/synchronizer and map switch must still work.
            page.evaluate("window.__SHIFT_LAB_3D_QA__.openMode('settings')")
            page.locator('#car-preset').select_option('diesel')
            page.locator('#drive-mode').select_option('manual')
            page.locator('#gear').select_option('1')
            page.wait_for_function("document.querySelector('#input-status').textContent.includes('已透過原始離合器')",timeout=30000)
            manual=page.evaluate(SNAP)
            assert manual['gear']==1 and manual['pendingGear'] is None,manual
            results['parkedManualShift']=manual

            old_seed=page.evaluate('window.__SHIFT_LAB_3D_QA__.savedMap.seed')
            for i in range(args.map_rebuilds):
                seed=f'V190-ROAD-QA-{i:03}'
                page.evaluate('(seed)=>window.__SHIFT_LAB_3D_QA__.applyMap({...window.__SHIFT_LAB_3D_QA__.map,seed})',seed)
                snap=page.evaluate(SNAP)
                assert snap['mapSeed']==seed and snap['roadResources']['obstacles']==0,snap
                report=page.evaluate('window.__SHIFT_LAB_3D_QA__.roadQuality')
                assert report and report['ok'],report
                assert snap['roadResources']['chunks']>=2,snap
            results['previousSeed']=old_seed
            results['mapRebuildsComplete']=args.map_rebuilds

            page.locator('#drive-mode').select_option('assisted')
            page.evaluate("window.__SHIFT_LAB_3D_QA__.openMode('drive')")
            page.locator('#view').click(position={'x':120,'y':110})
            page.keyboard.down('s')
            page.keyboard.press('f')
            page.wait_for_function(f'{SNAP}.gear===1',timeout=15000)
            page.keyboard.up('s')
            page.keyboard.down('w')
            for _ in range(max(0,args.drive_seconds)):
                page.wait_for_timeout(1000)
                snap=page.evaluate(SNAP)
                assert snap['ready'] and snap['invalidWheelLoads']==0,snap
                assert snap['speed']<280,snap
            page.keyboard.up('w')
            results['enduranceFinal']=page.evaluate(SNAP)

            if not args.skip_suite:
                page.evaluate("window.__SHIFT_LAB_3D_QA__.openMode('tests')")
                report=page.evaluate('async()=>await window.__SHIFT_LAB_3D_QA__.runSuite()')
                results['suite']=report
                assert len(report)==5 and all(x['pass'] for x in report),report
            assert not errors,errors
            print('PASS v1.9.0 real WebGL2/Rapier PRND, manual, map, soak and physics QA')
        except Exception as exc:
            results['failure']=str(exc)
            try:
                page.screenshot(path=str(output/'v1893_browser_failure.png'))
                results['visibleStatus']=page.locator('#status').inner_text()
            except Exception:
                pass
            raise
        finally:
            results['pageErrors']=errors
            results['finished']=datetime.now(timezone.utc).isoformat()
            (output/'v1893_browser_report.json').write_text(
                json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
            browser.close()

if __name__=='__main__':
    main()
