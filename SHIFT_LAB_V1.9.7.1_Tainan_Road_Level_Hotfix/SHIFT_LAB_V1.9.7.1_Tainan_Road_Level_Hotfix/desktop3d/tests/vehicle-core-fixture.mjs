import {readFileSync} from 'node:fs';
import vm from 'node:vm';
// Read the real preset resolver in both current calibration modes.
const source=readFileSync(new URL('../public/physics.html',import.meta.url),'utf8');
const start=source.indexOf('function vehicleParams(id){');
const context=vm.createContext({});
vm.runInContext(source.slice(source.indexOf('const P = {'),source.indexOf('const REAL_OBD_BENCHMARK='))+'\n'+
  source.match(/const REFERENCE_FITS=([^\n]+);/)[0]+'\nconst referenceCalibration={enabled:false};\n'+
  source.slice(start,source.indexOf('\nfunction ',start+1))+
  '\nglobalThis.resolve=(id,enabled)=>{referenceCalibration.enabled=enabled;return vehicleParams(id);};',context);
export const vehicleParams=(id,enabled=false)=>JSON.parse(JSON.stringify(context.resolve(id,enabled)));
