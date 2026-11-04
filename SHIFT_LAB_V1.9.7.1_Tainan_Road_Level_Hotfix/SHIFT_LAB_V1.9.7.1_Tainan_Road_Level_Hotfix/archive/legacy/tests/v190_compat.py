"""Checks that the archived original v1 centerline code is preserved verbatim.

The new embedded physics page adds an optional v2 dispatch in front of the
existing v1 `extendRoad` and a generator field in `generateRoad`. A whole-file
byte comparison is no longer meaningful, so guard the exact v1 blocks.
"""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]

def check_v1_preserved():
    previous=(ROOT/'archive/legacy/shiftlab-2d-reference.html').read_text(encoding='utf-8')
    current=(ROOT/'desktop3d/public/physics.html').read_text(encoding='utf-8')
    start='  const rng=route.rng,c=route.config;'
    end='function generateRoad(settings){'
    assert start in previous and start in current
    assert previous[previous.index(start):previous.index(end)]==current[current.index(start):current.index(end)],\
      'V1 seeded road integration code has changed'
    for expected in ['const ROAD_DEFAULTS=', 'function roadPointAt(distance){',
                     'function roadHash(value){', 'function roadRandom(seed){']:
        assert expected in previous and expected in current
    assert '<script src="./road-generator-v2.js"></script>' in current
    assert 'if(route.config.generator===2)' in current
    return True
