(function(root,factory){
  const api=factory(root);
  if(root) root.GuitarDiaryStorage=api;
  if(typeof module==='object'&&module.exports) module.exports=api;
})(typeof window!=='undefined'?window:typeof globalThis!=='undefined'?globalThis:null,function(root){
  const i18n=root?.GuitarDiaryI18n;
  const baseKeys=['rifflog-entries-v1','rifflog-visits-v1','rifflog-profile-v1','rifflog-insights-v1','rifflog-favorites-v1','rifflog-terms-v1','rifflog-word-test-stats-v1','rifflog-songs-v1','rifflog-song-font-size-v1','rifflog-language-v1'];
  const memory=new Map();
  let localStorageRef=null, deviceStorage=null, backend='localStorage', lastError='';
  try {
    const candidate=root?.localStorage;
    if(candidate&&typeof candidate.getItem==='function'&&typeof candidate.setItem==='function'&&typeof candidate.removeItem==='function') localStorageRef=candidate;
  } catch(error) { lastError='localStorage недоступен'; }
  try {
    const candidate=root?.Telegram?.WebApp?.DeviceStorage;
    if(candidate&&typeof candidate.getItem==='function'&&typeof candidate.setItem==='function'&&typeof candidate.removeItem==='function') deviceStorage=candidate;
  } catch(error) { lastError='DeviceStorage недоступен'; }
  function readLocal(key){
    try { const value=localStorageRef?.getItem(key); if(value!==null&&value!==undefined) return value; } catch(error) { lastError='Ошибка чтения localStorage'; }
    return memory.has(key)?memory.get(key):null;
  }
  function writeLocal(key,value){
    const stringValue=String(value); memory.set(key,stringValue);
    try { localStorageRef?.setItem(key,stringValue); } catch(error) { lastError='Ошибка записи localStorage'; }
  }
  function removeLocal(key){
    memory.delete(key);
    try { localStorageRef?.removeItem(key); } catch(error) { lastError='Ошибка удаления localStorage'; }
  }
  function callDevice(method,key,value){
    return new Promise((resolve,reject)=>{
      let settled=false;
      const finish=(error,result)=>{ if(settled) return; settled=true; error?reject(error):resolve(result===undefined?null:result); };
      const timer=setTimeout(()=>finish(new Error('DeviceStorage timeout')),900);
      try {
        const callback=(error,result)=>{ clearTimeout(timer); finish(error,result); };
        const result=value===undefined?deviceStorage[method](key,callback):deviceStorage[method](key,value,callback);
        if(result instanceof Promise) result.then(value=>{ clearTimeout(timer); finish(null,value); },error=>{ clearTimeout(timer); finish(error); });
      } catch(error) { clearTimeout(timer); finish(error); }
    });
  }
  const scopedKeys=()=>baseKeys.map(key=>i18n?.getStorageKey?i18n.getStorageKey(key):key);
  async function prepareDeviceStorage(){
    if(!deviceStorage) return;
    try {
      const keys=scopedKeys(), values=await Promise.all(keys.map(key=>callDevice('getItem',key)));
      const uploads=keys.map((key,index)=>values[index]===null&&readLocal(key)!==null?callDevice('setItem',key,readLocal(key)):Promise.resolve());
      await Promise.all(uploads);
      values.forEach((value,index)=>{ if(value!==null&&value!==undefined) writeLocal(keys[index],value); });
      backend='DeviceStorage';
    } catch(error) {
      lastError='DeviceStorage недоступен, используется localStorage';
      backend='localStorage';
    }
  }
  const readyPromise=prepareDeviceStorage();
  const storage={
    getItem(key){ return readLocal(key); },
    setItem(key,value){ writeLocal(key,value); if(deviceStorage&&backend==='DeviceStorage') callDevice('setItem',key,String(value)).catch(()=>{ lastError='Не удалось синхронизировать DeviceStorage'; }); },
    removeItem(key){ removeLocal(key); if(deviceStorage&&backend==='DeviceStorage') callDevice('removeItem',key).catch(()=>{ lastError='Не удалось синхронизировать DeviceStorage'; }); }
  };
  function getLegacyKeys(){
    return baseKeys.filter(key=>{ try{ return localStorageRef?.getItem(key)!==null; }catch(error){ return false; } });
  }
  return {
    storage,
    ready(callback){ return readyPromise.then(()=>callback?callback():undefined); },
    getBackend(){ return backend; },
    getLastError(){ return lastError; },
    getScope(){ return i18n?.getStorageScope?.()||'unknown'; },
    getTelegramUserId(){ return i18n?.getTelegramUserId?.()||null; },
    getLegacyKeys,
    getBaseKeys(){ return baseKeys.slice(); }
  };
});
