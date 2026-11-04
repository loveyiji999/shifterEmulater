// Small DOM-only mode controller. Does not import Three.js or Rapier, so the
// game/menu transition can be tested in Chromium without a WASM renderer.
export function createGameModes(doc,callbacks={}){
  const overlay=doc.getElementById('panel-overlay');
  const pages={menu:doc.getElementById('menu-panel'),settings:doc.getElementById('settings-panel')};
  let mode='drive';
  function open(next){
    if(next!=='drive'&&!(next in pages))throw Error('不支援的介面 '+next);
    const previous=mode;
    mode=next;
    overlay.hidden=next==='drive';
    for(const [key,panel] of Object.entries(pages))panel.hidden=key!==next;
    doc.getElementById('dashboard').hidden=next!=='drive';
    if(next!==previous)callbacks.onModeChange?.(next,previous);
    return mode;
  }
  return {open,get mode(){return mode;},toggleMenu(){return open(mode==='drive'?'menu':'drive');}};
}
