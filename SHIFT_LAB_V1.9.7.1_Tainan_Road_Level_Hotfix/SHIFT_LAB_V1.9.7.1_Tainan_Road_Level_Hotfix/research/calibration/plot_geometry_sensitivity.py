#!/usr/bin/env python3
"""Visualize identifiability of P1 axle cornering stiffness to cited CG geometry.

Reads existing real-test fit outputs; does not refit or synthesize test data.
"""
from pathlib import Path
import json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT=Path(__file__).resolve().parent
site=json.loads((ROOT/'results/p1_fit_results.json').read_text())
script=json.loads((ROOT/'geometry_b115/p1_fit_results.json').read_text())
if site['published_reference']['cg_to_rear_m']!=1.10 or script['published_reference']['cg_to_rear_m']!=1.15:
    raise ValueError('Geometry input provenance has changed; audit first')
fig,ax=plt.subplots(1,2,figsize=(13,4.6))
labels=['Institution webpage\nb=1.10 m','Linked historical script\nb=1.15 m']
data=[site,script]
cs=[d['fit']['stiffness_multiplier'] for d in data]
ms=[d['fit']['effective_mu_in_surrogate'] for d in data]
x=np.arange(len(labels))
ax[0].bar(x,cs,width=.52)
ax[0].set_xticks(x,labels)
ax[0].set_ylim(0,1.2)
ax[0].set_ylabel('Common front/rear cornering stiffness multiplier')
for i,v in enumerate(cs):ax[0].text(i,v+.03,f'{v:.4f}',ha='center')
ax[0].set_title('Physical parameter is NOT uniquely identified')
tests=['left_training','left_release','right_ramp','step_steer','increasing_speed_circle','test_track_loop','low_speed_straight']
short=['left train','left release','right ramp','speed step','circle','track oval','straight']
for idx,d in enumerate(data):
  ys=[d['metrics'][k]['fitted_tanh']['yaw_rmse_deg_s'] for k in tests]
  ax[1].plot(np.arange(len(tests)),ys,'o-',linewidth=1.5,label=f'b={d["published_reference"]["cg_to_rear_m"]:.2f}m')
ax[1].set_xticks(np.arange(len(tests)),short,rotation=35,ha='right')
ax[1].set_ylabel('Independent test yaw RMSE (deg/s)')
ax[1].set_title('Similar predictions despite different inferred tire stiffness')
ax[1].legend(); ax[1].grid(alpha=.25)
fig.suptitle('Bucknell P1 real-data geometry sensitivity (published source discrepancy)',fontsize=12)
fig.tight_layout()
fig.savefig(ROOT/'results/p1_geometry_sensitivity.png',dpi=155)
plt.close(fig)
sumry={'primary_webpage_rear_b_m':1.10,'historical_script_rear_b_m':1.15,
'published_script_sha256':'da94d8ae54d6b73cc6d58864f72e92972317d82fd79642f8f83b8a849799c760',
'cases':[{ 'rear_b_m':d['published_reference']['cg_to_rear_m'],
'cornering_stiffness_common_multiplier':d['fit']['stiffness_multiplier'],
'effective_mu_tanh':d['fit']['effective_mu_in_surrogate'],
'front_cornering_stiffness_N_rad':d['fit']['front_effective_axle_stiffness_N_rad'],
'rear_cornering_stiffness_N_rad':d['fit']['rear_effective_axle_stiffness_N_rad'],
'independent_test_right_rmse_deg_s':d['metrics']['right_ramp']['fitted_tanh']['yaw_rmse_deg_s'],
'independent_test_track_rmse_deg_s':d['metrics']['test_track_loop']['fitted_tanh']['yaw_rmse_deg_s']
} for d in data],
'conclusion':'5-cm CG-rear prior change alters tire stiffness fit strongly, so fitted physical coefficients cannot be transferred to SHIFT LAB without independent geometry and tire calibration.'}
(ROOT/'results/p1_geometry_sensitivity.json').write_text(json.dumps(sumry,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
print(json.dumps(sumry,indent=2))
