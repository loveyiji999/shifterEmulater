import {build} from 'esbuild';
import {writeFile} from 'node:fs/promises';
import {riverbedFixture} from './riverbed-fixture.mjs';
import {lakeFixture} from './lake-fixture.mjs';

const previewName=process.argv.find(arg=>arg.startsWith('--preview-name='))?.slice(15)||'p2-river-routing';
if(!/^p2-[a-z-]+$/.test(previewName))throw Error('Invalid preview name');
const lake=process.argv.includes('--lake'),fixture=(lake?lakeFixture:riverbedFixture)('ROAD-38274CD4'),proposal=fixture.proposal;
const ground=lake?fixture.meshes.slice().sort((a,b)=>a.tx-b.tx||a.tz-b.tz):proposal.ground;
const encode=(values,Type)=>Buffer.from(new Type(values).buffer).toString('base64');
const buffers=meshes=>meshes.map(m=>({kind:m.kind,tx:m.tx,tz:m.tz,vertices:encode(m.vertices,Float32Array),indices:encode(m.indices,Uint32Array),normals:m.normals?encode(m.normals,Float32Array):null}));
const data={kind:lake?'lake':'riverbed',seed:fixture.seed,status:proposal.status,issues:proposal.issues,summary:proposal.summary,
  before:buffers(fixture.meshes.slice().sort((a,b)=>a.tx-b.tx||a.tz-b.tz)),ground:buffers(ground),water:buffers(proposal.water),bridge:buffers(fixture.bridgeMeshes)};
const result=await build({entryPoints:[new URL('./riverbed-preview.mjs',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')],bundle:true,format:'iife',write:false,minify:true});
const script=result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script'),json=JSON.stringify(data).replace(/</g,'\\u003c');
const html=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>${lake?'P2 封閉湖面候選預覽':'P2 河床施工候選預覽'}</title>
<style>body{margin:0;overflow:hidden;font-family:system-ui;background:#a2c0cb}aside{position:absolute;top:14px;left:14px;max-width:650px;background:#102032e8;color:#e8f0f5;padding:16px;border-radius:8px;line-height:1.6}h1{font-size:18px;margin:0 0 8px}p{font-size:12px;margin:6px 0}button{padding:8px 12px;margin-right:8px;cursor:pointer}canvas{display:block}</style>
<aside><h1>${lake?'P2 封閉湖面候選預覽':'P2 河床施工候選預覽'} · 尚未接入遊戲</h1><p id="status"></p><button id="before">原地形</button><button id="after">${lake?'封閉湖面':'河床候選'}</button><p>${lake?'地形保持原狀；藍色：封閉湖面，不作輪胎承載面。':'褐色：挖方區；藍色：裁切水面，不作輪胎承載面。'}拖曳旋轉、滾輪縮放。</p><p>${lake?'這是靜態湖面候選，水體接觸、材質與遊戲串流整合仍待完成；河網另行開發。':'這是局部施工幾何，出口、水理、材質重烘焙與遊戲串流整合仍待完成。'}</p></aside>
<script id="riverbed-data" type="application/json">${json}</script><script>${script}</script></html>`;
await writeFile(new URL('../../artifacts/tests/'+previewName+'-preview-2026-11-02.html',import.meta.url),html);
console.log('PASS self-contained offline riverbed preview generated: '+JSON.stringify({status:proposal.status,issues:proposal.issues,...proposal.summary,bytes:Buffer.byteLength(html)}));
