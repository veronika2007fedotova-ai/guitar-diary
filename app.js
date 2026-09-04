const STORAGE_KEY = 'rifflog-entries-v1';
const PROFILE_KEY = 'rifflog-profile-v1';
const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const MONTHS_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const WEEKDAYS_LONG = ['ВОСКРЕСЕНЬЕ','ПОНЕДЕЛЬНИК','ВТОРНИК','СРЕДА','ЧЕТВЕРГ','ПЯТНИЦА','СУББОТА'];
const WEEKDAYS = ['вс','пн','вт','ср','чт','пт','сб'];
const quotes = ['Сначала медленно. Скорость придёт сама.','Ровный ритм важнее быстрой руки.','Каждая чистая нота — уже прогресс.','Десять минут сегодня лучше, чем час когда-нибудь.'];
const now = new Date();
const todayKey = toKey(now);
let selectedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
let calendarDate = new Date(now.getFullYear(), now.getMonth(), 1);
let profile = loadProfile();
let entries = loadEntries();
if(toKey(selectedDate)<profile.startDate){ selectedDate=parseKey(profile.startDate); calendarDate=new Date(selectedDate.getFullYear(),selectedDate.getMonth(),1); }

function toKey(date){ return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
function parseKey(key){ const [y,m,d] = key.split('-').map(Number); return new Date(y,m-1,d); }
function formatDate(date, includeYear=false){ const day = date.getDate(); const month = MONTHS_GEN[date.getMonth()]; return includeYear ? `${day} ${month} ${date.getFullYear()}` : `${day} ${month}`; }
function loadProfile(){
  try { const stored = JSON.parse(localStorage.getItem(PROFILE_KEY)); if(stored && stored.name && stored.startDate) return stored; } catch(e) {}
  const start = new Date(now.getFullYear(),now.getMonth(),now.getDate()-3);
  return {name:'Максим',startDate:toKey(start)};
}
function saveProfile(){ localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); }
function getInitials(name){ return name.trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase() || 'У'; }
function loadEntries(){
  try { const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)); if(stored) return stored; } catch(e) {}
  const seeded = {};
  [0,1,2,3].forEach((offset, index) => { const d = new Date(now); d.setDate(d.getDate()-offset); seeded[toKey(d)] = { assignment: ['Хроматическая разминка: 1–2–3–4 на каждой струне.','Бой восьмёрка под метроном 72 bpm.','Аккорды Am — F — C — G, по 2 минуты.','Пентатоника Ля минор в пяти позициях.'][index], minutes:[35,25,45,40][index], progress:[70,55,85,60][index], completed:index < 3 }; });
  return seeded;
}
function saveEntries(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); }
function el(id){ return document.getElementById(id); }
function renderCalendar(){
  el('calendar-month').textContent = `${MONTHS[calendarDate.getMonth()]} ${calendarDate.getFullYear()}`;
  const grid = el('calendar-grid'); grid.innerHTML = '';
  const firstDay = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1);
  const startOffset = (firstDay.getDay()+6)%7;
  const daysInMonth = new Date(calendarDate.getFullYear(), calendarDate.getMonth()+1, 0).getDate();
  const prevDays = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 0).getDate();
  for(let i=0;i<42;i++){
    let dayNum = i-startOffset+1; let date;
    if(dayNum<1) date = new Date(calendarDate.getFullYear(),calendarDate.getMonth()-1,prevDays+dayNum);
    else if(dayNum>daysInMonth) date = new Date(calendarDate.getFullYear(),calendarDate.getMonth()+1,dayNum-daysInMonth);
    else date = new Date(calendarDate.getFullYear(),calendarDate.getMonth(),dayNum);
    const key=toKey(date), button=document.createElement('button'); button.className='calendar-day'; button.textContent=date.getDate();
    if(date.getMonth()!==calendarDate.getMonth()) button.classList.add('muted');
    if(key===todayKey) button.classList.add('today');
    if(key===toKey(selectedDate)) button.classList.add('selected');
    if(entries[key]) button.classList.add('has-entry');
    button.dataset.date=key;
    if(key < profile.startDate){ button.classList.add('before-start'); button.disabled=true; button.title='До даты начала занятий'; }
    else button.addEventListener('click',()=>selectDate(date));
    grid.appendChild(button);
  }
}
function selectDate(date){ if(toKey(date)<profile.startDate){ showToast('Этот день был до начала занятий'); return; } selectedDate = new Date(date); if(date.getMonth()!==calendarDate.getMonth()) calendarDate = new Date(date.getFullYear(),date.getMonth(),1); renderCalendar(); renderForm(); }
function renderForm(){
  const key=toKey(selectedDate), entry=entries[key]||{};
  el('entry-date').textContent = key===todayKey ? `Сегодня, ${formatDate(selectedDate)}` : `${WEEKDAYS[selectedDate.getDay()]}, ${formatDate(selectedDate)}`;
  el('assignment').value=entry.assignment||''; el('minutes').value=entry.minutes||''; el('progress').value=entry.progress ?? 60; el('progress-output').value=`${entry.progress ?? 60}%`; el('progress-output').textContent=`${entry.progress ?? 60}%`; el('completed').checked=!!entry.completed;
  el('entry-status').textContent=entry.assignment ? 'ЗАПИСЬ СОХРАНЕНА' : 'НОВАЯ ЗАПИСЬ'; el('entry-status').classList.toggle('saved',!!entry.assignment); updateRange();
}
function updateRange(){ const val=el('progress').value; el('progress-output').textContent=`${val}%`; el('progress-output').value=`${val}%`; el('progress').style.background=`linear-gradient(90deg,var(--orange) 0%,var(--orange) ${val}%,#363941 ${val}%,#363941 100%)`; }
function renderRecent(){
  const list=el('recent-list'); list.innerHTML=''; const items=Object.keys(entries).filter(key=>key>=profile.startDate).sort((a,b)=>b.localeCompare(a)).slice(0,6);
  if(!items.length){ list.innerHTML='<div class="recent-item"><h4>Пока нет записей — добавь первое занятие в календаре.</h4></div>'; return; }
  items.forEach(key=>{ const e=entries[key], item=document.createElement('article'); item.className='recent-item'; item.dataset.date=key; item.innerHTML=`<div class="recent-item-top"><span class="recent-item-date">${formatDate(parseKey(key),true)}</span><span class="recent-check">${e.completed?'✓':''}</span></div><h4>${escapeHtml(e.assignment||'Без описания')}</h4><div class="recent-item-bottom"><span>${e.minutes||0} мин</span><span>${e.progress||0}%</span></div><div class="recent-progress"><span style="width:${e.progress||0}%"></span></div>`; item.addEventListener('click',()=>selectDate(parseKey(key))); list.appendChild(item); });
}
function escapeHtml(str){ return str.replace(/[&<>'"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c])); }
function calcStats(){
  const keys=Object.keys(entries), monthPrefix=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`, monthCount=keys.filter(k=>k.startsWith(monthPrefix)&&k>=profile.startDate).length;
  const weekStart=new Date(now.getFullYear(),now.getMonth(),now.getDate()-6); let weekMinutes=0; keys.forEach(k=>{ const d=parseKey(k); if(k>=profile.startDate&&d>=weekStart&&d<=now) weekMinutes+=Number(entries[k].minutes)||0; });
  let streak=0, cursor=new Date(now); while(toKey(cursor)>=profile.startDate&&entries[toKey(cursor)]){ streak++; cursor.setDate(cursor.getDate()-1); }
  el('streak-count').textContent=streak; el('month-sessions').textContent=monthCount; el('week-minutes').textContent=weekMinutes; el('week-progress').style.width=`${Math.min(100,weekMinutes/180*100)}%`;
  const streakBox=el('streak-days'); streakBox.innerHTML=''; for(let i=3;i>=0;i--){ const d=new Date(now); d.setDate(now.getDate()-i); const active=!!entries[toKey(d)]; const wrap=document.createElement('span'); wrap.className=`day-dot ${active?'active':''} ${i===0?'current':''}`; wrap.innerHTML=`<i>${active?'✓':d.getDate()}</i><span>${WEEKDAYS[d.getDay()]}</span>`; streakBox.appendChild(wrap); }
}
function showToast(message){ const toast=el('toast'); toast.textContent=message; toast.classList.add('show'); clearTimeout(showToast.t); showToast.t=setTimeout(()=>toast.classList.remove('show'),2200); }
function switchView(view){ document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden')); el(`${view}-view`).classList.remove('hidden'); document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.view===view)); }

function renderProfile(){
  el('profile-name').value=profile.name;
  el('profile-start-date').value=profile.startDate;
  const initials=getInitials(profile.name); el('profile-avatar').textContent=initials;
}

el('entry-form').addEventListener('submit',e=>{ e.preventDefault(); const key=toKey(selectedDate); if(key<profile.startDate){ showToast('Выбери день начиная с даты старта'); return; } const assignment=el('assignment').value.trim(); if(!assignment && !el('minutes').value){ showToast('Добавь задание или время занятия'); return; } entries[key]={assignment,minutes:Number(el('minutes').value)||0,progress:Number(el('progress').value)||0,completed:el('completed').checked}; saveEntries(); renderCalendar(); renderForm(); renderRecent(); calcStats(); showToast('Запись сохранена'); });
el('delete-entry').addEventListener('click',()=>{ const key=toKey(selectedDate); if(!entries[key]){ showToast('В этот день ещё нет записи'); return; } delete entries[key]; saveEntries(); renderCalendar(); renderForm(); renderRecent(); calcStats(); showToast('Запись удалена'); });
el('progress').addEventListener('input',updateRange);
el('prev-month').addEventListener('click',()=>{ calendarDate.setMonth(calendarDate.getMonth()-1); renderCalendar(); });
el('next-month').addEventListener('click',()=>{ calendarDate.setMonth(calendarDate.getMonth()+1); renderCalendar(); });
el('today-button').addEventListener('click',()=>{ selectedDate=new Date(now.getFullYear(),now.getMonth(),now.getDate()); calendarDate=new Date(now.getFullYear(),now.getMonth(),1); renderCalendar(); renderForm(); });
el('show-all').addEventListener('click',()=>{ document.querySelector('.recent-section').scrollIntoView({behavior:'smooth'}); });
document.querySelectorAll('.nav-item').forEach(btn=>btn.addEventListener('click',()=>switchView(btn.dataset.view)));
document.querySelectorAll('[data-view="profile"]').forEach(btn=>btn.addEventListener('click',()=>{ renderProfile(); switchView('profile'); }));
document.querySelectorAll('[data-go-journal]').forEach(btn=>btn.addEventListener('click',()=>switchView('journal')));
el('quote').textContent=quotes[now.getDate()%quotes.length];
el('top-date').textContent=`${WEEKDAYS_LONG[now.getDay()]}, ${now.getDate()} ${MONTHS_GEN[now.getMonth()].toUpperCase()} ${now.getFullYear()}`;
el('greeting-name').textContent=profile.name;
el('user-avatar').textContent=getInitials(profile.name);
el('profile-form').addEventListener('submit',event=>{
  event.preventDefault();
  const name=el('profile-name').value.trim(), startDate=el('profile-start-date').value;
  if(!name || !startDate){ showToast('Заполни имя и дату начала'); return; }
  profile={name,startDate}; saveProfile();
  el('greeting-name').textContent=profile.name; el('user-avatar').textContent=getInitials(profile.name); el('profile-avatar').textContent=getInitials(profile.name);
  if(toKey(selectedDate)<profile.startDate) selectedDate=parseKey(profile.startDate);
  calendarDate=new Date(selectedDate.getFullYear(),selectedDate.getMonth(),1);
  renderCalendar(); renderForm(); calcStats(); showToast('Профиль сохранён');
});
renderProfile();
renderCalendar(); renderForm(); renderRecent(); calcStats();

// Перенос дневника между телефоном и компьютером без сервера.
el('export-data').addEventListener('click',()=>{
  const payload={app:'RiffLog',version:1,exportedAt:new Date().toISOString(),entries};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}), url=URL.createObjectURL(blob), a=document.createElement('a');
  a.href=url; a.download=`rifflog-backup-${toKey(new Date())}.json`; a.click(); URL.revokeObjectURL(url); showToast('Копия дневника скачана');
});
el('import-data').addEventListener('click',()=>el('import-file').click());
el('import-file').addEventListener('change',event=>{
  const file=event.target.files?.[0]; if(!file) return; const reader=new FileReader();
  reader.onload=()=>{ try{ const payload=JSON.parse(reader.result); if(!payload.entries || typeof payload.entries!=='object') throw new Error('bad'); entries=payload.entries; saveEntries(); renderCalendar(); renderForm(); renderRecent(); calcStats(); showToast('Дневник восстановлен'); }catch(e){ showToast('Не удалось прочитать копию'); } event.target.value=''; }; reader.readAsText(file);
});
if('serviceWorker' in navigator && location.protocol!=='file:'){ navigator.serviceWorker.register('sw.js').catch(()=>{}); }
