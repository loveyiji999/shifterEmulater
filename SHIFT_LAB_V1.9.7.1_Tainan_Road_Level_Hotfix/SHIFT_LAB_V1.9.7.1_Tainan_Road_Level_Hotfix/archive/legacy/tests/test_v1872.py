"""v1.8.7.2 force lifecycle: contract and mock-dynamics regression."""
import unittest, subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
D=ROOT/'desktop3d'
class ForceLifecycleQA(unittest.TestCase):
 def test_real_chassis_bridge_mock_dynamics(self):
  p=subprocess.run(['node',str(D/'tests/validate-force-lifecycle.mjs')],
    text=True,capture_output=True)
  self.assertEqual(p.returncode,0,p.stdout+'\n'+p.stderr)
  self.assertIn('PASS real chassis bridge',p.stdout)
 def test_diagnostic_force_metrics_and_static_gate(self):
  js=(D/'src/main.mjs').read_text()
  scenarios=(D/'src/scenarios.mjs').read_text()
  self.assertIn('maxExternalForceN',js)
  self.assertIn('maxExternalTorqueNm',js)
  self.assertIn('forceResetCount',js)
  self.assertIn("if(id==='settle'&&!result.pass)",js)
  self.assertIn('逐微步重置外力與力矩',scenarios)
if __name__=='__main__':unittest.main()
