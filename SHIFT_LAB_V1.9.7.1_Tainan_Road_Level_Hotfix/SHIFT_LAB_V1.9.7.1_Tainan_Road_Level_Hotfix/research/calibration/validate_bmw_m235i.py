#!/usr/bin/env python3
"""Reproduce the 2018 BMW M235i CAN lateral-acceleration benchmark.

Real data only. Never generates synthetic 'measurements'. Training grid selected
strictly by training RMSE. Holdout is NOT involved in model selection.

The *steering angle* column may represent steering-wheel angle rather than the
front-road-wheel angle. Therefore the result is a surrogate input/ay relation,
not an identifiable tire stiffness, rack ratio or SHIFT//LAB 4-wheel fit.

Usage:
  python research/calibration/validate_bmw_m235i.py --download --out research/results/bmw_reproduced
  python research/calibration/validate_bmw_m235i.py --input /local/dataset1_car.csv --out research/results/bmw_reproduced
"""
from __future__ import annotations
import argparse,csv,hashlib,io,json,math,urllib.request
from pathlib import Path
import numpy as np

SOURCE='https://raw.githubusercontent.com/cloudpose/smartphone_driving_dataset/master/dataset1_car.csv'
SOURCE_PAGE='https://github.com/cloudpose/smartphone_driving_dataset'
EXPECTED_GIT_BLOB_SHA1='9fb7b829265b9e94a09bbc188740dd7d350b0245'
TRAIN_END=185.0
HOLDOUT_START=205.0
TRAIN_END_DAYS=0
LAGS=(0,.05,.10,.15,.20,.25,.30,.40,.50,.60)
SATURATIONS=(0,.001,.002,.005,.01,.02)
SPEED_FLOOR_M_S=5.0


def verified_data_bytes(raw:bytes):
    prefix=f'blob {len(raw)}\0'.encode('ascii')
    sha=hashlib.sha1(prefix+raw).hexdigest()
    if sha!=EXPECTED_GIT_BLOB_SHA1:
        raise ValueError('Git blob SHA1 mismatch: expected public BMW M235i CAN data, refuse unreviewed file')
    if len(raw)!=487400:
        raise ValueError('Source size mismatch')
    return sha


def parse_measured(raw:bytes):
    verified_data_bytes(raw)
    reader=csv.DictReader(io.StringIO(raw.decode('utf-8-sig')))
    cols=('Seconds','Speed (MPH)','Steering Angle','Lateral Gs','Engine RPM','Throttle Position','Acceleration Gs')
    if not all(c in reader.fieldnames for c in cols):raise ValueError('Unrecognized BMW CAN columns')
    a=[]
    for row in reader:
        x={'t':float(row['Seconds']),'speed':float(row['Speed (MPH)'])*.44704,
            'delta':math.radians(float(row['Steering Angle'])),
            'ay':float(row['Lateral Gs'])*9.80665,
            'ax':float(row['Acceleration Gs'])*9.80665,
            'rpm':float(row['Engine RPM']),
            'throttle':float(row['Throttle Position'])}
        if not all(math.isfinite(v) for v in x.values()):raise ValueError('Nonfinite raw CAN measurement')
        a.append(x)
    if len(a)!=4708:raise ValueError(f'Unrecognized dataset row count {len(a)}')
    time=np.array([x['t'] for x in a]);time-=time[0]
    if not np.all(np.diff(time)>0):raise ValueError('CAN timestamps are not strictly increasing')
    if not 341.<time[-1]<343.:raise ValueError('CAN duration changed')
    return {'time_s':time,**{key:np.asarray([x[key] for x in a]) for key in ('speed','delta','ay','ax','rpm','throttle')}}


def response_variable(d,lag,c):
    t=d['time_s'];steer=np.interp(t-lag,t,d['delta']);v=d['speed']
    return v*v*steer/(1+c*v*v)


def fit_linear(x,y):
    center_x=float(np.mean(x));center_y=float(np.mean(y))
    denominator=float(np.sum((x-center_x)**2))
    if denominator<1e-10:raise ValueError('No measured steering excitation')
    k=float(np.sum((x-center_x)*(y-center_y))/denominator)
    return k,center_y-k*center_x


def metric(y,pred):
    e=pred-y; rmse=float(np.sqrt(np.mean(e**2)))
    denom=float(np.sum((y-np.mean(y))**2))
    return {'n':len(y),'rmse_m_s2':rmse,'mae_m_s2':float(np.mean(np.abs(e))),
            'bias_prediction_minus_measured_m_s2':float(np.mean(e)),
            'r2':float(1-np.sum(e**2)/denom) if denom>1e-10 else None}


def run_measured(d):
    t=d['time_s'];v=d['speed'];y=d['ay']
    mask=(v>SPEED_FLOOR_M_S)&(np.abs(d['delta'])<2.5)&(np.abs(y)<4.5)
    train=mask&(t<TRAIN_END)
    hold=mask&(t>=HOLDOUT_START)
    if sum(train)<100 or sum(hold)<100:raise ValueError('Insufficient separated real steering data')
    candidates=[]
    for lag in LAGS:
        for c in SATURATIONS:
            x=response_variable(d,lag,c)
            k,b=fit_linear(x[train],y[train])
            pred=k*x+b
            candidates.append({'lag_s':lag,'saturation_s2_m2':c,'k':k,'intercept_m_s2':b,
               'training':metric(y[train],pred[train]),
               'holdout':metric(y[hold],pred[hold]),
               'holdout_corners':metric(y[hold&(np.abs(d['delta'])>.08)],pred[hold&(np.abs(d['delta'])>.08)])})
    selected=min(candidates,key=lambda s:s['training']['rmse_m_s2'])
    static=next(a for a in candidates if a['lag_s']==0 and a['saturation_s2_m2']==0)
    null_metric=metric(y[hold],np.zeros(sum(hold)))
    out={
      'reference_vehicle':'BMW M235i; original 2018 CAN/smartphone linked dataset',
      'source':SOURCE_PAGE,'source_raw':SOURCE,'git_blob_sha1':EXPECTED_GIT_BLOB_SHA1,
      'sample_count':len(t),'duration_s':float(t[-1]),
      'driving_system':'gasoline; gearbox and exact wheel/rack steering ratio NOT recorded',
      'train_s':[0,TRAIN_END],'purged_gap_s':[TRAIN_END,HOLDOUT_START],
      'holdout_s':[HOLDOUT_START,float(t[-1])],
      'filter':'speed>5 m/s, abs(delta)<2.5 rad, abs(ay)<4.5 m/s2; same predeclared filter on train and holdout',
      'model':'ay = intercept + k * speed_mps^2 * steering_rad(t-lag) / (1+c*speed_mps^2)',
      'candidate_selection':'select smallest TRAIN RMSE among fixed grid; no holdout tuning',
      'candidates':len(candidates),'selected_model':selected,
      'zero_ay_holdout':null_metric,'static_no_lag_model':static,
      'simple_baseline_is_better_on_holdout':static['holdout']['rmse_m_s2'] < selected['holdout']['rmse_m_s2'],
      'independent_yaw_rate_available':False,
      'tire_stiffness_identifiable':False,
      'automatically_applied_to_game':False,
      'rights':'Raw source repository has no explicit dataset redistribution license verified; do not repackage raw rows',
    }
    return out


def main():
    a=argparse.ArgumentParser(description=__doc__)
    src=a.add_mutually_exclusive_group(required=True)
    src.add_argument('--input',type=Path)
    src.add_argument('--download',action='store_true')
    a.add_argument('--out',type=Path,default=Path(__file__).resolve().parents[1]/'results/bmw_reproduced')
    args=a.parse_args()
    raw=urllib.request.urlopen(SOURCE,timeout=35).read() if args.download else args.input.read_bytes()
    d=parse_measured(raw);res=run_measured(d)
    args.out.mkdir(parents=True,exist_ok=True)
    (args.out/'bmw_real_lateral_fit.json').write_text(json.dumps(res,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    with (args.out/'bmw_model_comparison.csv').open('w',newline='',encoding='utf-8') as f:
        w=csv.writer(f);w.writerow(['model','training_rmse_m_s2','holdout_rmse_m_s2','holdout_r2','holdout_n'])
        for name,k in [('zero_ay_holdout','zero_ay_holdout'),('static_no_lag_model','static_no_lag_model'),('selected_model','selected_model')]:
            obj=res[k];m=obj if name=='zero_ay_holdout' else obj['holdout']
            w.writerow([name,obj.get('training',{}).get('rmse_m_s2') if isinstance(obj,dict) else None,m['rmse_m_s2'],m['r2'],m['n']])
    print(json.dumps({k:res[k] for k in ('sample_count','selected_model','static_no_lag_model','zero_ay_holdout')},indent=2))
    return 0

if __name__=='__main__':raise SystemExit(main())
