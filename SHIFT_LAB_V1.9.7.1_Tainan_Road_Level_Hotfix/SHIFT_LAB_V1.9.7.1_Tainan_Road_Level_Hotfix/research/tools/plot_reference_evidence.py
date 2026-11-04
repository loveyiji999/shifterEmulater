#!/usr/bin/env python3
"""Render sourced, derived reference numbers. No imitation real-car curves."""
from pathlib import Path
import json, csv
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
BASE=Path(__file__).resolve().parents[1]

r=json.loads((BASE/'metrics/adma_metrics.json').read_text())
fig,ax=plt.subplots(figsize=(8.8,4.4))
labels=['fit: first 6.5s','unseen: final 3.44s']
raw=[r['train_rmse_raw_deg_s'],r['holdout_rmse_raw_deg_s']]
cor=[r['train_rmse_corrected_deg_s'],r['holdout_rmse_corrected_deg_s']]
x=np.arange(2)
ax.bar(x-.2,raw,width=.37,label='Direct gyro vs heading derivative')
ax.bar(x+.2,cor,width=.37,label='Training-fitted gain/offset')
ax.set_xticks(x,labels);ax.set_ylabel('Angular-rate disagreement RMSE (deg/s)');ax.set_ylim(0,.13)
ax.legend(fontsize=9);ax.set_title('Real THI 100 Hz ADMA / INS measurements — sensor consistency only')
ax.grid(axis='y',alpha=.2);fig.tight_layout()
(BASE.parent/'artifacts/research/figures/adma_sensor_agreement.png').parent.mkdir(parents=True,exist_ok=True)
fig.savefig(BASE.parent/'artifacts/research/figures/adma_sensor_agreement.png',dpi=160);plt.close(fig)

with (BASE/'metrics/civic_observed_bins.csv').open(newline='') as f:rows=list(csv.DictReader(f))
s=np.array([float(x['min_speed_mps'])+2.5 for x in rows]);lo=np.array([float(x['p10_acc_mps2']) for x in rows]);hi=np.array([float(x['p90_acc_mps2']) for x in rows]);mid=np.array([float(x['p50_acc_mps2']) for x in rows])
fig,ax=plt.subplots(figsize=(9,4.6))
ax.fill_between(s,lo,hi,alpha=.2,label='Published segment observed P10–P90')
ax.plot(s,mid,'o-',label='Observed median')
ax.set_xlabel('Speed bin midpoint (m/s)');ax.set_ylabel('Positive acceleration, observed (m/s²)')
ax.set_title('Reported Honda Civic acceleration segments: observational, not a full-throttle envelope')
ax.grid(alpha=.2);ax.legend(fontsize=8);fig.tight_layout();fig.savefig(BASE.parent/'artifacts/research/figures/civic_measured_acceleration_bins.png',dpi=160);plt.close(fig)

p=json.loads((BASE/'metrics/bucknell_p1_reference.json').read_text())
fig,ax=plt.subplots(figsize=(8,4.4))
ref=p['hypothetical_3deg_roadwheel_steer'];ax.plot([x['kmh'] for x in ref],[x['predicted_yaw_deg_s'] for x in ref],'o-')
ax.set_xlabel('Speed (km/h)');ax.set_ylabel('Bicycle-model yaw rate (deg/s)');ax.grid(alpha=.2)
ax.set_title('Bucknell P1 parameter-based THEORY, not measured yaw data')
fig.tight_layout();fig.savefig(BASE.parent/'artifacts/research/figures/p1_theoretical_yaw.png',dpi=160);plt.close(fig)
print('Rendered 3 figures from provenance-tagged derived metrics')
