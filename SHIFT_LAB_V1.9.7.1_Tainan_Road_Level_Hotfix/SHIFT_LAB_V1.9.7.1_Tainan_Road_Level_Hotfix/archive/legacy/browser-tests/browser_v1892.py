"""Real Chromium/WebGL2/Rapier v1.8.9.2 end-to-end acceptance.

Needs installed npm dependencies, running Vite server, Playwright + Chromium.
python archive/legacy/browser-tests/browser_v1892.py --url http://127.0.0.1:5173/ \
    --drive-seconds 8 --map-rebuilds 3
For a 30-minute soak, pass --drive-seconds 1800.

This checks the real WASM instance; JS mock/unit tests cannot replace it.
"""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:5173/')
    parser.add_argument('--browser', default='/usr/bin/chromium')
    parser.add_argument('--timeout', type=int, default=180000)
    parser.add_argument('--drive-seconds', type=int, default=8)
    parser.add_argument('--map-rebuilds', type=int, default=3)
    parser.add_argument('--skip-suite', action='store_true')
    args = parser.parse_args()
    out = Path(__file__).resolve().parents[3] / 'artifacts/tests/legacy-browser'
    out.mkdir(parents=True, exist_ok=True)
    errors = []
    results = {'version': '1.8.9.2', 'started': datetime.now(timezone.utc).isoformat(),
               'url': args.url, 'driveSeconds': args.drive_seconds,
               'mapRebuilds': args.map_rebuilds}
    with sync_playwright() as pw:
        opts = {'headless': True, 'args': ['--no-sandbox', '--use-gl=angle',
                '--use-angle=swiftshader', '--enable-webgl', '--enable-unsafe-swiftshader']}
        if args.browser and Path(args.browser).is_file():
            opts['executable_path'] = args.browser
        browser = pw.chromium.launch(**opts)
        page = browser.new_page(viewport={'width': 1600, 'height': 920})
        page.on('pageerror', lambda error: errors.append(str(error)))
        try:
            page.goto(args.url, wait_until='domcontentloaded', timeout=30000)
            page.wait_for_function('window.__SHIFT_LAB_3D_QA__?.ready===true', timeout=args.timeout)
            version = page.evaluate('window.__SHIFT_LAB_3D_QA__.version')
            assert version == '1.8.9.2', f'Unexpected runtime {version}'

            # Switch through the actual mode controller, not an invisible QA button.
            page.evaluate("window.__SHIFT_LAB_3D_QA__.openMode('drive')")
            page.locator('#view').click(position={'x': 130, 'y': 110})
            page.keyboard.down('w')
            page.wait_for_timeout(1200)
            page.keyboard.up('w')
            free = page.evaluate('window.__SHIFT_LAB_3D_QA__.snapshot()')
            results['freeDrive'] = free
            assert free['ready'] and free['uiMode'] == 'drive', free
            assert free['invalidWheelLoads'] == 0, free
            assert free['rayHits'] > 0, free
            assert free['driverMode'] == 'assisted', free
            # Backed by live keyboard events: automatic ignores manual gearbox.
            page.keyboard.press('Shift+6')
            page.keyboard.press('2')
            snap = page.evaluate('window.__SHIFT_LAB_3D_QA__.snapshot()')
            assert 'shift' not in snap['inputKeys'], snap

            page.evaluate("window.__SHIFT_LAB_3D_QA__.openMode('settings')")
            page.locator('#car-preset').select_option('diesel')
            assert page.locator('#car-preset').input_value() == 'diesel'
            page.locator('#drive-mode').select_option('manual')
            page.locator('#gear').select_option('1')
            page.wait_for_function("document.querySelector('#input-status').textContent.includes('已透過原始離合器')", timeout=30000)
            manual = page.evaluate('window.__SHIFT_LAB_3D_QA__.snapshot()')
            results['parkedManualShift'] = manual
            assert manual['gear'] == 1 and manual['pendingGear'] is None, manual

            base = page.evaluate('window.__SHIFT_LAB_3D_QA__.savedMap.seed')
            for i in range(args.map_rebuilds):
                seed = f'V1892-SMOKE-{i:03}'
                page.evaluate('(seed)=>window.__SHIFT_LAB_3D_QA__.applyMap({...window.__SHIFT_LAB_3D_QA__.map,seed})', seed)
                snap = page.evaluate('window.__SHIFT_LAB_3D_QA__.snapshot()')
                assert snap['mapSeed'] == seed, snap
                assert snap['roadResources']['chunks'] >= 2, snap
                assert snap['roadResources']['obstacles'] == 0, snap
            results['mapRebuildsComplete'] = args.map_rebuilds
            results['previousSeed'] = base

            # Return to automatic and prove a prolonged drive does not corrupt the body.
            page.locator('#drive-mode').select_option('assisted')
            page.evaluate("window.__SHIFT_LAB_3D_QA__.openMode('drive')")
            page.locator('#view').click(position={'x': 130, 'y': 110})
            page.keyboard.down('w')
            seconds = max(0, args.drive_seconds)
            for _ in range(seconds):
                page.wait_for_timeout(1000)
                snap = page.evaluate('window.__SHIFT_LAB_3D_QA__.snapshot()')
                assert snap['ready'] and snap['invalidWheelLoads'] == 0, snap
                assert snap['speed'] < 280, snap
            page.keyboard.up('w')
            results['enduranceFinal'] = page.evaluate('window.__SHIFT_LAB_3D_QA__.snapshot()')

            if not args.skip_suite:
                page.evaluate("window.__SHIFT_LAB_3D_QA__.openMode('tests')")
                report = page.evaluate('async()=>await window.__SHIFT_LAB_3D_QA__.runSuite()')
                results['suite'] = report
                assert len(report) == 5, report
                assert all(item['pass'] for item in report), [
                    (item['scenario'], [x for x in item['checks'] if not x['passed']])
                    for item in report]
            assert not errors, errors
            print('PASS v1.8.9.2 real Chromium/WebGL2/Rapier acceptance')
        except Exception as exc:
            results['failure'] = str(exc)
            try:
                page.screenshot(path=str(out / 'v1892_browser_failure.png'))
                results['visibleStatus'] = page.locator('#status').inner_text()
            except Exception:
                pass
            raise
        finally:
            results['pageErrors'] = errors
            results['finished'] = datetime.now(timezone.utc).isoformat()
            (out / 'v1892_browser_report.json').write_text(
                json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
            browser.close()


if __name__ == '__main__':
    main()
