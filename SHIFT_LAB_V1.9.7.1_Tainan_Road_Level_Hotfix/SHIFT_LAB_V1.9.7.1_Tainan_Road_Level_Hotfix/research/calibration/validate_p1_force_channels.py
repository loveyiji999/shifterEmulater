#!/usr/bin/env python3
"""Audit P1 wheel-force channel plausibility before any tire curve fitting.

An instrumented channel label is NOT proof that values are calibrated.
Do not fabricate missing normal loads, and never fit when this check fails.
"""
from __future__ import annotations
import argparse,hashlib,json
from pathlib import Path
import numpy as np
from scipy.io import loadmat
from fit_p1_real_runs import SOURCE_DATA,M,G,A,B

WHEEL_GROUP={'left_fz':127,'right_fz':135,'left_fy':126,'right_fy':134}
FILE_IDS=['craig_2018-07-19_aa','craig_2018-07-19_ab','craig_2018-07-19_ac',
 'craig_2018-07-19_ad','craig_2018-07-19_ai','craig_2018-07-19_ak']
EXPECTED_FRONT_WHEEL_N=(M*G*B/(A+B))/2


def analyze_one(name,source_dir):
    p=source_dir/(name+'.mat.bin')
    if not p.exists():p=source_dir/(name+'.mat')
    if not p.exists():raise FileNotFoundError(f'Missing original public P1 MAT {name}')
    raw=p.read_bytes()
    if not raw.startswith(b'MATLAB') or hashlib.sha256(raw).hexdigest()!=SOURCE_DATA[name]['sha256']:
        raise ValueError(f'Raw university file mismatch {name}')
    data=loadmat(p,variable_names=['y','DataDescription'],squeeze_me=True,struct_as_record=False)
    y=data['y'][::250,:]
    dd=data['DataDescription']
    if str(dd[-1].name)!='15 Wheel Forces' or dd[-1].size!=20 or y.shape[1]!=145:
        raise ValueError('P1 force signal group identity or width changed')
    L=y[:,WHEEL_GROUP['left_fz']];R=y[:,WHEEL_GROUP['right_fz']]
    finite=np.isfinite(L)&np.isfinite(R)
    floor=.15*EXPECTED_FRONT_WHEEL_N
    valid=finite&(L>floor)&(R>floor)
    out={'source':name,'checked_original_SHA256':SOURCE_DATA[name]['sha256'],
         'samples_stride_250':len(L),'front_wheel_nominal_rough_N':EXPECTED_FRONT_WHEEL_N,
         'minimum_positive_load_each_N':floor,
         'left_fz_N_quantiles_5_50_95':[float(np.percentile(L,q)) for q in (5,50,95)],
         'right_fz_N_quantiles_5_50_95':[float(np.percentile(R,q)) for q in (5,50,95)],
         'fraction_both_positive_above_floor':float(np.mean(valid)),
         'passes_both_channel_load_gate':bool(np.mean(valid)>=.65)}
    return out


def run(source_dir):
    vals=[analyze_one(k,source_dir) for k in FILE_IDS]
    return {'signal_group':'15 Wheel Forces, two front wheels',
       'reference_static_front_per_wheel_N':EXPECTED_FRONT_WHEEL_N,
       'fraction_pass_threshold':.65,
       'sessions':vals,'all_runs_pass':all(x['passes_both_channel_load_gate'] for x in vals),
       'tire_force_coefficient_fit_approved':False,
       'reason':'Some force/normal-load channels are near zero or negative under driving. Recording or channel calibration must be verified before using Fy vs alpha or Mz vs alpha.'}


def main():
    p=argparse.ArgumentParser();p.add_argument('--source-dir',type=Path,required=True)
    p.add_argument('--out',type=Path,default=Path(__file__).resolve().parents[1]/'results/p1_force_quality.json')
    a=p.parse_args();out=run(a.source_dir)
    a.out.parent.mkdir(parents=True,exist_ok=True);a.out.write_text(json.dumps(out,indent=2)+'\n')
    print(json.dumps({'all_runs_pass':out['all_runs_pass'],
     'fractions':[round(x['fraction_both_positive_above_floor'],4) for x in out['sessions']]},indent=2))
if __name__=='__main__':main()
