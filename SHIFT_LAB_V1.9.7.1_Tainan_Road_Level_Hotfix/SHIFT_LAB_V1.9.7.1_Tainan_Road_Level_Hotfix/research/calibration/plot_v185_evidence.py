#!/usr/bin/env python3
"""Charts only derived metrics: does not redistribute private or license-unclear raw data."""
from pathlib import Path
import json,matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
bmw=json.loads((ROOT/'results/bmw_gasoline_fit.json').read_text())
p1=json.loads((ROOT/'results/p1_force_channel_quality.json').read_text())
labels=['Zero-lateral baseline','No-lag v^2 steering','Training-selected lag (0.10s)']
train=[None,bmw['static_baseline']['training_rmse_m_s2'],bmw['selected_on_training']['training_rmse_m_s2']]
hold=[bmw['zero_lateral_holdout_rmse_m_s2'],bmw['static_baseline']['holdout_rmse_m_s2'],bmw['selected_on_training']['holdout_rmse_m_s2']]
fig,ax=plt.subplots(figsize=(8.6,4.4))
x=np.arange(3)
ax.bar(x-.15,[0 if x is None else x for x in train],width=.3,label='Training (0-185s)')
ax.bar(x+.15,hold,width=.3,label='Held out (205-342s)')
for k in range(3):
 if train[k] is not None:ax.text(k-.15,train[k]+.014,f'{train[k]:.3f}',ha='center',fontsize=9)
 ax.text(k+.15,hold[k]+.014,f'{hold[k]:.3f}',ha='center',fontsize=9)
ax.set_xticks(x,labels);ax.set_ylabel('Lateral acceleration RMSE (m/s²)')
ax.set_title('BMW M235i gasoline measured CAN: train-selected complexity does not improve holdout')
ax.legend();ax.set_ylim(0,.87);ax.grid(axis='y',alpha=.18);fig.tight_layout();fig.savefig(ROOT/'results/bmw_holdout_model_comparison.png',dpi=165);plt.close(fig)
fig,ax=plt.subplots(figsize=(8.6,4.2))
sessions=[x['source'][-2:] for x in p1['sessions']]
left=[x['left_fz_N_quantiles_5_50_95'][1] for x in p1['sessions']]
right=[x['right_fz_N_quantiles_5_50_95'][1] for x in p1['sessions']]
i=np.arange(len(sessions));ax.bar(i-.18,left,.36,label='Left front wheel measured median');ax.bar(i+.18,right,.36,label='Right front wheel measured median');ax.axhline(p1['sessions'][0]['minimum_positive_load_each_N'],linestyle='--',label='Per-wheel plausibility threshold')
ax.set_xticks(i,sessions);ax.set_ylabel('MAT channel label Fz median (N)')
ax.set_title('Bucknell P1 measured load channels: paired front loads fail the quality gate')
ax.legend(fontsize=8);ax.grid(axis='y',alpha=.2);fig.tight_layout();fig.savefig(ROOT/'results/p1_force_quality_gate.png',dpi=165);plt.close(fig)
print('Wrote 2 derived-metrics visualizations')
