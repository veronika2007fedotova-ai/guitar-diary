const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const i18nSource=fs.readFileSync('i18n.js','utf8');
const storageSource=fs.readFileSync('storage-utils.js','utf8');

class MemoryStorage{
  constructor(initial={}){ this.values=new Map(Object.entries(initial)); }
  getItem(key){ return this.values.has(key)?this.values.get(key):null; }
  setItem(key,value){ this.values.set(key,String(value)); }
  removeItem(key){ this.values.delete(key); }
}

function createProfileContext(storage,userId,deviceValues){
  const window={
    localStorage:storage,
    navigator:{language:'en-US'},
    crypto:{randomUUID:()=>`test-${userId}`},
    Telegram:{WebApp:{initDataUnsafe:{user:{id:userId}},...(deviceValues?{DeviceStorage:{
      getItem(key,callback){ callback(null,deviceValues.has(key)?deviceValues.get(key):null); },
      setItem(key,value,callback){ deviceValues.set(key,String(value)); callback?.(null); },
      removeItem(key,callback){ deviceValues.delete(key); callback?.(null); }
    }}:{})}}
  };
  window.window=window;
  const context={window,localStorage:storage,navigator:window.navigator,crypto:window.crypto,setTimeout,clearTimeout,console};
  vm.createContext(context);
  vm.runInContext(i18nSource,context);
  vm.runInContext(storageSource,context);
  return {i18n:window.GuitarDiaryI18n,storage:window.GuitarDiaryStorage};
}

test('Telegram profiles use isolated storage scopes and do not read legacy keys',async()=>{
  const shared=new MemoryStorage({'rifflog-profile-v1':'legacy-profile'});
  const first=createProfileContext(shared,'1001'), second=createProfileContext(shared,'2002');
  await first.storage.ready();
  await second.storage.ready();
  const firstKey=first.i18n.getStorageKey('rifflog-profile-v1'), secondKey=second.i18n.getStorageKey('rifflog-profile-v1');
  assert.notEqual(firstKey,secondKey);
  assert.equal(first.storage.getScope(),'telegram-1001');
  assert.equal(second.storage.getScope(),'telegram-2002');
  assert.equal(first.storage.storage.getItem(firstKey),null);
  assert.equal(second.storage.storage.getItem(secondKey),null);
  assert.equal(Array.from(first.storage.getLegacyKeys()).join(','),'rifflog-profile-v1');
  first.storage.storage.setItem(firstKey,'first-profile');
  assert.equal(first.storage.storage.getItem(firstKey),'first-profile');
  assert.equal(second.storage.storage.getItem(secondKey),null);
  assert.equal(shared.getItem('rifflog-profile-v1'),'legacy-profile');
});

test('hydrates the scoped local mirror from Telegram DeviceStorage',async()=>{
  const local=new MemoryStorage(), device=new Map([['guitarDiary:telegram-3003:rifflog-profile-v1','device-profile']]);
  const context=createProfileContext(local,'3003',device);
  await context.storage.ready();
  assert.equal(context.storage.getBackend(),'DeviceStorage');
  assert.equal(context.storage.storage.getItem('guitarDiary:telegram-3003:rifflog-profile-v1'),'device-profile');
});
