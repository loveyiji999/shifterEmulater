#!/usr/bin/env python3
"""Summarize prior repository-source analyses; DOES NOT reproduce unavailable raw files."""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
source=ROOT/'metrics'
checks={'adma':'adma_metrics.json','civic':'civic_metrics.json','bucknell_p1':'bucknell_p1_reference.json'}
combined={
 'status':'Derived research summaries only. Raw samples were examined via a live public GitHub connection; raw bytes are not shipped.',
 'dataset_licensing':'Raw redistribution not assumed; read docs/reference/DATA_PROVENANCE.md.',
 'vehicle_physics_unchanged':True,
 'all_measured_fit_metrics_exclude_synthetic_fixtures':True,
 'recompute_original_source': 'python research/tools/verify_public_references.py --download --output research/metrics/recomputed  (on a network-enabled machine)',
}
for key,name in checks.items():
    combined[key]=json.loads((source/name).read_text(encoding='utf-8'))
(source/'combined_reference_summary.json').write_text(json.dumps(combined,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
print('combined verification metadata:',', '.join(checks))
