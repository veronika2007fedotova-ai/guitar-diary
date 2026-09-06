(function(root,factory){
  const api=factory();
  if(root) root.GuitarDiaryBackup=api;
  if(typeof module==='object'&&module.exports) module.exports=api;
})(typeof window!=='undefined'?window:typeof globalThis!=='undefined'?globalThis:null,function(){
  const APP_NAME='guitar-diary', BACKUP_VERSION=1, STORAGE_SCHEMA_VERSION=3;
  function isRecord(value){ return value!==null&&typeof value==='object'&&!Array.isArray(value); }
  function fail(code,message){ const error=new Error(message); error.name='BackupValidationError'; error.code=code; throw error; }
  function hasOwn(value,key){ return Object.prototype.hasOwnProperty.call(value,key); }
  function isDateKey(value){ return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value); }
  function validateProfile(profile){
    if(!isRecord(profile)||typeof profile.name!=='string'||!profile.name.trim()||!isDateKey(profile.startDate)) fail('INVALID_DATA','Неверная структура профиля.');
    if(profile.id!==undefined&&typeof profile.id!=='string') fail('INVALID_DATA','Неверный идентификатор профиля.');
    if(profile.weeklyGoal!==undefined&&(!Number.isFinite(Number(profile.weeklyGoal))||Number(profile.weeklyGoal)<1)) fail('INVALID_DATA','Неверная недельная цель.');
  }
  function validateEntries(entries){
    if(!isRecord(entries)) fail('INVALID_DATA','Неверная структура записей дневника.');
    Object.entries(entries).forEach(([key,entry])=>{
      if(!isDateKey(key)||!isRecord(entry)) fail('INVALID_DATA','Неверная запись дневника.');
      if(entry.training!==undefined&&typeof entry.training!=='string') fail('INVALID_DATA','Неверное поле тренировки.');
      if(entry.assignment!==undefined&&typeof entry.assignment!=='string') fail('INVALID_DATA','Неверное поле задания.');
      if(entry.minutes!==undefined&&(!Number.isFinite(Number(entry.minutes))||Number(entry.minutes)<0)) fail('INVALID_DATA','Неверное время занятия.');
      if(entry.progress!==undefined&&(!Number.isFinite(Number(entry.progress))||Number(entry.progress)<0||Number(entry.progress)>100)) fail('INVALID_DATA','Неверный прогресс занятия.');
      if(entry.completed!==undefined&&typeof entry.completed!=='boolean') fail('INVALID_DATA','Неверный статус задания.');
      if(entry.teacherSession!==undefined&&typeof entry.teacherSession!=='boolean') fail('INVALID_DATA','Неверный статус занятия с педагогом.');
    });
  }
  function validateInsights(insights){
    if(!isRecord(insights)) fail('INVALID_DATA','Неверная структура инсайтов.');
    Object.entries(insights).forEach(([key,value])=>{ if(!isDateKey(key)||typeof value!=='string') fail('INVALID_DATA','Неверный инсайт.'); });
  }
  function validateFavorites(favorites){
    if(!Array.isArray(favorites)) fail('INVALID_DATA','Неверная структура избранного.');
    favorites.forEach(favorite=>{ if(!isRecord(favorite)||typeof favorite.title!=='string'||!favorite.title.trim()||typeof (favorite.content??favorite.text)!=='string'||!(favorite.content??favorite.text).trim()) fail('INVALID_DATA','Неверная запись избранного.'); });
  }
  function validateTerms(terms){
    if(!Array.isArray(terms)) fail('INVALID_DATA','Неверная структура слов.');
    terms.forEach(term=>{ if(!isRecord(term)||typeof term.word!=='string'||!term.word.trim()||typeof term.meaning!=='string'||!term.meaning.trim()) fail('INVALID_DATA','Неверный термин.'); });
  }
  function validateSongs(songs){
    if(!Array.isArray(songs)) fail('INVALID_DATA','Неверная структура песен.');
    songs.forEach(song=>{ if(!isRecord(song)||typeof song.title!=='string'||!song.title.trim()||typeof song.chords!=='string'||!song.chords.trim()||typeof song.lyrics!=='string'||!song.lyrics.trim()) fail('INVALID_DATA','Неверная песня.'); });
  }
  function validateData(data){
    if(!isRecord(data)) fail('INVALID_DATA','Поле data должно быть объектом.');
    ['profile','entries','insights','favorites','terms','songs','testStats'].forEach(key=>{ if(!hasOwn(data,key)) fail('INVALID_DATA',`Отсутствует поле ${key}.`); });
    if(data.language!==undefined&&data.language!=='ru'&&data.language!=='en') fail('INVALID_DATA','Неверный язык интерфейса.');
    validateProfile(data.profile); validateEntries(data.entries); validateInsights(data.insights); validateFavorites(data.favorites); validateTerms(data.terms); validateSongs(data.songs);
    if(data.testStats!==null&&!isRecord(data.testStats)) fail('INVALID_DATA','Неверная статистика тестов.');
    if(data.visits!==undefined&&(!Array.isArray(data.visits)||data.visits.some(isVisit=>!isDateKey(isVisit)))) fail('INVALID_DATA','Неверная история посещений.');
    if(data.songFontSize!==undefined&&(!Number.isFinite(Number(data.songFontSize))||Number(data.songFontSize)<1)) fail('INVALID_DATA','Неверный размер текста песни.');
  }
  function validateMetadata(payload){
    if(payload.schemaVersion!==undefined&&(!Number.isInteger(Number(payload.schemaVersion))||Number(payload.schemaVersion)<1)) fail('UNSUPPORTED_VERSION','Версия схемы резервной копии не поддерживается.');
    if(payload.exportDate!==undefined&&(typeof payload.exportDate!=='string'||Number.isNaN(Date.parse(payload.exportDate)))) fail('INVALID_CREATED_AT','Неверная дата экспорта резервной копии.');
    if(payload.appVersion!==undefined&&typeof payload.appVersion!=='string') fail('INVALID_DATA','Неверная версия приложения в резервной копии.');
    if(payload.ownerTelegramUserId!==undefined&&payload.ownerTelegramUserId!==null&&!/^\d+$/.test(String(payload.ownerTelegramUserId))) fail('INVALID_DATA','Неверный владелец резервной копии.');
  }
  function toIso(value){
    const date=value instanceof Date?value:new Date(value);
    if(Number.isNaN(date.getTime())) fail('INVALID_CREATED_AT','Неверная дата создания резервной копии.');
    return date.toISOString();
  }
  function migrateLegacy(payload){
    if(!isRecord(payload)||payload.app!=='RiffLog') return null;
    if(payload.version!==undefined&&Number(payload.version)!==8) fail('UNSUPPORTED_VERSION','Версия старой резервной копии не поддерживается.');
    if(!isRecord(payload.entries)) fail('INVALID_DATA','Старая резервная копия не содержит записи дневника.');
    const exportDate=payload.exportedAt?toIso(payload.exportedAt):new Date().toISOString(), owner=payload.ownerTelegramUserId??payload.telegramUserId??payload.profile?.telegramUserId??null;
    return {app:APP_NAME,backupVersion:BACKUP_VERSION,schemaVersion:1,exportDate,appVersion:'legacy',ownerTelegramUserId:/^\d+$/.test(String(owner||''))?String(owner):null,createdAt:exportDate,data:{profile:payload.profile,entries:payload.entries,insights:isRecord(payload.insights)?payload.insights:{},favorites:Array.isArray(payload.favorites)?payload.favorites:[],terms:Array.isArray(payload.terms)?payload.terms:[],songs:Array.isArray(payload.songs)?payload.songs:[],testStats:isRecord(payload.testStats)?payload.testStats:null,visits:Array.isArray(payload.visits)?payload.visits:[],songFontSize:payload.songFontSize===undefined?100:payload.songFontSize}};
  }
  function createBackup(data,createdAt=new Date(),metadata={}){
    validateData(data);
    const exportDate=toIso(createdAt), owner=metadata.ownerTelegramUserId??null;
    if(owner!==null&&!/^\d+$/.test(String(owner))) fail('INVALID_DATA','Неверный владелец резервной копии.');
    return {app:APP_NAME,backupVersion:BACKUP_VERSION,schemaVersion:Number(metadata.schemaVersion)||STORAGE_SCHEMA_VERSION,exportDate,appVersion:String(metadata.appVersion||'unknown'),ownerTelegramUserId:owner===null?null:String(owner),createdAt:exportDate,data};
  }
  function serializeBackup(backup){ return JSON.stringify(backup,null,2); }
  function parseBackupText(text){
    if(typeof text!=='string'||!text.trim()) fail('EMPTY_FILE','Файл пуст.');
    let payload; try { payload=JSON.parse(text); } catch(error) { fail('INVALID_JSON','Файл содержит повреждённый JSON.'); }
    if(!isRecord(payload)) fail('INVALID_ROOT','Корневое значение должно быть объектом.');
    const legacy=migrateLegacy(payload); if(legacy){ validateData(legacy.data); return legacy; }
    if(payload.app!==APP_NAME) fail('INVALID_APP','Это не резервная копия Guitar Diary.');
    if(payload.backupVersion!==BACKUP_VERSION) fail('UNSUPPORTED_VERSION','Версия резервной копии не поддерживается.');
    if(typeof payload.createdAt!=='string'||Number.isNaN(Date.parse(payload.createdAt))) fail('INVALID_CREATED_AT','Неверная дата создания резервной копии.');
    validateMetadata(payload);
    if(!hasOwn(payload,'data')) fail('MISSING_DATA','В резервной копии отсутствует поле data.');
    validateData(payload.data); return payload;
  }
  function getFileName(date=new Date()){
    const value=date instanceof Date?date:new Date(date); if(Number.isNaN(value.getTime())) throw new Error('Неверная дата файла.');
    const pad=part=>String(part).padStart(2,'0'); return `guitar-diary-backup-${value.getFullYear()}-${pad(value.getMonth()+1)}-${pad(value.getDate())}.json`;
  }
  function canImportForUser(backup,currentUserId){
    const owner=backup?.ownerTelegramUserId;
    return owner===undefined||owner===null||String(owner)===String(currentUserId||'');
  }
  function replaceStorageAtomically(storage,values){
    if(!storage||typeof storage.getItem!=='function'||typeof storage.setItem!=='function'||typeof storage.removeItem!=='function') throw new Error('Хранилище недоступно.');
    const keys=Object.keys(values), previous={}; keys.forEach(key=>{ previous[key]=storage.getItem(key); });
    try {
      keys.forEach(key=>storage.setItem(key,values[key]));
      keys.forEach(key=>{ if(storage.getItem(key)!==values[key]) throw new Error('Проверка сохранённых данных не пройдена.'); });
    } catch(error){
      try { keys.forEach(key=>{ if(previous[key]===null||previous[key]===undefined) storage.removeItem(key); else storage.setItem(key,previous[key]); }); }
      catch(rollbackError){ const transactionError=new Error('Не удалось сохранить или откатить данные.'); transactionError.name='StorageTransactionError'; transactionError.code='STORAGE_ROLLBACK_FAILED'; transactionError.cause=error; transactionError.rollbackError=rollbackError; throw transactionError; }
      if(!error.code) error.code='STORAGE_WRITE_FAILED';
      throw error;
    }
  }
  return {APP_NAME,BACKUP_VERSION,STORAGE_SCHEMA_VERSION,createBackup,serializeBackup,parseBackupText,getFileName,canImportForUser,replaceStorageAtomically};
});
