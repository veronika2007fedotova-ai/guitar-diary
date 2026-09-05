const test=require('node:test');
const assert=require('node:assert/strict');
const backup=require('./backup-utils.js');

function sampleData(){
  return {
    profile:{id:'profile_1',name:'Иван 🎸',startDate:'2026-09-01',weeklyGoal:180,telegramUsername:'guitarist'},
    entries:{'2026-09-02':{training:'Аккорды',assignment:'Am — F 🎵',minutes:35,progress:80,teacherSession:true}},
    insights:{'2026-09-02':'Русский insight / English & symbols <> " 🙂'},
    favorites:[{id:'favorite_1',profileId:'profile_1',title:'☆ Аппликатуры',content:'Am — F / C&G'}],
    terms:[{id:'term_1',profileId:'profile_1',word:'arpeggio',meaning:'перебор струн',attempts:1,correctCount:1,incorrectCount:0}],
    songs:[{id:'song_1',profileId:'profile_1',title:'Песня 🎸',artist:'Автор',chords:'Am\nF',lyrics:'Русский текст\nEnglish text'}],
    language:'ru',
    testStats:{tests:1,answers:2,correct:2,incorrect:0,days:{}},
    visits:['2026-09-02'],
    songFontSize:120
  };
}

class MemoryStorage{
  constructor(initial={}){ this.values=new Map(Object.entries(initial)); }
  getItem(key){ return this.values.has(key)?this.values.get(key):null; }
  setItem(key,value){ this.values.set(key,String(value)); }
  removeItem(key){ this.values.delete(key); }
}

test('создаёт и читает резервную копию без потери Unicode и структуры',()=>{
  const data=sampleData(), createdAt=new Date('2026-09-06T10:20:30.000Z');
  const result=backup.createBackup(data,createdAt);
  assert.deepEqual(result,{app:'guitar-diary',backupVersion:1,createdAt:'2026-09-06T10:20:30.000Z',data});
  assert.deepEqual(backup.parseBackupText(backup.serializeBackup(result)),result);
  assert.equal(backup.getFileName(createdAt),'guitar-diary-backup-2026-09-06.json');
});

test('принимает пустые коллекции',()=>{
  const data=sampleData();
  data.entries={}; data.insights={}; data.favorites=[]; data.terms=[]; data.songs=[]; data.testStats=null; data.visits=[];
  assert.deepEqual(backup.parseBackupText(JSON.stringify(backup.createBackup(data))).data,data);
});

test('поддерживает существующий формат RiffLog v8',()=>{
  const data=sampleData();
  const legacy={app:'RiffLog',version:8,exportedAt:'2026-09-06T10:20:30.000Z',...data};
  const migrated=backup.parseBackupText(JSON.stringify(legacy));
  assert.equal(migrated.app,'guitar-diary');
  assert.equal(migrated.backupVersion,1);
  assert.deepEqual(migrated.data.profile,data.profile);
  assert.deepEqual(migrated.data.songs,data.songs);
});

test('отклоняет повреждённые и несовместимые файлы до изменения данных',()=>{
  const cases=[
    ['', 'EMPTY_FILE'],
    ['{broken', 'INVALID_JSON'],
    [JSON.stringify([]), 'INVALID_ROOT'],
    [JSON.stringify({app:'other',backupVersion:1,createdAt:new Date().toISOString(),data:{}}), 'INVALID_APP'],
    [JSON.stringify({app:'guitar-diary',backupVersion:2,createdAt:new Date().toISOString(),data:{}}), 'UNSUPPORTED_VERSION'],
    [JSON.stringify({app:'guitar-diary',backupVersion:1,createdAt:new Date().toISOString()}), 'MISSING_DATA'],
    [JSON.stringify({app:'guitar-diary',backupVersion:1,createdAt:new Date().toISOString(),data:[]}), 'INVALID_DATA']
  ];
  cases.forEach(([text,code])=>assert.throws(()=>backup.parseBackupText(text),error=>error.code===code));
  assert.throws(()=>backup.createBackup({...sampleData(),entries:{bad:{}}}),error=>error.code==='INVALID_DATA');
});

test('атомарно сохраняет значения и откатывает их при ошибке записи',()=>{
  const storage=new MemoryStorage({a:'old',b:'old2'});
  backup.replaceStorageAtomically(storage,{a:'new',b:'new2'});
  assert.equal(storage.getItem('a'),'new');
  assert.equal(storage.getItem('b'),'new2');

  const failing=new MemoryStorage({a:'old',b:'old2'}), setItem=failing.setItem.bind(failing);
  failing.setItem=(key,value)=>{ if(value==='new2') throw new Error('quota'); setItem(key,value); };
  assert.throws(()=>backup.replaceStorageAtomically(failing,{a:'new',b:'new2'}),error=>error.code==='STORAGE_WRITE_FAILED');
  assert.equal(failing.getItem('a'),'old');
  assert.equal(failing.getItem('b'),'old2');
});

test('сохраняет выбранный язык в резервной копии',()=>{
  const data=sampleData();
  const restored=backup.parseBackupText(JSON.stringify(backup.createBackup(data)));
  assert.equal(restored.data.language,'ru');
  assert.throws(()=>backup.createBackup({...data,language:'de'}),error=>error.code==='INVALID_DATA');
  assert.throws(()=>backup.createBackup({...data,entries:{bad:{teacherSession:'yes'}}}),error=>error.code==='INVALID_DATA');
});
