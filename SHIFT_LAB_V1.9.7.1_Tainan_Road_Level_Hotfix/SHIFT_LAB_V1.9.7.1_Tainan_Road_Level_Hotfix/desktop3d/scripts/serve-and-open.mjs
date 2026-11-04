// Starts the existing Vite server and opens exactly one browser game page.
// No native game application is installed; the browser is the client.
import {spawn} from 'node:child_process';
import http from 'node:http';
const url='http://127.0.0.1:5173/';
const command=process.platform==='win32'?'npm.cmd':'npm';
const server=spawn(command,['run','dev'],{cwd:new URL('../',import.meta.url),
  stdio:'inherit',shell:process.platform==='win32'});
let ready=false;let tries=0;
const timer=setInterval(()=>{
  if(ready||server.exitCode!==null){clearInterval(timer);return;}
  if(++tries>120){clearInterval(timer);console.error('本機 Vite 啟動逾時，請檢查輸出訊息');return;}
  const req=http.get(url,res=>{res.resume();if(res.statusCode>=200&&res.statusCode<500&&!ready){
    ready=true;clearInterval(timer);
    const cmd=process.platform==='win32'?['cmd',['/c','start','',url]]:
      process.platform==='darwin'?['open',[url]]:['xdg-open',[url]];
    try{const browser=spawn(cmd[0],cmd[1],{stdio:'ignore',detached:true});browser.unref();}
    catch{console.log('請手動開啟',url);}
  }});req.on('error',()=>{});req.setTimeout(1000,()=>req.destroy());
},250);
server.once('exit',code=>{clearInterval(timer);process.exitCode=code||0});
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{server.kill(sig)});
