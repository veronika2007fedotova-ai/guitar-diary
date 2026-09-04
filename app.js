const STORAGE_KEY = 'rifflog-entries-v1';
const PROFILE_KEY = 'rifflog-profile-v1';
const INSIGHTS_KEY = 'rifflog-insights-v1';
const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const MONTHS_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const WEEKDAYS_LONG = ['ВОСКРЕСЕНЬЕ','ПОНЕДЕЛЬНИК','ВТОРНИК','СРЕДА','ЧЕТВЕРГ','ПЯТНИЦА','СУББОТА'];
const WEEKDAYS = ['вс','пн','вт','ср','чт','пт','сб'];
const telegramWebApp = window.Telegram?.WebApp || null;
const telegramUser = telegramWebApp?.initDataUnsafe?.user || null;
if(telegramWebApp){ telegramWebApp.ready(); telegramWebApp.expand(); }
let now = new Date();
let todayKey = toKey(now);
let selectedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
let calendarDate = new Date(now.getFullYear(), now.getMonth(), 1);
let profile = loadProfile();
applyTelegramProfile();
let dailyInsights = loadInsights();
let entries = loadEntries();
if(toKey(selectedDate)<profile.startDate){ selectedDate=parseKey(profile.startDate); calendarDate=new Date(selectedDate.getFullYear(),selectedDate.getMonth(),1); }

function toKey(date){ return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
function parseKey(key){ const [y,m,d] = key.split('-').map(Number); return new Date(y,m-1,d); }
function formatDate(date, includeYear=false){ const day = date.getDate(); const month = MONTHS_GEN[date.getMonth()]; return includeYear ? `${day} ${month} ${date.getFullYear()}` : `${day} ${month}`; }
function loadProfile(){
  try { const stored = JSON.parse(localStorage.getItem(PROFILE_KEY)); if(stored && stored.name && stored.startDate) return stored; } catch(e) {}
  return {name:'Максим',startDate:todayKey};
}
function saveProfile(){ localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); }
function loadInsights(){
  try { const stored=JSON.parse(localStorage.getItem(INSIGHTS_KEY)); if(stored && typeof stored==='object' && !Array.isArray(stored)) return stored; } catch(e) {}
  return {};
}
function saveInsights(){ localStorage.setItem(INSIGHTS_KEY, JSON.stringify(dailyInsights)); }
function getInitials(name){ return name.trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase() || 'У'; }
function applyTelegramProfile(){
  if(!telegramUser) return;
  const telegramName=[telegramUser.first_name,telegramUser.last_name].filter(Boolean).join(' ').trim();
  if(telegramName) profile.name=telegramName;
  if(telegramUser.username) profile.telegramUsername=telegramUser.username; else delete profile.telegramUsername;
  saveProfile();
}
function updateTodayUi(){
  el('top-date').textContent=`${WEEKDAYS_LONG[now.getDay()]}, ${now.getDate()} ${MONTHS_GEN[now.getMonth()].toUpperCase()} ${now.getFullYear()}`;
  renderInsight();
}
function refreshToday(){
  const freshNow=new Date(), freshKey=toKey(freshNow); if(freshKey===todayKey){ now=freshNow; return; }
  const wasOnToday=toKey(selectedDate)===todayKey; now=freshNow; todayKey=freshKey; updateTodayUi();
  if(wasOnToday){ selectedDate=new Date(now.getFullYear(),now.getMonth(),now.getDate()); calendarDate=new Date(now.getFullYear(),now.getMonth(),1); }
  renderCalendar(); renderForm(); renderRecent(); calcStats();
}
function loadEntries(){
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if(stored && typeof stored==='object'){
      const starterAssignments=['Хроматическая разминка: 1–2–3–4 на каждой струне.','Бой восьмёрка под метроном 72 bpm.','Аккорды Am — F — C — G, по 2 минуты.','Пентатоника Ля минор в пяти позициях.'];
      const keys=Object.keys(stored);
      const isOldDemo=keys.length>0&&keys.length<=4&&keys.every(key=>stored[key]&&starterAssignments.includes(stored[key].assignment));
      if(isOldDemo){ localStorage.removeItem(STORAGE_KEY); return {}; }
      return stored;
    }
  } catch(e) {}
  return {};
}
function saveEntries(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); }
function el(id){ return document.getElementById(id); }
function renderCalendar(){
  el('calendar-month').textContent = `${MONTHS[calendarDate.getMonth()]} ${calendarDate.getFullYear()}`;
  el('calendar-caption').textContent = `Занятия с ${formatDate(parseKey(profile.startDate),true)}`;
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
  items.forEach(key=>{ const e=entries[key], item=document.createElement('article'); item.className='recent-item'; item.dataset.date=key; item.innerHTML=`<div class="recent-item-top"><span class="recent-item-date">${formatDate(parseKey(key),true)}</span><span class="recent-check">${e.completed?'✓':''}</span></div><h4>${escapeHtml(e.assignment||'Без описания')}</h4><div class="recent-item-bottom"><span>Время: ${e.minutes||0} мин</span><span>Результат: ${e.progress||0}%</span></div><div class="recent-progress"><span style="width:${e.progress||0}%"></span></div><div class="recent-actions"><button class="recent-edit" type="button">Редактировать</button><button class="recent-delete" type="button">Удалить</button></div>`; item.addEventListener('click',()=>selectDate(parseKey(key))); item.querySelector('.recent-edit').addEventListener('click',event=>{ event.stopPropagation(); selectDate(parseKey(key)); el('entry-panel').scrollIntoView({behavior:'smooth',block:'start'}); }); item.querySelector('.recent-delete').addEventListener('click',event=>{ event.stopPropagation(); removeEntry(key); }); list.appendChild(item); });
}
function removeEntry(key){
  if(!entries[key]) return;
  if(!window.confirm(`Удалить запись за ${formatDate(parseKey(key),true)}?`)) return;
  delete entries[key]; saveEntries(); renderCalendar(); renderForm(); renderRecent(); calcStats(); showToast('Запись удалена');
}
function escapeHtml(str){ return str.replace(/[&<>'"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c])); }
function calcStats(){
  const keys=Object.keys(entries), monthPrefix=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`, monthCount=keys.filter(k=>k.startsWith(monthPrefix)&&k>=profile.startDate).length;
  const weekStart=new Date(now.getFullYear(),now.getMonth(),now.getDate()-6); let weekMinutes=0; keys.forEach(k=>{ const d=parseKey(k); if(k>=profile.startDate&&d>=weekStart&&d<=now) weekMinutes+=Number(entries[k].minutes)||0; });
  let streak=0, cursor=new Date(now); while(toKey(cursor)>=profile.startDate&&entries[toKey(cursor)]){ streak++; cursor.setDate(cursor.getDate()-1); }
  el('streak-count').textContent=streak; el('month-sessions').textContent=monthCount; el('week-minutes').textContent=weekMinutes; el('week-progress').style.width=`${Math.min(100,weekMinutes/180*100)}%`;
  const streakBox=el('streak-days'); streakBox.innerHTML=''; for(let i=6;i>=0;i--){ const d=new Date(now); d.setDate(now.getDate()-i); const key=toKey(d), active=key>=profile.startDate&&!!entries[key]; const wrap=document.createElement('button'); wrap.type='button'; wrap.className=`day-dot ${active?'active':''} ${i===0?'current':''} ${key<profile.startDate?'before-start':''}`; wrap.innerHTML=`<i>${active?'✓':key<profile.startDate?'–':d.getDate()}</i><span>${WEEKDAYS[d.getDay()]}</span>`; if(key>=profile.startDate) wrap.addEventListener('click',()=>selectDate(d)); else wrap.disabled=true; streakBox.appendChild(wrap); }
  renderProgress();
}
function showToast(message){ const toast=el('toast'); toast.textContent=message; toast.classList.add('show'); clearTimeout(showToast.t); showToast.t=setTimeout(()=>toast.classList.remove('show'),2200); }
function switchView(view){ document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden')); el(`${view}-view`).classList.remove('hidden'); document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.view===view)); if(view==='stats') renderProgress(); }
function setMobileDrawer(open){
  const drawer=el('mobile-drawer'), scrim=el('mobile-drawer-scrim'), toggle=el('mobile-menu-toggle');
  if(!drawer || !scrim) return;
  drawer.classList.toggle('open',open); drawer.setAttribute('aria-hidden',String(!open)); scrim.classList.toggle('hidden',!open);
  if(toggle) toggle.setAttribute('aria-expanded',String(open));
}
function closeMobileDrawer(){ setMobileDrawer(false); }

function renderProfile(){
  el('profile-name').value=profile.name;
  el('profile-start-date').value=profile.startDate;
  const initials=getInitials(profile.name); el('profile-avatar').textContent=initials; renderTelegramLinks();
}

function renderTelegramLinks(){
  const username=telegramUser?.username || profile.telegramUsername || '';
  [['top-telegram-link',true],['profile-telegram-link',false]].forEach(([id,isTop])=>{
    const link=el(id); if(!link) return;
    if(username){ link.hidden=false; link.href=`https://t.me/${encodeURIComponent(username)}`; link.textContent=`@${username}`; if(isTop) link.setAttribute('aria-label',`Открыть профиль Telegram ${username}`); }
    else { link.hidden=true; link.removeAttribute('href'); link.textContent=''; }
  });
}
function renderInsight(){
  const insight=el('insight-day'); if(!insight) return;
  const key=todayKey, text=dailyInsights[key]||'';
  insight.textContent=text||'На сегодня инсайта нет — добавь мысль после занятия.';
  const meta=el('insight-meta'); if(meta) meta.textContent=formatDate(parseKey(key),true);
  const edit=el('insight-edit'), remove=el('insight-delete');
  if(edit) edit.innerHTML=text?'Редактировать <span>✎</span>':'Добавить инсайт <span>＋</span>';
  if(remove) remove.hidden=!text;
}
function renderMaterials(){
  const list=el('insight-list'); if(!list) return; list.innerHTML='';
  const keys=Object.keys(dailyInsights).filter(key=>/^\d{4}-\d{2}-\d{2}$/.test(key) && dailyInsights[key]).sort((a,b)=>b.localeCompare(a));
  if(!keys.length){ list.innerHTML='<div class="insight-empty">Пока нет инсайтов. Добавь первую мысль для себя.</div>'; return; }
  keys.forEach(key=>{
    const item=document.createElement('article'); item.className='insight-item';
    item.innerHTML=`<div class="insight-item-head"><div><span class="insight-item-date">${formatDate(parseKey(key),true)}</span><span class="eyebrow">ИНСАЙТ ДНЯ</span></div><div class="insight-item-actions"><button class="insight-item-edit" type="button">Редактировать</button><button class="insight-item-delete" type="button">Удалить</button></div></div><p>${escapeHtml(String(dailyInsights[key]))}</p>`;
    item.querySelector('.insight-item-edit').addEventListener('click',()=>openInsightModal(key));
    item.querySelector('.insight-item-delete').addEventListener('click',()=>removeInsight(key));
    list.appendChild(item);
  });
}
let editingInsightKey=null;
function openInsightModal(dateKey=todayKey){
  const modal=el('insight-modal'); if(!modal) return;
  const defaultKey=dateKey>=profile.startDate ? dateKey : (todayKey>=profile.startDate ? todayKey : profile.startDate);
  editingInsightKey=dailyInsights[dateKey] ? dateKey : null;
  el('insight-modal-title').textContent=editingInsightKey?'Редактировать инсайт':'Новый инсайт';
  el('insight-date').min=profile.startDate; el('insight-date').value=defaultKey;
  el('insight-text').value=dailyInsights[dateKey]||'';
  modal.classList.remove('hidden');
  window.setTimeout(()=>el('insight-text')?.focus(),0);
}
function closeInsightModal(){ const modal=el('insight-modal'); if(modal) modal.classList.add('hidden'); editingInsightKey=null; }
function removeInsight(key){
  if(!dailyInsights[key]) return;
  if(!window.confirm(`Удалить инсайт за ${formatDate(parseKey(key),true)}?`)) return;
  delete dailyInsights[key]; saveInsights(); renderInsight(); renderMaterials(); showToast('Инсайт удалён');
}

function svgNode(tag, attrs={}){ const node=document.createElementNS('http://www.w3.org/2000/svg',tag); Object.entries(attrs).forEach(([key,value])=>node.setAttribute(key,value)); return node; }
function renderProgress(){
  const chart=el('progress-chart'); if(!chart) return;
  const startDate=parseKey(profile.startDate), today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  let rangeStart=new Date(today); rangeStart.setDate(today.getDate()-13); if(rangeStart<startDate) rangeStart=new Date(startDate);
  const days=[]; for(let d=new Date(rangeStart); d<=today; d.setDate(d.getDate()+1)) days.push(new Date(d));
  const width=760,height=300,left=48,right=15,top=18,bottom=42,plotW=width-left-right,plotH=height-top-bottom;
  chart.innerHTML='';
  [0,25,50,75,100].forEach(value=>{ const y=top+plotH-(value/100)*plotH; chart.appendChild(svgNode('line',{x1:left,y1:y,x2:width-right,y2:y,class:'chart-grid-line'})); const label=svgNode('text',{x:left-10,y:y+4,'text-anchor':'end',class:'chart-scale-label'}); label.textContent=`${value}%`; chart.appendChild(label); });
  const points=days.map((date,index)=>{ const key=toKey(date), entry=entries[key]; return {date,key,index,value:key>=profile.startDate&&entry?Math.max(0,Math.min(100,Number(entry.progress)||0)):null}; });
  const xAt=index=>days.length===1?left+plotW/2:left+(index/(days.length-1))*plotW;
  const yAt=value=>top+plotH-(value/100)*plotH;
  let segment=[];
  const flush=()=>{ if(segment.length>1){ const path=svgNode('path',{d:segment.map((point,index)=>`${index?'L':'M'} ${xAt(point.index)} ${yAt(point.value)}`).join(' '),class:'chart-line'}); chart.appendChild(path); } segment=[]; };
  points.forEach(point=>{ if(point.value===null){flush();return;} segment.push(point); }); flush();
  points.forEach(point=>{ if(point.value===null) return; chart.appendChild(svgNode('circle',{cx:xAt(point.index),cy:yAt(point.value),r:5,class:'chart-point'})); const value=svgNode('text',{x:xAt(point.index),y:yAt(point.value)-11,'text-anchor':'middle',class:'chart-point-label'}); value.textContent=`${point.value}%`; chart.appendChild(value); });
  points.forEach((point,index)=>{ if(days.length>8&&index%2===1&&index!==days.length-1)return; const label=svgNode('text',{x:xAt(index),y:height-15,'text-anchor':'middle',class:'chart-date-label'}); label.textContent=`${point.date.getDate()} ${MONTHS_GEN[point.date.getMonth()].slice(0,3)}`; chart.appendChild(label); });
  const values=Object.keys(entries).filter(key=>key>=profile.startDate).map(key=>({progress:Number(entries[key].progress),minutes:Number(entries[key].minutes)||0})).filter(value=>Number.isFinite(value.progress));
  const totalMinutes=values.reduce((sum,item)=>sum+item.minutes,0), weightedProgress=totalMinutes?Math.round(values.reduce((sum,item)=>sum+item.progress*item.minutes,0)/totalMinutes):values.length?Math.round(values.reduce((sum,item)=>sum+item.progress,0)/values.length):0;
  el('average-progress').textContent=`${weightedProgress}%`; el('progress-days').textContent=values.length;
  el('chart-range').textContent=days.length?`${formatDate(days[0])} — ${formatDate(days[days.length-1])}`:'Нет периода'; el('progress-empty').classList.toggle('visible',values.length===0);
  const weekMinutes=Number(el('week-minutes').textContent)||0; el('progress-week-minutes').textContent=weekMinutes; el('progress-week-bar').style.width=`${Math.min(100,weekMinutes/180*100)}%`;
}

el('entry-form').addEventListener('submit',e=>{ e.preventDefault(); const key=toKey(selectedDate); if(key<profile.startDate){ showToast('Выбери день начиная с даты старта'); return; } const assignment=el('assignment').value.trim(); if(!assignment && !el('minutes').value){ showToast('Добавь задание или время занятия'); return; } entries[key]={assignment,minutes:Number(el('minutes').value)||0,progress:Number(el('progress').value)||0,completed:el('completed').checked}; saveEntries(); renderCalendar(); renderForm(); renderRecent(); calcStats(); showToast('Запись сохранена'); });
el('delete-entry').addEventListener('click',()=>{ const key=toKey(selectedDate); if(!entries[key]){ showToast('В этот день ещё нет записи'); return; } removeEntry(key); });
el('progress').addEventListener('input',updateRange);
el('prev-month').addEventListener('click',()=>{ calendarDate.setMonth(calendarDate.getMonth()-1); renderCalendar(); });
el('next-month').addEventListener('click',()=>{ calendarDate.setMonth(calendarDate.getMonth()+1); renderCalendar(); });
el('today-button').addEventListener('click',()=>{ selectedDate=new Date(now.getFullYear(),now.getMonth(),now.getDate()); calendarDate=new Date(now.getFullYear(),now.getMonth(),1); renderCalendar(); renderForm(); });
el('show-all').addEventListener('click',()=>{ document.querySelector('.recent-section').scrollIntoView({behavior:'smooth'}); });
document.querySelectorAll('[data-view]').forEach(btn=>btn.addEventListener('click',()=>{ if(btn.dataset.view==='profile') renderProfile(); switchView(btn.dataset.view); if(btn.closest('.mobile-drawer')) closeMobileDrawer(); }));
document.querySelectorAll('[data-go-journal]').forEach(btn=>btn.addEventListener('click',()=>switchView('journal')));
el('mobile-menu-toggle').addEventListener('click',()=>setMobileDrawer(true));
el('mobile-drawer-close').addEventListener('click',closeMobileDrawer);
el('mobile-drawer-scrim').addEventListener('click',closeMobileDrawer);
document.addEventListener('keydown',event=>{ if(event.key==='Escape') closeMobileDrawer(); });
el('insight-edit').addEventListener('click',()=>openInsightModal(todayKey));
el('insight-delete').addEventListener('click',()=>removeInsight(todayKey));
el('new-insight').addEventListener('click',()=>{ const selectedKey=toKey(selectedDate); openInsightModal(selectedKey>=profile.startDate?selectedKey:todayKey); });
el('insight-modal-close').addEventListener('click',closeInsightModal);
el('insight-cancel').addEventListener('click',closeInsightModal);
el('insight-modal').addEventListener('click',event=>{ if(event.target.id==='insight-modal') closeInsightModal(); });
el('insight-form').addEventListener('submit',event=>{
  event.preventDefault();
  const key=el('insight-date').value, text=el('insight-text').value.trim();
  if(!key || key<profile.startDate){ showToast('Выбери день начиная с даты старта'); return; }
  if(!text){ showToast('Поле инсайта обязательно'); el('insight-text').focus(); return; }
  if(editingInsightKey && editingInsightKey!==key) delete dailyInsights[editingInsightKey];
  dailyInsights[key]=text; saveInsights(); closeInsightModal(); renderInsight(); renderMaterials(); showToast('Инсайт сохранён');
});
updateTodayUi();
el('greeting-name').textContent=profile.name;
el('user-avatar').textContent=getInitials(profile.name);
el('profile-form').addEventListener('submit',event=>{
  event.preventDefault();
  const name=el('profile-name').value.trim(), startDate=el('profile-start-date').value;
  if(!name || !startDate){ showToast('Заполни имя и дату начала'); return; }
  profile={...profile,name,startDate}; saveProfile();
  el('greeting-name').textContent=profile.name; el('user-avatar').textContent=getInitials(profile.name); el('profile-avatar').textContent=getInitials(profile.name);
  if(toKey(selectedDate)<profile.startDate) selectedDate=parseKey(profile.startDate);
  calendarDate=new Date(selectedDate.getFullYear(),selectedDate.getMonth(),1);
  renderCalendar(); renderForm(); calcStats(); showToast('Профиль сохранён');
});
el('new-profile').addEventListener('click',()=>{
  if(!window.confirm('Начать новый профиль? Все записи занятий на этом устройстве будут удалены.')) return;
  const freshName=telegramUser?[telegramUser.first_name,telegramUser.last_name].filter(Boolean).join(' ').trim()||'Новый ученик':'Новый ученик'; profile={name:freshName,startDate:todayKey}; if(telegramUser?.username) profile.telegramUsername=telegramUser.username; entries={}; dailyInsights={}; saveProfile(); saveEntries(); saveInsights();
  selectedDate=new Date(now.getFullYear(),now.getMonth(),now.getDate()); calendarDate=new Date(now.getFullYear(),now.getMonth(),1);
  el('greeting-name').textContent=profile.name; el('user-avatar').textContent=getInitials(profile.name); renderProfile(); renderInsight(); renderMaterials(); renderCalendar(); renderForm(); renderRecent(); calcStats(); showToast('Новый профиль создан');
});
renderMaterials();
renderProfile();
renderCalendar(); renderForm(); renderRecent(); calcStats();
setInterval(refreshToday,60000);
document.addEventListener('visibilitychange',()=>{ if(!document.hidden) refreshToday(); });

// Перенос дневника между телефоном и компьютером без сервера.
el('export-data').addEventListener('click',()=>{
  const payload={app:'RiffLog',version:3,exportedAt:new Date().toISOString(),profile,entries,insights:dailyInsights};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}), url=URL.createObjectURL(blob), a=document.createElement('a');
  a.href=url; a.download=`rifflog-backup-${toKey(new Date())}.json`; a.click(); URL.revokeObjectURL(url); showToast('Копия дневника скачана');
});
el('import-data').addEventListener('click',()=>el('import-file').click());
el('import-file').addEventListener('change',event=>{
  const file=event.target.files?.[0]; if(!file) return; const reader=new FileReader();
  reader.onload=()=>{ try{ const payload=JSON.parse(reader.result); if(!payload.entries || typeof payload.entries!=='object') throw new Error('bad'); entries=payload.entries; dailyInsights=payload.insights&&typeof payload.insights==='object'&&!Array.isArray(payload.insights)?payload.insights:{}; if(payload.profile&&payload.profile.name&&payload.profile.startDate){ profile=payload.profile; saveProfile(); } saveEntries(); saveInsights(); if(toKey(selectedDate)<profile.startDate) selectedDate=parseKey(profile.startDate); calendarDate=new Date(selectedDate.getFullYear(),selectedDate.getMonth(),1); el('greeting-name').textContent=profile.name; el('user-avatar').textContent=getInitials(profile.name); renderProfile(); renderInsight(); renderMaterials(); renderCalendar(); renderForm(); renderRecent(); calcStats(); showToast('Дневник восстановлен'); }catch(e){ showToast('Не удалось прочитать копию'); } event.target.value=''; }; reader.readAsText(file);
});
if('serviceWorker' in navigator && location.protocol!=='file:'){ navigator.serviceWorker.register('sw.js').catch(()=>{}); }
