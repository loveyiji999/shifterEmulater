#!/usr/bin/env python3
"""Reproducible empirical *lateral/yaw* benchmark for Bucknell P1.

Uses measured road wheel angle and measured speed as exogenous inputs; this
is NOT a full longitudinal/vertical virtual-car validation. Read README.

Examples:
    python research/calibration/fit_p1_real_runs.py --source-dir /path/to/p1_mat --out research/calibration/results

Only original Bucknell .mat files accepted; no synthetic data substitute.
"""
from __future__ import annotations
import argparse
import csv
import hashlib
import json
import math
from pathlib import Path
import numpy as np
from scipy.io import loadmat
from scipy.ndimage import gaussian_filter1d
from scipy.optimize import least_squares

try:
    from numba import njit
except ImportError:
    def njit(fn):
        return fn

M=1724.0
IZ=1300.0
A=1.35
B=1.10
L=A+B
CF=75000.0
CR=135000.0
G=9.81
BASELINE=np.array([1.0,1.0,1.0])

SOURCE_DATA={
    'craig_2018-07-19_aa': {'sha256':'058e7b9fa5a3b4fadf1c53e8102cf5bfab02310e67841ccbc3d89b2e66f8b246','file_id':'13qPsFBZNxTDEerLMi4Nvin99GFaHVuZA','description':'straight line both directions'},
    'craig_2018-07-19_ab': {'sha256':'6bbf38bcc10ec3d644da192deb5f6beed710e7f3ce9dd215882f98d567cff1c5','file_id':'13vyUJg81hSoyXy64LlMjua5b-vRXdySX','description':'left-hand ramp steer, about 10 m/s'},
    'craig_2018-07-19_ac': {'sha256':'0b6d49bad94180b8f3069410cebe033580da0b7a9cccafd8b6a920ff47cd83b4','file_id':'140ZQTollQzml8vgOf9ILIvp5dkBJ5tXi','description':'right-hand ramp steer, about 10 m/s'},
    'craig_2018-07-19_ad': {'sha256':'49c3434f5c99f603f25f17331ad2de471c3e727c3e0735bb74104c525149c56c','file_id':'1410LpN49BwGf5eOzPSy0GboUcFCa9tSW','description':'counterclockwise loop about 10 m/s'},
    'craig_2018-07-19_ai': {'sha256':'1a9c7058c0b121b5ac75313847f83cd954e7cfb01c0a2a3d2920cfd062912a5a','file_id':'14OrYZJFVZfU0z8ezJ9XfXrzY6cntvJAZ','description':'5-degree steer steps at varied speeds'},
    'craig_2018-07-19_ak': {'sha256':'0f845618162acf0036a5c9e3ffe466aaddf014d421778473ead5c1b9dd47ecbe','file_id':'14TYHCBtFXyMi9q_DjfGyQ6OCfbJREEL5','description':'100-ft circle, increasing speed'},
}
# Strict fixed-time protocol declared BEFORE fitting. No holdout tuning.
WINDOWS=[
    ('left_training','craig_2018-07-19_ab',40.,93.,'train'),
    ('left_release','craig_2018-07-19_ab',93.,116.,'holdout'),
    ('right_ramp','craig_2018-07-19_ac',30.,126.,'holdout'),
    ('step_steer','craig_2018-07-19_ai',42.,75.,'holdout'),
    ('increasing_speed_circle','craig_2018-07-19_ak',48.,116.,'holdout'),
    ('test_track_loop','craig_2018-07-19_ad',28.,152.,'holdout'),
    ('low_speed_straight','craig_2018-07-19_aa',38.,61.,'holdout'),
]

@njit
def lateral_equations(vy,r,v,delta,cf,cr,mu,rear_b=B):
    wheelbase=A+rear_b
    nf=M*G*rear_b/wheelbase;nr=M*G*A/wheelbase
    speed=max(1.0,abs(v))
    af=delta-np.arctan2(vy+A*r,speed)
    ar=-np.arctan2(vy-rear_b*r,speed)
    fyf=mu*nf*np.tanh(cf*af/(mu*nf))
    fyr=mu*nr*np.tanh(cr*ar/(mu*nr))
    fb=fyf*np.cos(delta)
    ay=(fb+fyr)/M
    return ay-v*r,(A*fb-rear_b*fyr)/IZ,ay

@njit
def integrate_measured_inputs(t,v,delta,vy0,r0,coefficients,rear_b=B):
    cf=CF*coefficients[0];cr=CR*coefficients[1];mu=coefficients[2]
    n=len(t);y=np.empty(n);r=np.empty(n);ay=np.empty(n)
    y[0]=vy0;r[0]=r0
    for i in range(n-1):
        h=t[i+1]-t[i]
        fa,fb,_=lateral_equations(y[i],r[i],v[i],delta[i],cf,cr,mu,rear_b)
        fm,fn,_=lateral_equations(y[i]+h*fa/2.,r[i]+h*fb/2.,(v[i]+v[i+1])/2.,(delta[i]+delta[i+1])/2.,cf,cr,mu,rear_b)
        y[i+1]=min(10.,max(-10.,y[i]+h*fm))
        r[i+1]=min(5.,max(-5.,r[i]+h*fn))
        _,_,ay[i]=lateral_equations(y[i],r[i],v[i],delta[i],cf,cr,mu,rear_b)
    _,_,ay[-1]=lateral_equations(y[-1],r[-1],v[-1],delta[-1],cf,cr,mu,rear_b)
    return y,r,ay

def require_raw(name: str, directory: Path) -> Path:
    p=directory/(name+'.mat.bin')
    if not p.is_file():p=directory/(name+'.mat')
    if not p.is_file():
        ident=SOURCE_DATA[name]['file_id']
        raise FileNotFoundError(f'Missing real Bucknell MATLAB file {name}.mat; official https://drive.google.com/file/d/{ident}/view')
    return p

def load_real(name: str, directory: Path):
    p=require_raw(name,directory)
    raw=p.read_bytes()
    if not raw.startswith(b'MATLAB'):
        raise ValueError(f'{p} is not a MATLAB v5 MAT file')
    digest=hashlib.sha256(raw).hexdigest()
    if digest!=SOURCE_DATA[name]['sha256']:
        raise ValueError(f'{name}: official source SHA256 changed, refuse unreviewed raw content')
    mat=loadmat(p,struct_as_record=False,squeeze_me=True,variable_names=['t','y','info','DataDescription'])
    t=np.asarray(mat['t'],dtype=float).reshape(-1)
    y=np.asarray(mat['y'],dtype=float)
    if t.ndim!=1 or y.shape!=(len(t),145):
        raise ValueError(f'{name}: unexpected time or signal array shapes {t.shape}, {y.shape}')
    if not (np.allclose(np.diff(t),0.002,rtol=0,atol=1e-6) and np.all(np.isfinite(t))):
        raise ValueError(f'{name}: time samples must be regular 500Hz measured samples')
    desc=mat['DataDescription']
    if not (len(desc)==15 and 'INS' in str(desc[1].name) and 'PostProc' in str(desc[11].name)):
        raise ValueError(f'{name}: data label schema mismatch; do not silently reinterpret columns')
    # Per recording confirmation: time vector and data are in the source file,
    # not reconstructed from graphs or simulation. These are known P1 labels.
    manifest={'official_google_drive_id': SOURCE_DATA[name]['file_id'],
              'original_filename':p.name,'sha256':hashlib.sha256(raw).hexdigest(),
              'samples':len(t),'sample_rate_hz':500,
              'duration_s':float(t[-1]-t[0]),
              'description':str(mat['info'].description).strip(),
              'signal_columns_0_based':{
                'INS_yaw_rate_rad_s':12,
                'INS_lateral_acceleration_m_s2':15,
                'SSest_vx_m_s':70,'SSest_vy_m_s':73,
                'SSest_ay_cg_m_s2':75,'SSest_sideslip_rad':76,
                'PostProc_ackermann_steer_rad':100,
              }}
    return {'t':t,'y':y},manifest

def downsample(record, start, end):
    t=record['t'][::10]
    y=record['y'][::10]
    mask=(t>=start)&(t<=end)
    t=t[mask];y=y[mask]
    if len(t)<80:raise ValueError('Insufficient validated real samples')
    sigma=3.0 # 50Hz*0.06sec, applied to measured v,r,ay,vy; steer sigma=1
    out={
       'time_s':t,
       'v':gaussian_filter1d(y[:,70],sigma),
       'delta':gaussian_filter1d(y[:,100],1),
       'yaw':gaussian_filter1d(y[:,12],sigma),
       'ay':gaussian_filter1d(y[:,75],sigma),
       'vy':gaussian_filter1d(y[:,73],sigma),
       'beta':gaussian_filter1d(y[:,76],sigma),
    }
    if not all(np.isfinite(x).all() for x in out.values()):
        raise ValueError('Non-finite real P1 measurements')
    return out

def response(measured,params,rear_b=B):
    p=np.asarray(params,dtype=float)
    return integrate_measured_inputs(measured['time_s'],measured['v'],measured['delta'],
                                     measured['vy'][0],measured['yaw'][0],p,rear_b)

def metric(measured, response3):
    _,r,ay=response3
    difr=(r-measured['yaw'])*180/math.pi
    difay=ay-measured['ay']
    return {'yaw_rmse_deg_s':float(np.sqrt(np.mean(difr**2))),
            'yaw_mae_deg_s':float(np.mean(np.abs(difr))),
            'yaw_bias_deg_s':float(np.mean(difr)),
            'lateral_accel_rmse_m_s2':float(np.sqrt(np.mean(difay**2)))}

def fit(training,rear_b=B):
    def residual(values):
        q=np.array([values[0],values[0],values[1]],dtype=float)
        _,r,ay=response(training,q,rear_b)
        return np.concatenate(((r-training['yaw'])*180/math.pi/2.5,
                               (ay-training['ay'])/.95))
    result=least_squares(residual,np.array([1.,1.]),
               bounds=([.5,.6],[2.5,1.6]),
               max_nfev=100,xtol=1e-9,gtol=1e-9,ftol=1e-9)
    if not result.success:raise RuntimeError('Fitting optimizer did not converge')
    stiffness,mu=map(float,result.x)
    return np.array([stiffness,stiffness,mu]),result

def plot_results(output:Path,observations:dict,coeffs,rear_b=B):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    keys=['left_training','right_ramp','step_steer','increasing_speed_circle','test_track_loop']
    fig,axes=plt.subplots(len(keys),2,figsize=(14,13))
    for idx,key in enumerate(keys):
        m=observations[key]
        _,base,bay=response(m,BASELINE,rear_b)
        _,new,nay=response(m,coeffs,rear_b)
        tm=m['time_s']
        for axis,true,bb,nn,label in [
            (axes[idx,0],m['yaw']*180/math.pi,base*180/math.pi,new*180/math.pi,'Yaw rate (deg/s)'),
            (axes[idx,1],m['ay'],bay,nay,'Lateral accel CG (m/s2)')]:
            axis.plot(tm,true,label='Bucknell P1 measured',linewidth=1.5)
            axis.plot(tm,bb,label='Published chassis + nominal saturation',linewidth=1)
            axis.plot(tm,nn,label='Train-fitted tire shape',linewidth=1)
            axis.set_ylabel(label);axis.grid(alpha=.3)
            if idx==0:axis.legend(loc='upper left',fontsize=8)
        axes[idx,0].set_title(key+' ('+('TRAIN' if key=='left_training' else 'HOLDOUT')+')',fontsize=10)
    axes[-1,0].set_xlabel('Time within original P1 test (s)')
    axes[-1,1].set_xlabel('Time within original P1 test (s)')
    fig.suptitle('Measured P1 responses vs an isolated 2-DOF lateral/yaw surrogate; not SHIFT//LAB full-car simulation',fontsize=12)
    fig.tight_layout(rect=(0,0,1,.98))
    fig.savefig(output/'p1_measured_yaw_and_ay.png',dpi=145)
    plt.close(fig)

def run(source_dir:Path,output:Path,plots=True,rear_b=B):
    if rear_b not in (1.10,1.15):
        raise ValueError('Use one of the two conflicting official CG-rear references: 1.10 or 1.15 m')
    output.mkdir(parents=True,exist_ok=True)
    needed={k for _,k,_,_,_ in WINDOWS}
    # For reproducibility, load exact raw datasets and fail if any is absent.
    sources={}
    raw={}
    for key in sorted(needed):
        raw[key],sources[key]=load_real(key,source_dir)
    observations={name:downsample(raw[file],start,end) for name,file,start,end,kind in WINDOWS}
    fitted,opt=fit(observations['left_training'],rear_b)
    metrics={}
    for name,src,start,end,kind in WINDOWS:
        m=observations[name]
        pb=metric(m,response(m,BASELINE,rear_b))
        pf=metric(m,response(m,fitted,rear_b))
        metrics[name]={'source':src,'split':kind,'start_time_s':start,'end_time_s':end,
                       'sample_hz':50,'rows':len(m['time_s']),
                       'speed_min_m_s':float(m['v'].min()),'speed_max_m_s':float(m['v'].max()),
                       'published_chassis_nominal_tanh':pb,'fitted_tanh':pf,
                       'yaw_rmse_improvement_percent':float(100*(pb['yaw_rmse_deg_s']-pf['yaw_rmse_deg_s'])/pb['yaw_rmse_deg_s'])}
    output.joinpath('p1_source_manifest.json').write_text(json.dumps(sources,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    summary={'disclaimer':'Empirical TWO-DOF surrogate fitted to measured actual front steering + longitudinal speed; NOT a full-car SHIFT//LAB physical coefficient set.',
       'research_vehicle':'Bucknell University P1, electric drive-by-wire experimental vehicle',
       'source_page':'https://www.projects.bucknell.edu/Beal_Automotive/',
       'geometry_provenance_warning':'Institution website b=1.10 m; historical P1 MATLAB parameter script b=1.15 m. Results are highly sensitive; axle stiffness not independently identified.',
       'published_reference':{'mass_kg':M,'yaw_inertia_kg_m2':IZ,'cg_to_front_m':A,'cg_to_rear_m':rear_b,'front_axle_cornering_stiffness_N_rad':CF,'rear_axle_cornering_stiffness_N_rad':CR},
       'nominal_model':'coupled lateral velocity + yaw rate with Fy = mu*N*tanh(Calpha/(mu*N)); mu nominal 1; measured speed and actual Ackermann angle replayed',
       'selected_fit_model':'front/rear stiffness share ONE scale; common effective saturated adhesion; left ramp 40-93s only',
       'fit':{'stiffness_multiplier':float(fitted[0]),'effective_mu_in_surrogate':float(fitted[2]),
         'front_effective_axle_stiffness_N_rad':float(CF*fitted[0]),
         'rear_effective_axle_stiffness_N_rad':float(CR*fitted[1]),
         'optimizer_cost':float(opt.cost),'optimizer_nfev':int(opt.nfev),
         'bounds':{'stiffness':[.5,2.5],'mu':[.6,1.6]}},
       'metrics':metrics,
       'known_limitations':['not independent road slope/camber input','road-wheel sensor/INS offsets possible','effective tanh mu not measured tire rig coefficient','test each P1 run initialized at first observed yaw and lateral velocity','roll/pitch/load-transfer and drivetrain excluded from surrogate','P1 electric dual rear motors; not a manual-transmission production vehicle','published chassis stiffness values are earlier research estimates, not a fixed tire production spec','drive files public but explicit reuse license not established; source matrices not redistributed']}
    output.joinpath('p1_fit_results.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    with (output/'p1_train_holdout_metrics.csv').open('w',newline='',encoding='utf-8') as f:
        w=csv.writer(f)
        w.writerow(['test','split','source','time_start_s','time_end_s','rows','min_speed_m_s','max_speed_m_s','baseline_yaw_rmse_deg_s','fit_yaw_rmse_deg_s','baseline_ay_rmse_m_s2','fit_ay_rmse_m_s2','yaw_rmse_improvement_pct'])
        for name in metrics:
            q=metrics[name]
            w.writerow([name,q['split'],q['source'],q['start_time_s'],q['end_time_s'],q['rows'],q['speed_min_m_s'],q['speed_max_m_s'],q['published_chassis_nominal_tanh']['yaw_rmse_deg_s'],q['fitted_tanh']['yaw_rmse_deg_s'],q['published_chassis_nominal_tanh']['lateral_accel_rmse_m_s2'],q['fitted_tanh']['lateral_accel_rmse_m_s2'],q['yaw_rmse_improvement_percent']])
    if plots:plot_results(output,observations,fitted,rear_b)
    return summary

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir',type=Path,required=True)
    parser.add_argument('--out',type=Path,default=Path(__file__).resolve().parent/'results')
    parser.add_argument('--no-plots',action='store_true')
    parser.add_argument('--rear-b-m',type=float,choices=[1.10,1.15],default=1.10,help='Official website 1.10 m vs older MATLAB script 1.15 m')
    q=parser.parse_args();s=run(q.source_dir,q.out,plots=not q.no_plots,rear_b=q.rear_b_m)
    print('FIT',json.dumps(s['fit'],indent=2))
    for name,m in s['metrics'].items():
        print(name,m['split'],'baseYaw=',round(m['published_chassis_nominal_tanh']['yaw_rmse_deg_s'],3), 'fitYaw=',round(m['fitted_tanh']['yaw_rmse_deg_s'],3), 'baseAy=',round(m['published_chassis_nominal_tanh']['lateral_accel_rmse_m_s2'],3), 'fitAy=',round(m['fitted_tanh']['lateral_accel_rmse_m_s2'],3))
