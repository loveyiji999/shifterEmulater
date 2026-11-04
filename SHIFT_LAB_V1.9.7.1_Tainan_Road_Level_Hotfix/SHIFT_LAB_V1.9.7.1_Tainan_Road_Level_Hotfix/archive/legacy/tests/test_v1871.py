"""v1.8.7.1 suspension and freedom-of-driving regression contracts."""
import unittest, subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
SRC=ROOT/'desktop3d/src'
class HotfixContracts(unittest.TestCase):
 def test_ray_hit_property_is_fixed(self):
  ch=(SRC/'chassis.mjs').read_text()
  self.assertIn('rayContactDistance(hit,maxDistance)',ch)
  self.assertNotIn('const distance=hit.toi',ch)
  p=subprocess.run(['node',str(ROOT/'desktop3d/tests/validate-ray-contact.mjs')],capture_output=True,text=True)
  self.assertEqual(p.returncode,0,p.stderr)
 def test_free_road_has_no_test_barrier(self):
  obstacles=(SRC/'obstacles.mjs').read_text()
  main=(SRC/'main.mjs').read_text()
  self.assertNotIn('this.makeBarrier();this.makeRamp();',obstacles)
  self.assertIn('obstacles.configure(id)',main)
  self.assertIn('this.dispose();',obstacles)
 def test_focus_assisted_driving_controls(self):
  main=(SRC/'main.mjs').read_text()
  page=(ROOT/'desktop3d/index.html').read_text()
  for v in ['drive-now','drive-mode','input-status']:
   self.assertIn(f'id="{v}"',page)
  self.assertIn('canvas.focus({preventScroll:true})',main)
  self.assertIn('updateAutoDrive();',main)
 def test_wheel_qa_catches_invalid_loads(self):
  main=(SRC/'main.mjs').read_text()
  self.assertIn('invalidWheelLoads=bridge.invalidWheelLoads',main)
  self.assertIn('rayHits=bridge.wheelCastHits',main)
if __name__=='__main__':unittest.main(verbosity=2)
