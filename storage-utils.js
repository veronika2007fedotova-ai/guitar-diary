(function(root,factory){
  const api=factory(root);
  if(root) root.GuitarDiaryStorage=api;
  if(typeof module==='object'&&module.exports) module.exports=api;
})(typeof window!=='undefined'?window:typeof globalThis!=='undefined'?globalThis:null,function(root){
  const i18n=root?.GuitarDiaryI18n;
  const STORAGE_SCHEMA_VERSION=3;
  const SCHEMA_VERSION_KEY='schemaVersion';
  const LAST_GOOD_KEY='backup:lastGood';
  const LEGACY_UNASSIGNED_KEY='guitarDiary:legacy-unassigned:meta';
  const LEGACY_RECOVERY_KEY='storage:legacyRecovery';
  const BROWSER_SCOPE_KEY=i18n?.BROWSER_SCOPE_KEY||'rifflog-browser-scope-v1';
  const baseKeys=['rifflog-entries-v1','rifflog-visits-v1','rifflog-profile-v1','rifflog-insights-v1','rifflog-favorites-v1','rifflog-terms-v1','rifflog-word-test-stats-v1','rifflog-songs-v1','rifflog-song-font-size-v1','rifflog-language-v1'];
  const memory=new Map(), fallbackValues=new Map();
  let localStorageRef=null, deviceStorage=null, backend='localStorage', lastError='', migrationError='', migrationSteps=[];
  let legacyKeys=[], previousScopedKeys=[], migratedKeys=[], existingData=false, unassignedLegacyKeys=[], ownerMatchedLegacyKeys=[], foreignLegacyKeys=[];
  const unassignedLegacyValues=new Map();
  const userId=()=>i18n?.getTelegramUserId?.()||null;
  const telegramContext=()=>Boolean(i18n?.isTelegramContext?.());
  const storageBlocked=()=>telegramContext()&&!userId();
  try {
    const candidate=root?.localStorage;
    if(candidate&&typeof candidate.getItem==='function'&&typeof candidate.setItem==='function'&&typeof candidate.removeItem==='function') localStorageRef=candidate;
  } catch(error) { lastError='localStorage недоступен'; }
  try {
    const candidate=storageBlocked()?null:root?.Telegram?.WebApp?.DeviceStorage;
    if(candidate&&typeof candidate.getItem==='function'&&typeof candidate.setItem==='function'&&typeof candidate.removeItem==='function') deviceStorage=candidate;
  } catch(error) { lastError='DeviceStorage недоступен'; }
  if(!userId()||storageBlocked()) deviceStorage=null;
  const currentKey=key=>i18n?.getStorageKey?i18n.getStorageKey(key):key;
  const previousKey=key=>i18n?.getPreviousStorageKey?i18n.getPreviousStorageKey(key):key;
  let schemaKey='', lastGoodKey='', legacyRecoveryKey='';
  function readLocalRaw(key){
    try { const value=localStorageRef?.getItem(key); if(value!==null&&value!==undefined) return value; } catch(error) { lastError='Ошибка чтения localStorage'; }
    return memory.has(key)?memory.get(key):null;
  }
  function writeLocalRaw(key,value){
    const stringValue=String(value); memory.set(key,stringValue);
    try { localStorageRef?.setItem(key,stringValue); } catch(error) { lastError='Ошибка записи localStorage'; }
  }
  function removeLocalRaw(key){
    memory.delete(key);
    try { localStorageRef?.removeItem(key); } catch(error) { lastError='Ошибка удаления localStorage'; }
  }
  function configureStorageScope(){
    if(!userId()&&!telegramContext()){
      let scope=readLocalRaw(BROWSER_SCOPE_KEY);
      if(!/^browser-[a-z0-9_-]+$/i.test(String(scope||''))){
        const random=root?.crypto?.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
        scope=`browser-${String(random).replace(/[^a-z0-9_-]/gi,'').slice(0,48)}`;
        writeLocalRaw(BROWSER_SCOPE_KEY,scope);
      }
      i18n?.setBrowserStorageScope?.(scope);
    }
    schemaKey=currentKey(SCHEMA_VERSION_KEY); lastGoodKey=currentKey(LAST_GOOD_KEY); legacyRecoveryKey=currentKey(LEGACY_RECOVERY_KEY);
  }
  configureStorageScope();
  function parseValue(value){
    if(typeof value!=='string') return value;
    try { return JSON.parse(value); } catch(error) { return value; }
  }
  function meaningful(value){
    if(value===null||value===undefined||value==='') return false;
    const parsed=parseValue(value);
    if(Array.isArray(parsed)) return parsed.length>0;
    if(parsed&&typeof parsed==='object') return Object.keys(parsed).length>0;
    return true;
  }
  function hasDataValue(value){ return value!==null&&value!==undefined&&value!==''; }
  function ownerFromValue(value){
    const parsed=parseValue(value); if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)) return null;
    const candidates=[parsed.ownerTelegramUserId,parsed.telegramUserId,parsed.ownerId,parsed.userId,parsed.profile?.ownerTelegramUserId,parsed.profile?.telegramUserId];
    return candidates.find(candidate=>/^\d+$/.test(String(candidate||'')))||null;
  }
  function callDevice(method,key,value){
    return new Promise((resolve,reject)=>{
      let settled=false;
      const finish=(error,result)=>{ if(settled) return; settled=true; error?reject(error):resolve(result===undefined?null:result); };
      const timer=setTimeout(()=>finish(new Error('DeviceStorage timeout')),900);
      try {
        const callback=(error,result)=>{ clearTimeout(timer); finish(error,result); };
        const result=value===undefined?deviceStorage[method](key,callback):deviceStorage[method](key,value,callback);
        if(result instanceof Promise) result.then(resultValue=>{ clearTimeout(timer); finish(null,resultValue); },error=>{ clearTimeout(timer); finish(error); });
      } catch(error) { clearTimeout(timer); finish(error); }
    });
  }
  async function readDevice(key){ return callDevice('getItem',key); }
  async function writeDeviceVerified(key,value){
    await callDevice('setItem',key,String(value));
    const actual=await readDevice(key);
    if(String(actual)!==String(value)) throw new Error('DeviceStorage verification failed');
  }
  function collectLegacyKeys(values){ return baseKeys.filter(key=>hasDataValue(values.get(key))); }
  function markLegacyUnassigned(keys){
    if(!keys.length) return;
    const previous=parseValue(readLocalRaw(LEGACY_UNASSIGNED_KEY));
    const all=[...new Set([...(Array.isArray(previous?.keys)?previous.keys:[]),...keys])];
    writeLocalRaw(LEGACY_UNASSIGNED_KEY,JSON.stringify({schemaVersion:1,keys:all,detectedAt:previous?.detectedAt||new Date().toISOString()}));
  }
  async function loadOrMigrateUserData(currentUserId=userId()){
    legacyKeys=[]; previousScopedKeys=[]; migratedKeys=[]; existingData=false; unassignedLegacyKeys=[]; ownerMatchedLegacyKeys=[]; foreignLegacyKeys=[]; unassignedLegacyValues.clear();
    if(storageBlocked()){
      backend='blocked';
      migrationError='Telegram user ID недоступен: пользовательские данные заблокированы';
      lastError=migrationError;
      return {userId:null,schemaVersion:0,existingData:false,legacyKeys:[],previousScopedKeys:[],migratedKeys:[],migrationError,backend};
    }
    const values=new Map(), deviceValues=new Map(), oldValues=new Map(), oldDeviceValues=new Map(), legacyLocalValues=new Map(), legacyDeviceValues=new Map();
    for(const key of baseKeys){
      values.set(key,readLocalRaw(currentKey(key)));
      const oldKey=previousKey(key); oldValues.set(key,oldKey===currentKey(key)?null:readLocalRaw(oldKey));
      legacyLocalValues.set(key,readLocalRaw(key));
    }
    if(deviceStorage){
      try {
        const deviceReads=await Promise.all(baseKeys.map(key=>readDevice(currentKey(key))));
        const oldDeviceReads=await Promise.all(baseKeys.map(key=>previousKey(key)===currentKey(key)?Promise.resolve(null):readDevice(previousKey(key))));
        const legacyDeviceReads=await Promise.all(baseKeys.map(key=>readDevice(key)));
        baseKeys.forEach((key,index)=>{ deviceValues.set(key,deviceReads[index]); oldDeviceValues.set(key,oldDeviceReads[index]); legacyDeviceValues.set(key,legacyDeviceReads[index]); });
        deviceValues.set(SCHEMA_VERSION_KEY,await readDevice(schemaKey));
        deviceValues.set(LAST_GOOD_KEY,await readDevice(lastGoodKey));
      } catch(error) {
        deviceStorage=null;
        migrationError='DeviceStorage чтение не прошло проверку';
        lastError=migrationError;
      }
    }
    legacyKeys=collectLegacyKeys(legacyLocalValues);
    const deviceLegacyKeys=collectLegacyKeys(legacyDeviceValues);
    const allLegacyKeys=[...new Set([...legacyKeys,...deviceLegacyKeys])];
    if(allLegacyKeys.length){
      const owned=Boolean(currentUserId)&&allLegacyKeys.every(key=>{
        const localOwner=ownerFromValue(legacyLocalValues.get(key)), deviceOwner=ownerFromValue(legacyDeviceValues.get(key));
        return String(localOwner||deviceOwner||'')===String(currentUserId||'');
      });
      const hasAnyOwner=allLegacyKeys.some(key=>Boolean(ownerFromValue(legacyLocalValues.get(key))||ownerFromValue(legacyDeviceValues.get(key))));
      if(!owned){
        if(hasAnyOwner){
          foreignLegacyKeys=allLegacyKeys.filter(key=>{
            const owner=ownerFromValue(legacyDeviceValues.get(key))||ownerFromValue(legacyLocalValues.get(key));
            return Boolean(owner)&&String(owner)!==String(currentUserId||'');
          });
          markLegacyUnassigned(allLegacyKeys);
        } else {
          unassignedLegacyKeys=allLegacyKeys.slice();
          allLegacyKeys.forEach(key=>{
            const value=hasDataValue(legacyDeviceValues.get(key))?legacyDeviceValues.get(key):legacyLocalValues.get(key);
            if(hasDataValue(value)) unassignedLegacyValues.set(key,value);
          });
          markLegacyUnassigned(allLegacyKeys);
          writeLocalRaw(legacyRecoveryKey,JSON.stringify({schemaVersion:1,status:'pending',keys:unassignedLegacyKeys,detectedAt:new Date().toISOString()}));
        }
      } else ownerMatchedLegacyKeys=allLegacyKeys.slice();
    }
    previousScopedKeys=baseKeys.filter(key=>hasDataValue(oldValues.get(key))||hasDataValue(oldDeviceValues.get(key)));
    const localSchema=Number(readLocalRaw(schemaKey))||0;
    const deviceSchema=Number(deviceValues.get(SCHEMA_VERSION_KEY))||0;
    const selected=new Map();
    baseKeys.forEach(key=>{
      const localValue=values.get(key), deviceValue=deviceValues.get(key), oldLocal=oldValues.get(key), oldDevice=oldDeviceValues.get(key);
      let value=null, source='none';
      if(localSchema>=STORAGE_SCHEMA_VERSION&&hasDataValue(localValue)){ value=localValue; source='current-local'; }
      else if(deviceSchema>=STORAGE_SCHEMA_VERSION&&hasDataValue(deviceValue)){ value=deviceValue; source='current-device'; }
      else if(hasDataValue(localValue)){ value=localValue; source='current-local'; }
      else if(hasDataValue(deviceValue)){ value=deviceValue; source='current-device'; }
      else if(hasDataValue(oldDevice)){ value=oldDevice; source='previous-device'; }
      else if(hasDataValue(oldLocal)){ value=oldLocal; source='previous-local'; }
      if(value!==null){ selected.set(key,{value,source}); existingData=true; if(source.startsWith('previous')||source==='owned-legacy') migratedKeys.push(key); }
    });
    const lastGoodLocal=parseValue(readLocalRaw(lastGoodKey)), lastGoodDevice=deviceStorage?parseValue(deviceValues.get(LAST_GOOD_KEY)):null;
    const lastGood=lastGoodDevice&&typeof lastGoodDevice==='object'?lastGoodDevice:lastGoodLocal;
    if(!selected.has('rifflog-profile-v1')&&lastGood&&typeof lastGood==='object'&&!Array.isArray(lastGood)){
      Object.entries(lastGood).forEach(([key,value])=>{ if(baseKeys.includes(key)&&hasDataValue(value)){ selected.set(key,{value,source:'last-good'}); existingData=true; } });
    }
    try {
      for(const key of baseKeys){
        const item=selected.get(key); if(!item) continue;
        const target=currentKey(key);
        if(readLocalRaw(target)!==String(item.value)) writeLocalRaw(target,item.value);
        if(readLocalRaw(target)!==String(item.value)) throw new Error('localStorage verification failed');
      }
      const hasDevice=deviceStorage!==null;
      if(hasDevice){
        for(const key of baseKeys){ const item=selected.get(key); if(item) await writeDeviceVerified(currentKey(key),item.value); }
        await writeDeviceVerified(schemaKey,String(STORAGE_SCHEMA_VERSION));
        backend='DeviceStorage';
      } else backend='localStorage';
      writeLocalRaw(schemaKey,String(STORAGE_SCHEMA_VERSION));
      migrationSteps.push(`schema:${localSchema}->${STORAGE_SCHEMA_VERSION}`);
    } catch(error) {
      backend='localStorage';
      migrationError='Миграция сохранена в localStorage не полностью';
      lastError=migrationError;
      selected.forEach((item,key)=>fallbackValues.set(currentKey(key),String(item.value)));
      try { writeLocalRaw(schemaKey,String(Math.min(localSchema||1,STORAGE_SCHEMA_VERSION))); } catch(ignore) {}
    }
    if(!deviceStorage&&deviceValues.size) migrationError=migrationError||'DeviceStorage недоступен';
    return {userId:currentUserId,schemaVersion:STORAGE_SCHEMA_VERSION,existingData,legacyKeys:legacyKeys.slice(),previousScopedKeys:previousScopedKeys.slice(),migratedKeys:[...new Set(migratedKeys)],migrationError,backend};
  }
  function isPlaceholderProfile(value){
    const profile=parseValue(value); if(!profile||typeof profile!=='object'||Array.isArray(profile)) return false;
    const name=String(profile.name||'').trim(), startDate=String(profile.startDate||'');
    const defaultNames=new Set(['Максим','Alex','S']);
    return defaultNames.has(name)&&/^\d{4}-\d{2}-\d{2}$/.test(startDate)&&(!profile.telegramUsername||!profile.telegramUserId);
  }
  function shouldRecoverOverCurrent(key,currentValue,replaceFreshProfile=false){
    if(!hasDataValue(currentValue)) return true;
    if(key==='rifflog-profile-v1') return replaceFreshProfile||isPlaceholderProfile(currentValue);
    const parsed=parseValue(currentValue);
    return (Array.isArray(parsed)&&parsed.length===0)||(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)&&Object.keys(parsed).length===0);
  }
  async function recoverUnassignedLegacy(){
    if(!unassignedLegacyKeys.length) return {ok:false,keys:[],reason:'none'};
    const recovered=[];
    try {
      for(const key of unassignedLegacyKeys){
        const value=unassignedLegacyValues.get(key); if(!hasDataValue(value)) continue;
        const target=currentKey(key), current=readLocalRaw(target);
        const startupOnlyKeys=new Set(['rifflog-visits-v1','rifflog-language-v1','rifflog-song-font-size-v1']);
        const replaceFreshProfile=key==='rifflog-profile-v1'&&baseKeys.filter(candidate=>candidate!==key&&!startupOnlyKeys.has(candidate)).every(candidate=>!hasDataValue(readLocalRaw(currentKey(candidate))));
        if(!shouldRecoverOverCurrent(key,current,replaceFreshProfile)) continue;
        writeLocalRaw(target,value);
        if(readLocalRaw(target)!==String(value)) throw new Error('Legacy recovery verification failed');
        if(deviceStorage&&backend==='DeviceStorage') await writeDeviceVerified(target,value);
        updateLastGood(target,value);
        recovered.push(key);
      }
      if(recovered.length){
        writeLocalRaw(schemaKey,String(STORAGE_SCHEMA_VERSION));
        if(deviceStorage&&backend==='DeviceStorage') await writeDeviceVerified(schemaKey,String(STORAGE_SCHEMA_VERSION));
        existingData=true; migratedKeys.push(...recovered);
      }
      writeLocalRaw(legacyRecoveryKey,JSON.stringify({schemaVersion:1,status:'recovered',keys:recovered,detectedAt:new Date().toISOString()}));
      unassignedLegacyKeys=[]; unassignedLegacyValues.clear();
      return {ok:true,keys:[...recovered]};
    } catch(error) {
      migrationError='Восстановление старых данных не прошло проверку'; lastError=migrationError;
      return {ok:false,keys:[...recovered],reason:migrationError};
    }
  }
  function readItem(key){
    if(storageBlocked()) return null;
    const local=readLocalRaw(key); return local!==null&&local!==undefined?local:(fallbackValues.has(key)?fallbackValues.get(key):null);
  }
  function updateLastGood(key,value){
    const base=baseKeys.find(candidate=>currentKey(candidate)===key); if(!base||!meaningful(value)) return;
    const current=parseValue(readLocalRaw(lastGoodKey));
    const snapshot=current&&typeof current==='object'&&!Array.isArray(current)?current:{};
    snapshot[base]=String(value);
    writeLocalRaw(lastGoodKey,JSON.stringify(snapshot));
    if(deviceStorage&&backend==='DeviceStorage') callDevice('setItem',lastGoodKey,JSON.stringify(snapshot)).catch(()=>{ lastError='Не удалось синхронизировать lastGood'; });
  }
  const storage={
    getItem(key){ return readItem(key); },
    setItem(key,value){
      if(storageBlocked()){ lastError='Запись заблокирована: Telegram user ID недоступен'; return; }
      writeLocalRaw(key,value); fallbackValues.delete(key); updateLastGood(key,value);
      if(deviceStorage&&backend==='DeviceStorage') callDevice('setItem',key,String(value)).catch(()=>{ lastError='Не удалось синхронизировать DeviceStorage'; });
    },
    removeItem(key){
      if(storageBlocked()){ lastError='Удаление заблокировано: Telegram user ID недоступен'; return; }
      removeLocalRaw(key); fallbackValues.delete(key);
      if(deviceStorage&&backend==='DeviceStorage') callDevice('removeItem',key).catch(()=>{ lastError='Не удалось синхронизировать DeviceStorage'; });
    }
  };
  const readyPromise=loadOrMigrateUserData();
  function getLegacyKeys(){ return legacyKeys.slice(); }
  function getPreviousScopedKeys(){ return previousScopedKeys.slice(); }
  function getMigrationInfo(){ return {schemaVersion:Number(readItem(schemaKey))||0,migratedKeys:[...new Set(migratedKeys)],migrationError,existingData,legacyKeys:getLegacyKeys(),previousScopedKeys:getPreviousScopedKeys(),unassignedLegacyKeys:unassignedLegacyKeys.slice(),ownerMatchedLegacyKeys:ownerMatchedLegacyKeys.slice(),foreignLegacyKeys:foreignLegacyKeys.slice()}; }
  function maskIdentifier(value){ const normalized=String(value||''); return normalized?`••••${normalized.slice(-4)}`:'none'; }
  function byteSize(value){ try{ return new TextEncoder().encode(String(value??'')).length; }catch(error){ return String(value??'').length; } }
  function valueSummary(key,value){
    const parsed=parseValue(value), shape=Array.isArray(parsed)?'array':parsed&&typeof parsed==='object'?'object':typeof parsed;
    const owner=ownerFromValue(value), modified=parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?(parsed.lastModified||parsed.updatedAt||parsed.createdAt||parsed.exportDate||parsed.detectedAt||parsed.meta?.lastModified||null):null;
    return {key,size:byteSize(value),shape,fields:parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?Object.keys(parsed).slice(0,12):[],ownerId:maskIdentifier(owner),schemaVersion:parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?(parsed.schemaVersion??null):null,lastModified:modified?String(modified):null};
  }
  function storageKeys(storageRef){
    if(!storageRef||typeof storageRef.length!=='number'||typeof storageRef.key!=='function') return [];
    const keys=[]; for(let index=0;index<storageRef.length;index++){ try{ const key=storageRef.key(index); if(key) keys.push(key); }catch(error){ lastError='Ошибка перечисления storage'; } }
    return keys;
  }
  function diagnosticCandidates(){
    const keys=[...baseKeys,SCHEMA_VERSION_KEY,LAST_GOOD_KEY,LEGACY_UNASSIGNED_KEY,LEGACY_RECOVERY_KEY,BROWSER_SCOPE_KEY];
    return [...new Set([...keys,...baseKeys.map(key=>currentKey(key)),...baseKeys.map(key=>previousKey(key)),schemaKey,lastGoodKey,legacyRecoveryKey].filter(Boolean))];
  }
  function auditStorage(storageRef,knownKeys=[]){
    if(!storageRef||typeof storageRef.getItem!=='function') return {available:false,keys:[]};
    const keys=[...new Set([...storageKeys(storageRef),...knownKeys])], blocks=[];
    keys.forEach(key=>{ try{ const value=storageRef.getItem(key); if(value!==null&&value!==undefined) blocks.push(valueSummary(key,value)); }catch(error){ lastError='Ошибка аудита storage'; } });
    return {available:true,keys:blocks};
  }
  function maskedNamespace(key){
    const match=String(key).match(/^(guitarDiary:(?:user|telegram)-?)([^:]+)(?=:|$)/);
    if(match) return `${match[1]}••••${String(match[2]).slice(-4)}`;
    const browser=String(key).match(/^(guitarDiary:browser-)[^:]+/); if(browser) return `${browser[1]}••••`;
    if(String(key).startsWith('guitarDiary:legacy-unassigned')) return 'guitarDiary:legacy-unassigned';
    return null;
  }
  function readDeviceForAudit(api,key){
    return new Promise(resolve=>{
      let settled=false; const finish=value=>{ if(settled) return; settled=true; clearTimeout(timer); resolve(value===undefined||value===null?null:value); };
      const timer=setTimeout(()=>finish(null),900);
      try{
        const result=api.getItem(key,(error,value)=>finish(error?null:value));
        if(result instanceof Promise) result.then(finish,()=>finish(null));
      }catch(error){ finish(null); }
    });
  }
  async function auditDeviceStorage(){
    let api=null; try{ api=root?.Telegram?.WebApp?.DeviceStorage||null; }catch(error){ return {available:false,enumerable:false,keys:[],error:'access failed'}; }
    if(!api||typeof api.getItem!=='function') return {available:false,enumerable:false,keys:[]};
    const keys=diagnosticCandidates(), blocks=[];
    await Promise.all(keys.map(async key=>{ const value=await readDeviceForAudit(api,key); if(value!==null) blocks.push(valueSummary(key,value)); }));
    return {available:true,enumerable:false,keys:blocks};
  }
  async function auditIndexedDb(){
    const indexedDb=root?.indexedDB;
    if(!indexedDb) return {available:false,databases:[]};
    if(typeof indexedDb.databases!=='function') return {available:true,enumerable:false,databases:[]};
    try{
      const databases=await indexedDb.databases();
      const result=await Promise.all((databases||[]).map(database=>new Promise(resolve=>{
        let settled=false; const finish=value=>{ if(settled) return; settled=true; resolve(value); };
        const timer=setTimeout(()=>finish({name:database.name||'unknown',version:database.version||0,stores:[],readable:false}),1200);
        try{
          const request=indexedDb.open(database.name);
          request.onsuccess=()=>{ clearTimeout(timer); const connection=request.result; const stores=[...connection.objectStoreNames]; connection.close(); finish({name:database.name||'unknown',version:database.version||0,stores,readable:true}); };
          request.onerror=()=>{ clearTimeout(timer); finish({name:database.name||'unknown',version:database.version||0,stores:[],readable:false}); };
          request.onupgradeneeded=()=>{ try{ request.transaction?.abort(); }catch(error){} };
        }catch(error){ clearTimeout(timer); finish({name:database.name||'unknown',version:database.version||0,stores:[],readable:false}); }
      })));
      return {available:true,enumerable:true,databases:result};
    }catch(error){ return {available:true,enumerable:false,databases:[],error:'enumeration failed'}; }
  }
  async function auditCacheStorage(){
    const cacheStorage=root?.caches;
    if(!cacheStorage||typeof cacheStorage.keys!=='function') return {available:false,caches:[]};
    try{
      const names=await cacheStorage.keys(), caches=[];
      for(const name of names){
        let urls=[], assets=[];
        try{
          const cache=await cacheStorage.open(name);
          if(typeof cache.keys==='function'){
            const requests=await cache.keys(); urls=requests.map(request=>request.url);
            for(const request of requests){
              const path=new URL(request.url).pathname, file=path.split('/').pop()||path;
              if(!/^(index\.html|app\.js|styles\.css)$/.test(file)||typeof cache.match!=='function') continue;
              try{
                const response=await cache.match(request), text=await response.clone().text(), markers=[];
                if(file==='index.html'&&text.includes('bottom-nav')) markers.push('bottom-nav');
                if(file==='styles.css'&&text.includes('.bottom-nav')) markers.push('bottom-nav-css');
                if(file==='app.js'){
                  const build=text.match(/BUILD_VERSION=['\"]([^'\"]+)/); if(build) markers.push(`build:${build[1]}`);
                  if(text.includes('renderCalendar')) markers.push('calendar-js');
                }
                assets.push({file,size:byteSize(text),markers});
              }catch(error){ assets.push({file,size:null,markers:['unreadable']}); }
            }
          }
        }catch(error){ urls=[]; assets=[]; }
        caches.push({name,urls,assets});
      }
      return {available:true,caches};
    }catch(error){ return {available:true,caches:[],error:'enumeration failed'}; }
  }
  async function getDiagnostics(){
    const local=auditStorage(localStorageRef,diagnosticCandidates()), session=auditStorage((()=>{ try{return root?.sessionStorage||null;}catch(error){return null;} })(),diagnosticCandidates());
    const device=await auditDeviceStorage(), indexedDb=await auditIndexedDb(), cacheStorage=await auditCacheStorage();
    const namespaceSet=new Set(); [...local.keys,...session.keys,...device.keys].forEach(block=>{ const namespace=maskedNamespace(block.key); if(namespace) namespaceSet.add(namespace); });
    return {blocked:storageBlocked(),backend,scope:i18n?.getStorageScope?.()||'unknown',userIdMasked:maskIdentifier(userId()),schemaVersion:Number(readItem(schemaKey))||0,localStorage:local,sessionStorage:session,indexedDB:indexedDb,deviceStorage:device,cacheStorage,namespaces:[...namespaceSet].sort(),legacyKeys:getLegacyKeys(),previousScopedKeys:getPreviousScopedKeys(),ownerMatchedLegacyKeys:ownerMatchedLegacyKeys.slice(),foreignLegacyKeys:foreignLegacyKeys.slice(),lastGoodKeys:[lastGoodKey].filter(Boolean)};
  }
  return {
    STORAGE_SCHEMA_VERSION,
    storage,
    ready(callback){ return readyPromise.then(()=>callback?callback():undefined); },
    loadOrMigrateUserData,
    getBackend(){ return backend; },
    getLastError(){ return lastError; },
    getScope(){ return i18n?.getStorageScope?.()||'unknown'; },
    getTelegramUserId(){ return userId(); },
    getSchemaVersion(){ return Number(readItem(schemaKey))||0; },
    hasExistingData(){ return existingData; },
    getLegacyKeys,
    getPreviousScopedKeys,
    getMigrationInfo,
    hasUnassignedLegacyData(){ return unassignedLegacyKeys.length>0; },
    getLegacyRecoveryInfo(){ return {pending:unassignedLegacyKeys.length>0,keys:unassignedLegacyKeys.slice()}; },
    recoverUnassignedLegacy,
    getBaseKeys(){ return baseKeys.slice(); },
    getLastGoodKey(){ return lastGoodKey; },
    getLegacyRecoveryKey(){ return legacyRecoveryKey; },
    getDiagnostics
  };
});
