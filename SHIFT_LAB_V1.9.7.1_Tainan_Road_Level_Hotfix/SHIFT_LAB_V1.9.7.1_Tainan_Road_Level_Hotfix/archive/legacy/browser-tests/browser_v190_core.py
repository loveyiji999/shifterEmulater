"""Run actual embedded physics-page v1/v2 road integration without npm.

Checks legacy v1 generated points against the unchanged archival page, then
runs v2 on the very same vehicle physics core. Does NOT claim WebGL/Rapier QA.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]
CONFIG = {'generator': 1, 'seed': 'SHIFT-2026-MOUNTAIN-07', 'turnChance': 58,
          'hairpinChance': 20, 'slopeChance': 52, 'leftBias': 50, 'upBias': 50,
          'maxGrade': 9}


def get_samples(page):
    return page.evaluate('''() => {
      const d=window.__SHIFT_LAB_DEBUG__;
      d.setExternalClock(true);
      return d.route.points.filter((p,i)=>i%35===0).slice(0,65)
       .map(p=>[p.s,p.x,p.z,p.y,p.heading].map(n=>+n.toFixed(7)));
    }''')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--chromium', default='/usr/bin/chromium')
    options = parser.parse_args()
    original=(ROOT/'archive/legacy/shiftlab-2d-reference.html').read_text(encoding='utf-8')
    next_html=(ROOT/'desktop3d/public/physics.html').read_text(encoding='utf-8')
    engine=(ROOT/'desktop3d/public/road-generator-v2.js').read_text(encoding='utf-8')
    # Some CI browsers disallow both localhost and file:// navigation. Inject
    # the exact external engine source into the exact physics page for this
    # browser-only functional test; serving behavior is tested separately.
    next_html=next_html.replace('<script src="./road-generator-v2.js"></script>',
                                '<script>'+engine+'</script>',1)
    assert 'window.SHIFT_ROAD_V2' in next_html
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path=options.chromium,
                headless=True, args=['--no-sandbox', '--disable-dev-shm-usage'])
            try:
                baseline = browser.new_page()
                baseline.set_content(original, wait_until='load', timeout=30000)
                baseline.wait_for_function('!!window.__SHIFT_LAB_DEBUG__', timeout=30000)
                expected = get_samples(baseline)
                baseline.close()
                page = browser.new_page()
                errors = []
                page.on('pageerror', lambda exc: errors.append(str(exc)))
                page.set_content(next_html, wait_until='load', timeout=30000)
                page.wait_for_function('!!window.__SHIFT_LAB_DEBUG__ && !!window.SHIFT_ROAD_V2', timeout=30000)
                assert get_samples(page) == expected, 'legacy generator changed relative to v1.8.9.3'
                values = page.evaluate('''cfg=>{
                  const d=window.__SHIFT_LAB_DEBUG__;
                  d.generateRoad(cfg);
                  const q=d.route.quality;
                  return {generator:d.route.config.generator,
                    audit:q,segments:d.route.segments.length,
                    types:d.route.segments.filter(seg=>seg.type.includes('hairpin')).length,
                    total:d.roadTotalDistance()};
                }''', {**CONFIG,'generator':2})
                assert values['generator'] == 2, values
                assert values['segments'] == 96, values
                assert values['audit']['ok'], values
                assert values['types'] > 0, values
                assert values['total'] > 10000, values
                assert not errors, errors
                print('PASS v1.9.0 Chromium original-engine integration: v1 exact legacy + v2 '+
                      str(values['segments'])+' sections / '+str(round(values['total']/1000,1))+' km')
                print('Road audit: '+json.dumps(values['audit'],ensure_ascii=False))
                page.close()
            finally:
                browser.close()
    finally:
        pass


if __name__ == '__main__':
    main()
