#!/usr/bin/env python3
"""Reproducible, explicitly scoped fit to *measured* ReV-StED OBD sample.

The input 't,sw,sp,yaw,ay,brake,slip' is a deterministic 10-Hz
subset of a publicly accessible 50-Hz genuine vehicle sensor recording.
Do not interpret the fitted surrogate as a calibration of 4-wheel chassis
parameters or as a measured steering gear ratio.
"""
from __future__ import annotations
import argparse
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import least_squares
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

SOURCE = 'https://github.com/MB-Team-THI/UAHL-RevStED/blob/main/OBD_Sample.csv'
RAW_URL = 'https://raw.githubusercontent.com/MB-Team-THI/UAHL-RevStED/main/OBD_Sample.csv'
SOURCE_BLOB_SHA = '84189261768649e0c8eb0d62d474631ff401f3ea'
DEG = math.pi / 180

def obtain_subset(raw: pd.DataFrame) -> pd.DataFrame:
    required = ['INS_time_sec', 'SW_pos_obd', 'VelFR_obd', 'VelFL_obd',
                'VelRR_obd', 'VelRL_obd', 'yaw_rate', 'LatAcc_obd',
                'brake_pressure_obd', 'Correvit_slip_angle_COG_corrvittiltcorrected']
    missing = [k for k in required if k not in raw]
    if missing:
        raise ValueError('Missing OBD columns: '+', '.join(missing))
    # Exactly the first 999 records, every fifth sample, as seen from
    # original GitHub blob. Records 0,5,...,995 inclusive => 200 points.
    s = raw.iloc[:999:5].copy()
    speed = s[['VelFR_obd', 'VelFL_obd', 'VelRR_obd', 'VelRL_obd']].astype(float).mean(axis=1)
    base = float(raw['INS_time_sec'].iloc[0]); t = s['INS_time_sec'].astype(float).to_numpy()-base
    # Float timestamp precision is ~1e-7 s; round to four decimal places.
    return pd.DataFrame({'t':np.round(t,4),'sw':s['SW_pos_obd'].astype(float).to_numpy(),
       'sp':np.round(speed.to_numpy(),4),'yaw':s['yaw_rate'].astype(float).to_numpy(),
       'ay':s['LatAcc_obd'].astype(float).to_numpy(),
       'brake':s['brake_pressure_obd'].astype(float).to_numpy(),
       'slip':s['Correvit_slip_angle_COG_corrvittiltcorrected'].astype(float).to_numpy()})

def yaw_target(c, speed_kmh, sw_deg, sw_zero_deg):
    # 'c' in m^-1 is effective front wheel gain / wheelbase, NOT steer ratio.
    return c * (speed_kmh/3.6) * ((sw_deg-sw_zero_deg)*DEG)

def rollout(a:pd.DataFrame,p,initial=None):
    c,tau,zero = p
    t=a.t.to_numpy(dtype=float)
    u=a.sw.to_numpy(dtype=float)
    v=a.sp.to_numpy(dtype=float)
    r = np.empty(len(t))
    r[0] = float(a.yaw.iloc[0])*DEG if initial is None else float(initial)
    for i in range(1,len(t)):
        h=t[i]-t[i-1]
        e=math.exp(-h/tau)
        a=yaw_target(c,v[i-1],u[i-1],zero)
        b=yaw_target(c,v[i],u[i],zero)
        # Exact solution of first-order dynamics with a linearly changing
        # equilibrium yaw target between the two observed endpoints.
        ramp_coeff = 1.0-(tau/h)*(-math.expm1(-h/tau))
        r[i]=e*r[i-1]+(-math.expm1(-h/tau))*a+ramp_coeff*(b-a)
    return r/DEG

def eval_metrics(y,pred):
    d=np.asarray(y)-np.asarray(pred)
    return {'n':int(len(d)),'rmse_deg_s':float(np.sqrt(np.mean(d*d))),
       'mae_deg_s':float(np.mean(np.abs(d))),
       'bias_deg_s':float(np.mean(d)),
       'max_abs_deg_s':float(np.max(np.abs(d)))}

def run(input_path:Path, out_dir:Path):
    df=pd.read_csv(input_path)
    cols=['t','sw','sp','yaw','ay','brake','slip']
    if any(k not in df for k in cols):
        raise ValueError(f'Expected {cols}; got {list(df)}')
    if len(df)<150:raise ValueError('need >= 150 actual samples')
    if np.any(np.diff(df.t)<=0): raise ValueError('nonmonotone timestamps')
    if not np.isfinite(df[cols].to_numpy()).all():raise ValueError('missing, NaN or infinity in real data')
    if not np.allclose(np.diff(df.t),.1,atol=.001):raise ValueError('expected real 0.1s decimation')
    train=df[df.t<6.5].copy().reset_index(drop=True)
    exit_segment=df[(df.t>=6.5)&(df.t<11)].copy().reset_index(drop=True)
    coast=df[df.t>=11].copy().reset_index(drop=True)
    # Fitting the first strong turn, without peeking into either validation window.
    def residuals(p):
        return (rollout(train,p)-train.yaw.to_numpy())
    res=least_squares(residuals,x0=[.024,.24,4],bounds=([.004,.03,-25],[.085,1.5,35]),
      max_nfev=500,loss='soft_l1',f_scale=2.0,xtol=1e-12,ftol=1e-12,gtol=1e-12)
    p=res.x
    out_dir.mkdir(parents=True,exist_ok=True)
    frames=[]; metrics={}
    for name,seg in [('train_turn',train),('holdout_turn_exit',exit_segment),('holdout_quiet',coast)]:
        pred=rollout(seg,p)
        # Static no-lag uses same fitted parameters (fair model complexity comparison).
        static=yaw_target(p[0],seg.sp.to_numpy(),seg.sw.to_numpy(),p[2])/DEG
        zero=np.zeros(len(seg))
        constant=np.full(len(seg),float(seg.yaw.iloc[0]))
        truth=seg.yaw.to_numpy()
        metrics[name]={
          'fitted_dynamic':eval_metrics(truth,pred),
          'same_fit_static':eval_metrics(truth,static),
          'zero_yaw':eval_metrics(truth,zero),
          'hold_first_value':eval_metrics(truth,constant)}
        frames.append(seg.assign(split=name,yaw_pred_deg_s=pred,static_pred_deg_s=static))
    comp=pd.concat(frames,ignore_index=True)
    comp.to_csv(out_dir/'measured_vs_predicted.csv',index=False,float_format='%.6f')
    # Secondary measured signal check: lateral accelerometer sign is opposite
    # to yaw convention. This is NOT a fit for lateral acceleration of SHIFT//LAB.
    q = df.ay.to_numpy() + (df.sp.to_numpy()/3.6)*(df.yaw.to_numpy()*DEG)
    lateral={'ay_observed_range': [float(df.ay.min()),float(df.ay.max())],
       'inertial_approx_rmse_mps2_if_LatAcc_in_mps2':float(np.sqrt(np.mean(q*q))),
       'corr_measured_ay_and_negative_v_yaw':float(np.corrcoef(df.ay,-df.sp/3.6*df.yaw*DEG)[0,1])}
    result={
      'status':'REAL MEASUREMENTS, NOT SYNTHETIC',
      'source':SOURCE,'source_blob_sha':SOURCE_BLOB_SHA,
      'input_rows':len(df),'record_duration_s':float(df.t.iloc[-1]-df.t.iloc[0]),
      'sample_hz':10.,'original_hz':50.,
      'speed_kmh_range':[float(df.sp.min()),float(df.sp.max())],
      'steering_wheel_deg_range':[float(df.sw.min()),float(df.sw.max())],
      'measured_yaw_deg_s_range':[float(df.yaw.min()),float(df.yaw.max())],
      'fitted_surrogate':{
         'equation':'tau dr/dt = c*v*(steering_wheel_angle - steering_zero) - r',
         'effective_yaw_gain_per_m':float(p[0]),
         'effective_time_constant_s':float(p[1]),
         'effective_steering_center_deg':float(p[2]),
         'conditional_equivalent_ratio_if_wheelbase_2_75_and_unity_yaw_gain':float(1/(p[0]*2.75)),
         'identifiability_warning':'Cannot infer physical steering gear ratio or real yaw inertia from this one record; equivalent ratio is illustrative only.'},
      'fit_converged':bool(res.success), 'fit_cost':float(res.cost),
      'split':{'train':'0 to <6.5s','holdout_turn_exit':'6.5 to <11s',
          'holdout_quiet':'11 to 19.9s'},
      'metrics':metrics,
      'lateral_check':lateral,
      'evidence_limits':['Published example CSV contains values rounded to 3 decimals',
        'Only 20 seconds from one driving trace, not cross-vehicle verification',
        'Original logged steering is steering wheel SW_pos_obd, not road wheel angle',
        'Yaw quantized in apparent 1.28 deg/s increments; delay below sample period is uncertain',
        'Unknown axle/wheelbase, steering ratio and car mass; yaw inertia NOT identified',
        'Mean of 4 wheel speeds used for speed, not speedometer; subject to wheel slip',
        '10Hz decimated subset; not all 50Hz samples processed in this environment',
        'No confirmed dataset redistribution license; preserve only derived output in commercial project']}
    (out_dir/'fit_metrics.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    (out_dir/'fitted_reference_coefficients.json').write_text(json.dumps({
      'model':'measured-steering-wheel-to-yaw-rate first-order surrogate',
      'source':SOURCE, 'source_blob_sha':SOURCE_BLOB_SHA,
      'gain_per_m':float(p[0]),'time_constant_s':float(p[1]),
      'steering_zero_deg':float(p[2]),'application':'diagnostic_reference_only',
      'compatible_full_chassis_params':None,
      'reason':'full four-wheel chassis and suspension parameters are not identifiable from this measured fragment'
    },ensure_ascii=False,indent=2),encoding='utf-8')
    fig,axs=plt.subplots(2,1,figsize=(11,6),sharex=True,height_ratios=[2.2,1.0])
    axs[0].plot(comp.t,comp.yaw,label='Measured vehicle yaw (deg/s)',linewidth=2)
    axs[0].plot(comp.t,comp.yaw_pred_deg_s,label='Fitted first-order model',linewidth=1.4)
    axs[0].plot(comp.t,comp.static_pred_deg_s,label='No-lag baseline',linewidth=1,alpha=.75)
    axs[0].axvspan(6.5,11,alpha=.1);axs[0].axvspan(11,19.9,alpha=.05)
    axs[0].axvline(6.5,linestyle=':',linewidth=1);axs[0].axvline(11,linestyle=':',linewidth=1)
    axs[0].set_ylabel('Yaw rate (deg/s)');axs[0].grid(alpha=.2);axs[0].legend(loc='lower right',fontsize=8)
    axs[1].plot(df.t,df.sw,label='Measured steering wheel (deg)')
    axs[1].set_xlabel('Seconds after recording begins');axs[1].set_ylabel('Steering wheel (deg)')
    axs[1].grid(alpha=.2)
    fig.suptitle('ReV-StED actual onboard vehicle sensor sample: fit vs held-out time windows')
    fig.tight_layout();fig.savefig(out_dir/'yaw_fit_real_data.png',dpi=160);plt.close(fig)
    fig,ax=plt.subplots(figsize=(9,4))
    ay_calc=-df.sp.to_numpy()/3.6*df.yaw.to_numpy()*DEG
    ax.plot(df.t,df.ay,label='Measured LatAcc_obd (unit presumed m/s2)')
    ax.plot(df.t,ay_calc,label='-speed * measured yaw rate (approximate)')
    ax.set_xlabel('Time (s)');ax.set_ylabel('Lateral acceleration (m/s2, provisional)');ax.grid(alpha=.2);ax.legend(fontsize=8);fig.tight_layout()
    fig.savefig(out_dir/'lateral_measured_consistency.png',dpi=150);plt.close(fig)
    print(json.dumps({'parameters':result['fitted_surrogate'],
       'train':metrics['train_turn'],'holdout_turn_exit':metrics['holdout_turn_exit'],
       'holdout_quiet':metrics['holdout_quiet'],'lateral':lateral},indent=2))
    return result

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('csv',type=Path)
    parser.add_argument('--output',type=Path,default=Path(__file__).resolve().parents[1]/'results/obd-fit')
    parser.add_argument('--raw',action='store_true',help='Input is full original GitHub OBD_Sample.csv, take 0,5,...,995 rows')
    a=parser.parse_args()
    if a.raw:
        frame=obtain_subset(pd.read_csv(a.csv))
        tmp=a.output/'source_sample_derived.csv'
        tmp.parent.mkdir(parents=True,exist_ok=True)
        frame.to_csv(tmp,index=False)
        a.csv=tmp
    run(a.csv,a.output)
