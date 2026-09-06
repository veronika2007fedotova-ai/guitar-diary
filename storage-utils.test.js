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
      setItem(key,value,callback){ if(deviceValues.failWrites) throw new Error('device write failed'); deviceValues.set(key,String(value)); callback?.(null); },
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
  assert.equal(first.storage.getScope(),'user:1001');
  assert.equal(second.storage.getScope(),'user:2002');
  assert.equal(first.storage.storage.getItem(firstKey),null);
  assert.equal(second.storage.storage.getItem(secondKey),null);
  assert.equal(Array.from(first.storage.getLegacyKeys()).join(','),'rifflog-profile-v1');
  first.storage.storage.setItem(firstKey,'first-profile');
  assert.equal(first.storage.storage.getItem(firstKey),'first-profile');
  assert.equal(second.storage.storage.getItem(secondKey),null);
  assert.equal(shared.getItem('rifflog-profile-v1'),'legacy-profile');
});

test('hydrates the scoped local mirror from Telegram DeviceStorage',async()=>{
  const local=new MemoryStorage(), device=new Map([['guitarDiary:user:3003:rifflog-profile-v1','device-profile']]);
  const context=createProfileContext(local,'3003',device);
  await context.storage.ready();
  assert.equal(context.storage.getBackend(),'DeviceStorage');
  assert.equal(context.storage.storage.getItem('guitarDiary:user:3003:rifflog-profile-v1'),'device-profile');
});

test('migrates the previous Telegram namespace without deleting its source',async()=>{
  const oldKey='guitarDiary:telegram-4004:rifflog-profile-v1';
  const newKey='guitarDiary:user:4004:rifflog-profile-v1';
  const local=new MemoryStorage({[oldKey]:'previous-profile'}), context=createProfileContext(local,'4004');
  await context.storage.ready();
  assert.equal(context.storage.storage.getItem(newKey),'previous-profile');
  assert.equal(local.getItem(oldKey),'previous-profile');
  assert.ok(context.storage.getMigrationInfo().migratedKeys.includes('rifflog-profile-v1'));
  const second=createProfileContext(local,'4004');
  await second.storage.ready();
  assert.equal(second.storage.storage.getItem(newKey),'previous-profile');
  assert.equal(local.getItem(oldKey),'previous-profile');
});

test('migrates local data to DeviceStorage only after verification',async()=>{
  const key='guitarDiary:user:5005:rifflog-profile-v1', local=new MemoryStorage({[key]:'local-profile'}), device=new Map();
  const context=createProfileContext(local,'5005',device);
  await context.storage.ready();
  assert.equal(context.storage.getBackend(),'DeviceStorage');
  assert.equal(device.get(key),'local-profile');
});

test('migration failure preserves old data and never overwrites it with empty data',async()=>{
  const oldKey='guitarDiary:telegram-6006:rifflog-profile-v1', newKey='guitarDiary:user:6006:rifflog-profile-v1';
  const local=new MemoryStorage({[oldKey]:'old-profile'}), device=new Map(); device.failWrites=true;
  const context=createProfileContext(local,'6006',device);
  await context.storage.ready();
  assert.equal(local.getItem(oldKey),'old-profile');
  assert.equal(context.storage.storage.getItem(newKey),'old-profile');
  assert.equal(context.storage.getBackend(),'localStorage');
  const profileKey=context.i18n.getStorageKey('rifflog-profile-v1'), entriesKey=context.i18n.getStorageKey('rifflog-entries-v1');
  context.storage.storage.setItem(profileKey,'profile-value');
  context.storage.storage.setItem(entriesKey,'{}');
  const lastGood=JSON.parse(context.storage.storage.getItem(context.storage.getLastGoodKey()));
  assert.equal(lastGood['rifflog-profile-v1'],'profile-value');
  assert.equal(lastGood['rifflog-entries-v1'],undefined);
});
