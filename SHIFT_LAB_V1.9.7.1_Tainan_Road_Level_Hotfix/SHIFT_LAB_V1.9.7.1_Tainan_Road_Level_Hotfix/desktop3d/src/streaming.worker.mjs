import {StreamingGeometry} from './streaming-geometry.mjs';
const geometry=new StreamingGeometry();
self.onmessage=event=>{const request=event.data;try{
  const {message,transfer}=geometry.build(request);self.postMessage(message,transfer);
}catch(error){self.postMessage({id:request.id,epoch:request.epoch,revision:request.revision,error:error.message});}};
