#!/usr/bin/env python3
"""Measured-data QA for SHIFT//LAB. Does not modify vehicle physics.

Inputs are obtained independently from source institutions. Git blob hash checks
fail closed. These routines are not real-car model parameter identification.
"""
from __future__ import annotations
import argparse
import csv
import hashlib
import json
import math
from pathlib import Path
import urllib.request
import numpy as np

ADMA_URL = 'https://raw.githubusercontent.com/MB-Team-THI/UAHL-RevStED/main/ADMA_data_sample.csv'
ADMA_SHA = '2e7385074dc741dbda0a2036184923d1b4942462'
CIVIC_URL = 'https://raw.githubusercontent.com/OpenLKA/Acceleration_Dataset/main/ICE/HONDA_CIVIC_segments.json'
CIVIC_SHA = 'cec380cf6599d93d1e560fb15b38c899c62fdb29'
P1_SOURCE = 'https://www.projects.bucknell.edu/Beal_Automotive/'


def blob_sha(data: bytes) -> str:
    return hashlib.sha1(f'blob {len(data)}\0'.encode() + data).hexdigest()


def fetch_or_read(path: Path | None, url: str, sha: str) -> bytes:
    if path is None:
        with urllib.request.urlopen(url, timeout=60) as response:
            raw = response.read()
    else:
        raw = path.read_bytes()
    actual = blob_sha(raw)
    if actual != sha:
        raise ValueError(f'Source hash mismatch: expected {sha}, got {actual}')
    return raw


def error(actual: np.ndarray, forecast: np.ndarray) -> dict:
    d = np.asarray(actual) - np.asarray(forecast)
    return {'n': int(len(d)), 'rmse_deg_s': float(np.sqrt(np.mean(d*d))),
            'mae_deg_s': float(np.mean(np.abs(d))), 'bias_deg_s': float(np.mean(d))}


def verify_adma_bytes(raw: bytes) -> dict:
    lines = raw.decode('utf-8-sig').strip().splitlines()
    columns = lines[0].split(',')
    required={27:'z', 96:'ins_yaw', 109:'ins_time_msec'}
    for i, name in required.items():
        if columns[i] != name:
            raise ValueError(f'ADMA schema drift: column {i}, expected {name}, got {columns[i]}')
    data=[x.split(',') for x in lines[1:] if x.strip()]
    if not 900 <= len(data) <= 1100 or any(len(x) != len(columns) for x in data):
        raise ValueError('Unexpected ADMA sample length/row schema')
    gyro=np.array([float(x[27]) for x in data],dtype=float)
    heading=np.array([float(x[96]) for x in data],dtype=float)
    time=np.array([float(x[109]) for x in data],dtype=float)
    slip=np.array([float(x[53]) for x in data],dtype=float)
    if not np.all(np.isfinite(np.stack([gyro,heading,time,slip]))):
        raise ValueError('Non-finite measurement')
    if not np.allclose(np.diff(time),10,atol=1e-7):
        raise ValueError('Sampling is not exactly 100 Hz in this sample')
    derivative=[]; x=[]; times=[]
    for i in range(5,len(data)-5):
        dt=(time[i+5]-time[i-5])/1000.
        hd=(heading[i+5]-heading[i-5]+180)%360-180
        if .09 < dt < .11:
            derivative.append(hd/dt)
            x.append(gyro[i])
            times.append((time[i]-time[0])/1000.)
    derivative=np.asarray(derivative);x=np.asarray(x);times=np.asarray(times)
    train=times<6.5; holdout=~train
    # Fit sensor gain and offset ONLY in first 6.5s; final 3.44s are unseen.
    k,b=np.linalg.lstsq(np.stack([x[train],np.ones(sum(train))],axis=1),
                        derivative[train],rcond=None)[0]
    fitted=k*x+b
    return {
      'source':ADMA_URL,'git_blob_sha':ADMA_SHA, 'kind':'real instrumented vehicle INS, not synthetic',
      'raw_rows':len(data), 'sample_hz':100., 'period_s':float((time[-1]-time[0])/1000),
      'derived_heading_rate_rows':len(x),'split_s':6.5,
      'train_rows':int(sum(train)),'holdout_rows':int(sum(holdout)),
      'fit_gain_dimensionless':float(k),'fit_offset_deg_s':float(b),
      'train':{'raw_gyro':error(derivative[train],x[train]),
               'corrected_gyro':error(derivative[train],fitted[train])},
      'holdout':{'raw_gyro':error(derivative[holdout],x[holdout]),
                 'corrected_gyro':error(derivative[holdout],fitted[holdout])},
      'gyro_heading_derivative_corr':float(np.corrcoef(x,derivative)[0,1]),
      'gyro_range_deg_s':[float(x.min()),float(x.max())],
      'slip_range_deg':[float(slip.min()),float(slip.max())],
      'note':'Sensor-to-sensor agreement within one 10-second trace, not predictive vehicle dynamics calibration.'
    }


def percentile(a: list[float], q: float) -> float:
    return float(np.quantile(np.asarray(a,float),q,method='lower'))


def verify_civic_bytes(raw: bytes) -> dict:
    obj=json.loads(raw)
    segments=[]
    for group_index, groups in enumerate(obj.values()):
        for subclass, group in enumerate(groups):
            for seg in group:
                n=len(seg.get('v',[]))
                if n>=5 and len(seg.get('a',[]))==n and len(seg.get('t',[]))==n:
                    segments.append((group_index,subclass,seg))
    if len(segments)<20:
        raise ValueError('Not enough actual automotive acceleration segments')
    rows=[]; overlaps=[]; idx_vals={}; dt_values=[]; pedals=[]
    for (gi,subclass,seg) in segments:
        v=np.asarray(seg['v'],float);a=np.asarray(seg['a'],float)
        t=np.asarray(seg['t'],float)
        pedals.extend(float(x) for x in seg.get('padel',[]))
        if not(np.isfinite(v).all() and np.isfinite(a).all() and np.isfinite(t).all()):
            raise ValueError('Invalid longitudinal measurements')
        if np.any(np.diff(t)<=0):
            raise ValueError('Unsorted / repeated time in segment')
        dt_values.extend(np.diff(t).tolist())
        for i in range(1,len(t)-1):
            deriv=(v[i+1]-v[i-1])/(t[i+1]-t[i-1])
            rows.append((float(v[i]),float(a[i]),float(deriv)))
            pos=seg['start_idx']+i
            if pos in idx_vals and abs(float(v[i])-idx_vals[pos])>2.0:
                overlaps.append(pos)
            idx_vals[pos]=float(v[i])
    speed=np.array([x[0] for x in rows]); accel=np.array([x[1] for x in rows]);
    derivative=np.array([x[2] for x in rows]); bins=[]
    for lower in range(0,35,5):
        x=accel[(speed>=lower)&(speed<lower+5)]
        if len(x):
            bins.append({'speed_mps':[lower,lower+5],'n':int(len(x)),
              'p10_acc_mps2':percentile(x.tolist(),.10),
              'p50_acc_mps2':percentile(x.tolist(),.50),
              'p90_acc_mps2':percentile(x.tolist(),.90)})
    return {'source':CIVIC_URL,'git_blob_sha':CIVIC_SHA,'kind':'reported real Honda Civic acceleration segments',
        'segments':len(segments),'interior_observations':len(rows),
        'derived_actual_hz':float(1/np.median(dt_values)),
        'a_vs_speed_gradient_correlation':float(np.corrcoef(accel,derivative)[0,1]),
        'a_vs_speed_gradient_rmse_mps2':float(np.sqrt(np.mean((accel-derivative)**2))),
        'pedal_min_max':[min(pedals),max(pedals)],
        'index_collision_with_different_speeds':len(overlaps),
        'acceleration_bins':bins,
        'note':'Same upstream speed source likely drives a; not independent accelerometer validation. Pedal values 0..218, inconsistent scales; do NOT fit torque or throttle coefficients. Segment indices collide with conflicting velocities; do NOT claim independent random holdout.'}


def p1_reference() -> dict:
    m=1724.; I=1300.;a=1.35;b=1.10;Cf=75000.;Cr=135000.;L=a+b
    # Standard steady-state linear bicycle: delta = (L + K*v^2)*curvature
    K=(m/L)*(b/Cf-a/Cr)
    rows=[]
    for kmh in [20,40,60,80,100]:
        speed=kmh/3.6;delta=3*math.pi/180
        r=speed*delta/(L+K*speed**2)
        rows.append({'kmh':kmh,'roadwheel_steer_deg':3.,'predicted_yaw_deg_s':round(r*180/math.pi,4),
                    'predicted_ay_mps2':round(speed*r,4)})
    return {'source':P1_SOURCE,'status':'research-identified best-estimate P1 parameters, NOT the in-game car',
      'mass_kg':m,'yaw_inertia_kg_m2':I,'a_m':a,'b_m':b,'wheelbase_m':L,
      'front_cornering_stiffness_N_per_rad':Cf,'rear_cornering_stiffness_N_per_rad':Cr,
      'linear_understeer_coefficient_s2_per_m':K,'hypothetical_3deg_roadwheel_steer':rows,
      'note':'Yaw predictions are analytic bicycle-model computations from published estimated parameters, NOT road measurements.'}


def run(adma:Path|None,civic:Path|None,out:Path,download:bool):
    out.mkdir(parents=True,exist_ok=True)
    p1=p1_reference();(out/'bucknell_p1_reference.json').write_text(json.dumps(p1,indent=2)+'\n')
    with (out/'bucknell_p1_steady_yaw.csv').open('w',newline='') as f:
        w=csv.DictWriter(f,fieldnames=p1['hypothetical_3deg_roadwheel_steer'][0].keys());w.writeheader();w.writerows(p1['hypothetical_3deg_roadwheel_steer'])
    report={'bucknell_p1':p1}
    for key,path,url,sha,fn in [
       ('adma',adma,ADMA_URL,ADMA_SHA,verify_adma_bytes),
       ('civic',civic,CIVIC_URL,CIVIC_SHA,verify_civic_bytes)]:
        if path is None and not download: continue
        blob=fetch_or_read(path,url,sha)
        record=fn(blob)
        (out/f'{key}_metrics.json').write_text(json.dumps(record,indent=2)+'\n')
        report[key]=record
        if key=='civic':
            with (out/'civic_acceleration_bins.csv').open('w',newline='') as f:
                w=csv.writer(f);w.writerow(['min_speed_mps','max_speed_mps','n','p10_acc_mps2','p50_acc_mps2','p90_acc_mps2'])
                for b in record['acceleration_bins']:
                    w.writerow([*b['speed_mps'],b['n'],b['p10_acc_mps2'],b['p50_acc_mps2'],b['p90_acc_mps2']])
    (out/'combined_reference_summary.json').write_text(json.dumps(report,indent=2)+'\n')
    return report

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--adma',type=Path,help='Original ADMA_data_sample.csv')
    parser.add_argument('--civic',type=Path,help='Original HONDA_CIVIC_segments.json')
    parser.add_argument('--download',action='store_true',help='Fetch missing inputs from public GitHub; verify SHA')
    parser.add_argument('--output',type=Path,default=Path(__file__).resolve().parents[1]/'metrics/recomputed')
    args=parser.parse_args()
    d=run(args.adma,args.civic,args.output,args.download)
    print(json.dumps({k:{'status': 'processed' if k in d else 'not supplied'} for k in ['adma','civic']},indent=2))
