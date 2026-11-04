import {parentPort} from 'node:worker_threads';
globalThis.self={postMessage:(message,transfer)=>parentPort.postMessage(message,transfer)};
await import('../src/streaming.worker.mjs');
parentPort.on('message',data=>self.onmessage({data}));
