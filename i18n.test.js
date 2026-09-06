const test=require('node:test');
const assert=require('node:assert/strict');
const i18n=require('./i18n.js');

class MemoryStorage{
  constructor(initial={}){ this.values=new Map(Object.entries(initial)); }
  getItem(key){ return this.values.has(key)?this.values.get(key):null; }
  setItem(key,value){ this.values.set(key,String(value)); }
}

test('определяет русский язык устройства и английский для остальных языков',()=>{
  assert.equal(i18n.detectLanguage('ru-RU'),'ru');
  assert.equal(i18n.detectLanguage('ru'),'ru');
  assert.equal(i18n.detectLanguage('en-US'),'en');
  assert.equal(i18n.detectLanguage('de-DE'),'en');
});

test('сохранённый выбор имеет приоритет над системным языком',()=>{
  assert.equal(i18n.loadLanguage(new MemoryStorage(), 'ru-RU'),'ru');
  assert.equal(i18n.loadLanguage(new MemoryStorage(), 'en-US'),'en');
  assert.equal(i18n.loadLanguage(new MemoryStorage({[i18n.LANGUAGE_KEY]:'en'}), 'ru-RU'),'en');
  assert.equal(i18n.loadLanguage(new MemoryStorage({[i18n.LANGUAGE_KEY]:'de'}), 'ru-RU'),'ru');
});

test('оба словаря содержат одинаковые непустые ключи',()=>{
  const ru=Object.keys(i18n.translations.ru), en=Object.keys(i18n.translations.en);
  assert.deepEqual(new Set(ru),new Set(en));
  [...ru].forEach(key=>{
    assert.equal(typeof i18n.translations.ru[key],'string');
    assert.equal(typeof i18n.translations.en[key],'string');
    assert.notEqual(i18n.translations.ru[key],undefined);
    assert.notEqual(i18n.translations.en[key],undefined);
  });
});

test('переключение переводит основные элементы и сохраняет выбор',()=>{
  const storage=new MemoryStorage();
  i18n.setLanguage('ru',false);
  assert.equal(i18n.t('navJournal'),'Мой дневник');
  assert.equal(i18n.t('dateToday',{date:'4 сентября'}),'Сегодня, 4 сентября');
  i18n.setLanguage('en',false);
  assert.equal(i18n.t('navJournal'),'My diary');
  assert.equal(i18n.t('dateToday',{date:'September 4'}),'Today, September 4');
  storage.setItem(i18n.LANGUAGE_KEY,'en');
  assert.equal(i18n.loadLanguage(storage,'ru-RU'),'en');
});

test('ручной выбор записывается в localStorage',()=>{
  const storage=new MemoryStorage(), previous=global.localStorage;
  global.localStorage=storage;
  i18n.setLanguage('ru',true);
  assert.equal(storage.getItem(i18n.getStorageKey(i18n.LANGUAGE_KEY)),'ru');
  global.localStorage=previous;
});
