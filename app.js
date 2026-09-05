const STORAGE_KEY = 'rifflog-entries-v1';
const VISITS_KEY = 'rifflog-visits-v1';
const PROFILE_KEY = 'rifflog-profile-v1';
const INSIGHTS_KEY = 'rifflog-insights-v1';
const FAVORITES_KEY = 'rifflog-favorites-v1';
const TERMS_KEY = 'rifflog-terms-v1';
const TEST_STATS_KEY = 'rifflog-word-test-stats-v1';
const SONGS_KEY = 'rifflog-songs-v1';
const SONG_FONT_SIZE_KEY = 'rifflog-song-font-size-v1';
const backupTools = window.GuitarDiaryBackup;
const i18n = window.GuitarDiaryI18n;
const LANGUAGE_KEY = i18n.LANGUAGE_KEY;
const t = (key,values={}) => i18n.t(key,values);
let {months:MONTHS,monthsGen:MONTHS_GEN,weekdaysLong:WEEKDAYS_LONG,weekdays:WEEKDAYS} = i18n.getDateLabels();
const KNOWLEDGE_LEVELS = {
  new:{labelKey:'statusNew',className:'new'},
  learning:{labelKey:'statusLearning',className:'learning'},
  known:{labelKey:'statusKnown',className:'known'},
  mastered:{labelKey:'statusMastered',className:'mastered'}
};
const DAILY_TERM_STATUSES = {
  known:{labelKey:'dailyKnown',className:'known'},
  learning:{labelKey:'dailyLearning',className:'learning'},
  difficult:{labelKey:'dailyDifficult',className:'difficult'}
};
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
let visitDays = loadVisits();
registerVisit();
let favorites = loadFavorites();
if(favorites.length) saveFavorites();
let terms = loadTerms();
if(terms.length) saveTerms();
let songs = loadSongs();
if(songs.length) saveSongs();
let testStats = loadTestStats();
let termSearchQuery='';
let songSearchQuery='';
let songFontSize=loadSongFontSize();
let quizSetup={filter:'all',size:'all'};
if(toKey(selectedDate)<profile.startDate){ selectedDate=parseKey(profile.startDate); calendarDate=new Date(selectedDate.getFullYear(),selectedDate.getMonth(),1); }

function toKey(date){ return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
function parseKey(key){ const [y,m,d] = key.split('-').map(Number); return new Date(y,m-1,d); }
function formatDate(date, includeYear=false){ return i18n.formatDate(date,includeYear); }
function createLocalId(prefix){
  if(window.crypto?.randomUUID) return `${prefix}_${window.crypto.randomUUID()}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,10)}`;
}
function normalizeWeeklyGoal(value){
  const numeric=Number(value);
  return Number.isFinite(numeric)&&numeric>=1?Math.min(10000,Math.round(numeric)):DEFAULT_WEEKLY_GOAL;
}
function loadProfile(){
  try {
    const stored = JSON.parse(localStorage.getItem(PROFILE_KEY));
    if(stored && stored.name && stored.startDate){
      const weeklyGoal=normalizeWeeklyGoal(stored.weeklyGoal);
      if(!stored.id||stored.weeklyGoal!==weeklyGoal){ stored.id=stored.id||createLocalId('profile'); stored.weeklyGoal=weeklyGoal; localStorage.setItem(PROFILE_KEY,JSON.stringify(stored)); }
      return stored;
    }
  } catch(e) {}
  const freshProfile={id:createLocalId('profile'),name:t('defaultName'),startDate:todayKey,weeklyGoal:DEFAULT_WEEKLY_GOAL};
  localStorage.setItem(PROFILE_KEY,JSON.stringify(freshProfile));
  return freshProfile;
}
function saveProfile(){ localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); }
function loadInsights(){
  try { const stored=JSON.parse(localStorage.getItem(INSIGHTS_KEY)); if(stored && typeof stored==='object' && !Array.isArray(stored)) return stored; } catch(e) {}
  return {};
}
function saveInsights(){ localStorage.setItem(INSIGHTS_KEY, JSON.stringify(dailyInsights)); }
function normalizeFavorite(favorite, fallbackProfileId=profile.id){
  if(!favorite || typeof favorite!=='object') return null;
  const title=String(favorite.title||'').trim(), content=String(favorite.content||favorite.text||'').trim();
  if(!title || !content) return null;
  return {id:favorite.id||createLocalId('favorite'),profileId:favorite.profileId||fallbackProfileId,title,content,createdAt:favorite.createdAt||new Date().toISOString(),updatedAt:favorite.updatedAt||new Date().toISOString()};
}
function loadFavorites(){
  try { const stored=JSON.parse(localStorage.getItem(FAVORITES_KEY)); if(Array.isArray(stored)) return stored.map(favorite=>normalizeFavorite(favorite)).filter(Boolean); } catch(e) {}
  return [];
}
function saveFavorites(){ localStorage.setItem(FAVORITES_KEY,JSON.stringify(favorites)); }
function normalizeDailyStats(value){
  const dailyStats={}; if(!value||typeof value!=='object'||Array.isArray(value)) return dailyStats;
  Object.entries(value).forEach(([date,day])=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!day||typeof day!=='object') return;
    const correct=Math.max(0,Number(day.correct)||0), incorrect=Math.max(0,Number(day.incorrect)||0), attempts=Math.max(correct+incorrect,Number(day.attempts)||0); if(!attempts) return;
    dailyStats[date]={attempts,correct,incorrect,lastResult:day.lastResult==='incorrect'?'incorrect':day.lastResult==='correct'?'correct':null};
  });
  return dailyStats;
}
function normalizeTerm(term, fallbackProfileId=profile.id){
  if(!term || typeof term!=='object') return null;
  const word=String(term.word||'').trim(), meaning=String(term.meaning||'').trim();
  if(!word || !meaning) return null;
  const legacyErrors=Math.max(0,Number(term.wrongCount)||0), incorrectCount=Math.max(0,Number.isFinite(Number(term.incorrectCount))?Number(term.incorrectCount):legacyErrors), correctCount=Math.max(0,Number(term.correctCount)||0), attempts=Math.max(correctCount+incorrectCount,Number(term.attempts)||0);
  return {
    id:term.id||createLocalId('term'),
    profileId:term.profileId||fallbackProfileId,
    word,
    meaning,
    category:String(term.category||'').trim(),
    dailyStats:normalizeDailyStats(term.dailyStats),
    attempts,
    correctCount,
    incorrectCount,
    wrongCount:incorrectCount,
    knowledgeLevel:KNOWLEDGE_LEVELS[term.knowledgeLevel]?term.knowledgeLevel:'new',
    consecutiveCorrect:Math.max(0,Number(term.consecutiveCorrect)||0),
    createdAt:term.createdAt||new Date().toISOString(),
    updatedAt:term.updatedAt||new Date().toISOString(),
    lastReviewedAt:term.lastReviewedAt||term.updatedAt||null,
    lastIncorrectAt:term.lastIncorrectAt||null
  };
}
function normalizeSong(song, fallbackProfileId=profile.id){
  if(!song || typeof song!=='object') return null;
  const title=String(song.title||'').trim(), chords=String(song.chords||'').trim(), lyrics=String(song.lyrics||'').trim();
  if(!title || !chords || !lyrics) return null;
  return {
    id:song.id||createLocalId('song'),
    profileId:song.profileId||fallbackProfileId,
    title,
    artist:String(song.artist||'').trim(),
    chords,
    lyrics,
    createdAt:song.createdAt||new Date().toISOString(),
    updatedAt:song.updatedAt||new Date().toISOString()
  };
}
function loadSongs(){
  try {
    const stored=JSON.parse(localStorage.getItem(SONGS_KEY));
    if(Array.isArray(stored)) return stored.map(song=>normalizeSong(song)).filter(Boolean);
  } catch(e) {}
  return [];
}
function saveSongs(){ localStorage.setItem(SONGS_KEY,JSON.stringify(songs)); }
function normalizeSongFontSize(value){
  const numeric=Number(value); return Number.isFinite(numeric)?Math.min(160,Math.max(80,Math.round(numeric/10)*10)):100;
}
function loadSongFontSize(){ const stored=localStorage.getItem(SONG_FONT_SIZE_KEY); return stored===null?100:normalizeSongFontSize(stored); }
function saveSongFontSize(){ localStorage.setItem(SONG_FONT_SIZE_KEY,String(songFontSize)); }
function loadTerms(){
  try {
    const stored=JSON.parse(localStorage.getItem(TERMS_KEY));
    if(Array.isArray(stored)) return stored.map(term=>normalizeTerm(term)).filter(Boolean);
  } catch(e) {}
  return [];
}
function saveTerms(){ localStorage.setItem(TERMS_KEY, JSON.stringify(terms)); }
function loadTestStats(){
  try {
    const stored=JSON.parse(localStorage.getItem(TEST_STATS_KEY));
    if(stored&&typeof stored==='object'&&!Array.isArray(stored)) return stored;
  } catch(e) {}
  return {};
}
function saveTestStats(){ localStorage.setItem(TEST_STATS_KEY,JSON.stringify(testStats)); }
function getProfileTestStats(){
  if(!testStats[profile.id]) testStats[profile.id]={tests:0,answers:0,correct:0,incorrect:0,days:{}};
  const stats=testStats[profile.id]; if(!stats.days||typeof stats.days!=='object') stats.days={};
  stats.tests=Math.max(0,Number(stats.tests)||0); stats.answers=Math.max(0,Number(stats.answers)||0); stats.correct=Math.max(0,Number(stats.correct)||0); stats.incorrect=Math.max(0,Number(stats.incorrect)||0);
  return stats;
}
function getDayTestStats(day={}){
  const correct=Math.max(0,Number(day.correct)||0), incorrect=Math.max(0,Number(day.incorrect)||0), answers=Math.max(correct+incorrect,Number(day.reviewed)||0);
  return {tests:Math.max(0,Number(day.tests)||(answers?1:0)),answers,correct,incorrect};
}
function aggregateTestStats(fromKey='',toKeyValue='9999-12-31'){
  const stats=getProfileTestStats(), total={tests:0,answers:0,correct:0,incorrect:0};
  Object.entries(stats.days).forEach(([date,day])=>{
    if(date<fromKey||date>toKeyValue) return;
    const daily=getDayTestStats(day); total.tests+=daily.tests; total.answers+=daily.answers; total.correct+=daily.correct; total.incorrect+=daily.incorrect;
  });
  if(!fromKey&&total.tests===0&&total.answers===0){ total.tests=stats.tests; total.answers=stats.answers; total.correct=stats.correct; total.incorrect=stats.incorrect; }
  return total;
}
function getInitials(name){ return name.trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase() || t('initialFallback'); }
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
  const wasOnToday=toKey(selectedDate)===todayKey; now=freshNow; todayKey=freshKey; registerVisit(); updateTodayUi();
  if(wasOnToday){ selectedDate=new Date(now.getFullYear(),now.getMonth(),now.getDate()); calendarDate=new Date(now.getFullYear(),now.getMonth(),1); }
  renderCalendar(); renderForm(); renderRecent(); calcStats(); renderTerms(); renderWordStats();
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
function loadVisits(){
  try {
    const stored=JSON.parse(localStorage.getItem(VISITS_KEY));
    if(stored&&typeof stored==='object'&&!Array.isArray(stored)) return stored;
  } catch(e) {}
  return {};
}
function saveVisits(){ localStorage.setItem(VISITS_KEY,JSON.stringify(visitDays)); }
function getCurrentVisitDays(){ return Array.isArray(visitDays[profile.id])?visitDays[profile.id]:[]; }
function hasVisited(key){ return getCurrentVisitDays().includes(key); }
function dayWord(count){
  const mod10=count%10, mod100=count%100;
  if(i18n.getLanguage()==='en') return count===1?t('day'):t('days');
  return mod10===1&&mod100!==11?t('day'):mod10>=2&&mod10<=4&&(mod100<12||mod100>14)?t('daysFew'):t('days');
}
function registerVisit(){
  const current=new Set(getCurrentVisitDays().filter(key=>/^\d{4}-\d{2}-\d{2}$/.test(key)));
  if(!current.size) Object.keys(entries).filter(hasDiaryEntry).forEach(key=>current.add(key));
  current.add(todayKey);
  const updated=Array.from(current).sort();
  if(JSON.stringify(visitDays[profile.id])!==JSON.stringify(updated)){ visitDays[profile.id]=updated; saveVisits(); }
}
function hasDiaryEntry(key){
  const entry=entries[key]; if(!entry||typeof entry!=='object') return false;
  return Boolean(String(entry.training||'').trim()||String(entry.assignment||'').trim()||(Number(entry.minutes)||0)>0||entry.completed===true||entry.teacherSession===true);
}
function getWeeklyMinutes(){
  const weekStart=new Date(now.getFullYear(),now.getMonth(),now.getDate()-6); let weekMinutes=0;
  Object.keys(entries).forEach(key=>{ const date=parseKey(key); if(key>=profile.startDate&&date>=weekStart&&date<=now) weekMinutes+=Number(entries[key].minutes)||0; });
  return weekMinutes;
}
function getWeeklyGoal(){ return normalizeWeeklyGoal(profile.weeklyGoal); }
function renderWeeklyGoal(weekMinutes=getWeeklyMinutes()){
  const weeklyGoal=getWeeklyGoal(), percent=Math.min(100,weekMinutes/weeklyGoal*100);
  el('week-minutes').textContent=weekMinutes; el('week-progress').style.width=`${percent}%`;
  el('weekly-goal-display').textContent=weeklyGoal; el('progress-week-minutes').textContent=weekMinutes; el('progress-week-goal').textContent=weeklyGoal; el('progress-week-bar').style.width=`${percent}%`;
}
function updateWeeklyGoal(value){
  const numeric=Number(value); if(!Number.isFinite(numeric)||numeric<1) return false;
  const weeklyGoal=normalizeWeeklyGoal(numeric); if(profile.weeklyGoal!==weeklyGoal){ profile={...profile,weeklyGoal}; saveProfile(); }
  renderWeeklyGoal(); return true;
}
function openWeeklyGoalModal(){
  const modal=el('weekly-goal-modal'); if(!modal) return;
  el('weekly-goal-editor').value=getWeeklyGoal(); modal.classList.remove('hidden'); setModalPageLock(true); window.setTimeout(()=>{ const input=el('weekly-goal-editor'); input?.focus(); input?.select(); },0);
}
function closeWeeklyGoalModal(){ const modal=el('weekly-goal-modal'); if(modal) modal.classList.add('hidden'); setModalPageLock(false); }
function el(id){ return document.getElementById(id); }
function renderCalendar(){
  el('calendar-month').textContent = `${MONTHS[calendarDate.getMonth()]} ${calendarDate.getFullYear()}`;
  el('calendar-caption').textContent = t('calendarFrom',{date:formatDate(parseKey(profile.startDate),true)});
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
    if(entries[key]?.teacherSession===true) button.classList.add('teacher-session');
    button.dataset.date=key;
    if(key < profile.startDate){ button.classList.add('before-start'); button.disabled=true; button.title=t('beforeStart'); }
    else button.addEventListener('click',()=>selectDate(date));
    grid.appendChild(button);
  }
}
function selectDate(date){ if(toKey(date)<profile.startDate){ showToast(t('dayBeforeStart')); return; } selectedDate = new Date(date); if(date.getMonth()!==calendarDate.getMonth()) calendarDate = new Date(date.getFullYear(),date.getMonth(),1); renderCalendar(); renderForm(); if(window.matchMedia('(max-width:700px)').matches) openMobileEntry(); }
function renderForm(){
  const key=toKey(selectedDate), entry=entries[key]||{};
  const dateLabel=key===todayKey?t('dateToday',{date:formatDate(selectedDate)}):t('dateWeekday',{weekday:WEEKDAYS[selectedDate.getDay()],date:formatDate(selectedDate)});
  el('entry-date').textContent = dateLabel;
  const previewDate=el('mobile-entry-preview-date'), previewText=el('mobile-entry-preview-text');
  if(previewDate) previewDate.textContent=dateLabel;
  if(previewText){ previewText.textContent=entry.assignment||t('previewEmpty'); previewText.classList.toggle('empty',!entry.assignment); }
  el('training').value=entry.training||''; el('assignment').value=entry.assignment||''; el('minutes').value=entry.minutes||''; el('progress').value=entry.progress ?? 60; el('progress-output').value=`${entry.progress ?? 60}%`; el('progress-output').textContent=`${entry.progress ?? 60}%`; el('teacher-session').checked=entry.teacherSession===true;
  const hasEntry=!!(entry.training||entry.assignment||entry.minutes||entry.teacherSession===true); el('entry-status').textContent=hasEntry ? t('savedEntry') : t('newEntry'); el('entry-status').classList.toggle('saved',hasEntry); updateRange();
}
function updateRange(){ const val=el('progress').value; el('progress-output').textContent=`${val}%`; el('progress-output').value=`${val}%`; el('progress').style.background=`linear-gradient(90deg,var(--orange) 0%,var(--orange) ${val}%,#363941 ${val}%,#363941 100%)`; }
function renderRecent(){
  const list=el('recent-list'); list.innerHTML=''; const items=Object.keys(entries).filter(key=>key>=profile.startDate).sort((a,b)=>b.localeCompare(a)).slice(0,6);
  if(!items.length){ list.innerHTML=`<div class="recent-item"><h4>${t('recentEmpty')}</h4></div>`; return; }
  items.forEach(key=>{ const e=entries[key], summary=[e.training,e.assignment].filter(Boolean).join(' · ')||t('noDescription'), item=document.createElement('article'); item.className='recent-item'; item.dataset.date=key; item.innerHTML=`<div class="recent-item-top"><span class="recent-item-date">${formatDate(parseKey(key),true)}</span><span class="recent-check">${e.completed?'✓':''}</span></div><h4>${escapeHtml(summary)}</h4><div class="recent-item-bottom"><span>${t('time')} ${e.minutes||0} ${t('minutes')}</span><span>${t('recentResult')} ${e.progress||0}%</span></div><div class="recent-progress"><span style="width:${e.progress||0}%"></span></div><div class="recent-actions"><button class="recent-edit" type="button">${t('edit')}</button><button class="recent-delete" type="button">${t('delete')}</button></div>`; item.addEventListener('click',()=>selectDate(parseKey(key))); item.querySelector('.recent-edit').addEventListener('click',event=>{ event.stopPropagation(); selectDate(parseKey(key)); el('entry-panel').scrollIntoView({behavior:'smooth',block:'start'}); }); item.querySelector('.recent-delete').addEventListener('click',event=>{ event.stopPropagation(); removeEntry(key); }); list.appendChild(item); });
}
function removeEntry(key){
  if(!entries[key]) return;
  if(!window.confirm(t('deleteEntryConfirm',{date:formatDate(parseKey(key),true)}))) return;
  delete entries[key]; saveEntries(); renderCalendar(); renderForm(); renderRecent(); calcStats(); showToast(t('entryDeleted'));
}
function escapeHtml(str){ return str.replace(/[&<>'"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c])); }
function calcStats(){
  const keys=Object.keys(entries), monthPrefix=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`, monthCount=keys.filter(k=>k.startsWith(monthPrefix)&&k>=profile.startDate&&hasDiaryEntry(k)).length;
  const weekMinutes=getWeeklyMinutes();
  let streak=0, cursor=new Date(now); while(toKey(cursor)>=profile.startDate&&hasVisited(toKey(cursor))){ streak++; cursor.setDate(cursor.getDate()-1); }
  el('streak-count').textContent=streak; el('streak-label').textContent=`${dayWord(streak)}${t('streakSuffix')}`; el('month-sessions').textContent=monthCount; renderWeeklyGoal(weekMinutes);
  const streakBox=el('streak-days'); streakBox.innerHTML=''; for(let i=6;i>=0;i--){ const d=new Date(now); d.setDate(now.getDate()-i); const key=toKey(d), active=key>=profile.startDate&&hasVisited(key); const wrap=document.createElement('button'); wrap.type='button'; wrap.className=`day-dot ${active?'active':''} ${i===0?'current':''} ${key<profile.startDate?'before-start':''}`; wrap.innerHTML=`<i>${active?'✓':key<profile.startDate?'–':d.getDate()}</i><span>${WEEKDAYS[d.getDay()]}</span>`; if(key>=profile.startDate) wrap.addEventListener('click',()=>selectDate(d)); else wrap.disabled=true; streakBox.appendChild(wrap); }
  renderProgress();
}
function showToast(message){ const toast=el('toast'); toast.textContent=message; toast.classList.add('show'); clearTimeout(showToast.t); showToast.t=setTimeout(()=>toast.classList.remove('show'),2200); }
function switchView(view){ if(view!=='journal') closeMobileEntry(); document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden')); el(`${view}-view`).classList.remove('hidden'); document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.view===view)); if(view==='stats') renderProgress(); if(view==='test'){ renderTerms(); renderWordStats(); } if(view==='chords') renderSongs(); window.scrollTo(0,0); }
function setModalPageLock(locked){ document.documentElement.classList.toggle('modal-locked',locked); document.body.classList.toggle('modal-locked',locked); }
function setMobileEntry(open){
  const entry=el('entry-panel'), backdrop=el('mobile-entry-backdrop'); if(!entry||!backdrop) return;
  entry.classList.toggle('mobile-entry-open',open); backdrop.classList.toggle('hidden',!open); backdrop.classList.toggle('open',open); document.documentElement.classList.toggle('mobile-entry-locked',open); document.body.classList.toggle('mobile-entry-locked',open);
}
function openMobileEntry(){ setMobileEntry(true); }
function closeMobileEntry(){ setMobileEntry(false); }
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
    if(username){ link.hidden=false; link.href=`https://t.me/${encodeURIComponent(username)}`; link.textContent=`@${username}`; if(isTop) link.setAttribute('aria-label',t('openTelegramProfile',{username})); }
    else { link.hidden=true; link.removeAttribute('href'); link.textContent=''; }
  });
}
function renderInsight(){
  const insight=el('insight-day'); if(!insight) return;
  const key=todayKey, text=dailyInsights[key]||'';
  insight.textContent=text||t('insightNone');
  const meta=el('insight-meta'); if(meta) meta.textContent=formatDate(parseKey(key),true);
  const edit=el('insight-edit'), remove=el('insight-delete');
  if(edit) edit.innerHTML=text?`${t('edit')} <span>✎</span>`:`${t('addInsight')} <span>＋</span>`;
  if(remove) remove.hidden=!text;
}
function getCurrentFavorites(){ return favorites.filter(favorite=>favorite.profileId===profile.id); }
function renderFavoriteList(){
  const list=el('favorites-list'); if(!list) return; list.innerHTML='';
  const query=(el('favorite-search')?.value||'').trim().toLocaleLowerCase();
  const currentFavorites=getCurrentFavorites().filter(favorite=>!query||`${favorite.title} ${favorite.content}`.toLocaleLowerCase().includes(query)).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
  if(query&&!currentFavorites.length){ list.innerHTML=`<div class="favorite-empty"><strong>${t('nothingFound')}</strong><span>${t('favoriteSearchHint')}</span></div>`; return; }
  if(!currentFavorites.length){ list.innerHTML=`<div class="favorite-empty"><strong>${t('favoritesEmpty')}</strong><span>${t('favoritesEmptyHint')}</span></div>`; return; }
  currentFavorites.forEach(favorite=>{
    const item=document.createElement('article'); item.className='favorite-item';
    item.innerHTML=`<button class="favorite-open" type="button" aria-label="${t('favoriteOpenAria',{title:escapeHtml(favorite.title)})}"><span class="favorite-open-icon">☆</span><span class="favorite-open-copy"><strong>${escapeHtml(favorite.title)}</strong><small>${t('favoriteOpenHint')}</small></span><span class="favorite-open-arrow">→</span></button><div class="favorite-item-actions"><button class="favorite-edit" type="button">${t('edit')}</button><button class="favorite-delete" type="button">${t('delete')}</button></div>`;
    item.querySelector('.favorite-open').addEventListener('click',()=>openFavoriteDetail(favorite.id));
    item.querySelector('.favorite-edit').addEventListener('click',()=>editFavorite(favorite.id));
    item.querySelector('.favorite-delete').addEventListener('click',()=>removeFavorite(favorite.id));
    list.appendChild(item);
  });
}
function renderMaterials(){
  renderFavoriteList();
  const list=el('insight-list'); if(!list) return; list.innerHTML='';
  const keys=Object.keys(dailyInsights).filter(key=>/^\d{4}-\d{2}-\d{2}$/.test(key) && dailyInsights[key]).sort((a,b)=>b.localeCompare(a));
  if(!keys.length){ list.innerHTML=`<div class="insight-empty">${t('insightsEmpty')}</div>`; return; }
  keys.forEach(key=>{
    const item=document.createElement('article'); item.className='insight-item';
    item.innerHTML=`<div class="insight-item-head"><div><span class="insight-item-date">${formatDate(parseKey(key),true)}</span><span class="eyebrow">${t('insightDay')}</span></div><div class="insight-item-actions"><button class="insight-item-edit" type="button">${t('edit')}</button><button class="insight-item-delete" type="button">${t('delete')}</button></div></div><p>${escapeHtml(String(dailyInsights[key]))}</p>`;
    item.querySelector('.insight-item-edit').addEventListener('click',()=>openInsightModal(key));
    item.querySelector('.insight-item-delete').addEventListener('click',()=>removeInsight(key));
    list.appendChild(item);
  });
}
let editingFavoriteId=null;
let openedFavoriteId=null;
function openFavoriteModal(favoriteId=null){
  const modal=el('favorite-modal'); if(!modal) return;
  const favorite=favorites.find(item=>item.id===favoriteId&&item.profileId===profile.id); editingFavoriteId=favorite?favorite.id:null;
  el('favorite-modal-title').textContent=favorite?t('editInformation'):t('newInformation'); el('favorite-title').value=favorite?favorite.title:''; el('favorite-text').value=favorite?favorite.content:''; modal.classList.remove('hidden'); setModalPageLock(true); window.setTimeout(()=>el('favorite-title')?.focus(),0);
}
function closeFavoriteModal(){ const modal=el('favorite-modal'); if(modal) modal.classList.add('hidden'); editingFavoriteId=null; setModalPageLock(false); }
function openFavoriteDetail(favoriteId){
  const favorite=favorites.find(item=>item.id===favoriteId&&item.profileId===profile.id), modal=el('favorite-detail-modal'); if(!favorite||!modal) return;
  openedFavoriteId=favorite.id; el('favorite-detail-title').textContent=favorite.title; const updated=new Date(favorite.updatedAt), date=el('favorite-detail-date'); date.textContent=Number.isNaN(updated.getTime())?'':t('updated',{date:formatDate(updated,true)}); el('favorite-detail-content').textContent=favorite.content; modal.classList.remove('hidden'); setModalPageLock(true);
}
function closeFavoriteDetail(){ const modal=el('favorite-detail-modal'); if(modal) modal.classList.add('hidden'); openedFavoriteId=null; setModalPageLock(false); }
function editFavorite(favoriteId){ closeFavoriteDetail(); openFavoriteModal(favoriteId); }
function removeFavorite(favoriteId){
  const favorite=favorites.find(item=>item.id===favoriteId&&item.profileId===profile.id); if(!favorite) return;
  if(!window.confirm(t('deleteFavoriteConfirm',{title:favorite.title}))) return;
  favorites=favorites.filter(item=>item.id!==favoriteId); saveFavorites(); if(openedFavoriteId===favoriteId) closeFavoriteDetail(); renderMaterials(); showToast(t('favoriteDeleted'));
}
let editingInsightKey=null;
function openInsightModal(dateKey=todayKey){
  const modal=el('insight-modal'); if(!modal) return;
  const requestedKey=/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey))?String(dateKey):todayKey;
  editingInsightKey=dailyInsights[requestedKey] ? requestedKey : null;
  el('insight-modal-title').textContent=editingInsightKey?t('editInsight'):t('newInsight');
  el('insight-date').removeAttribute('min'); el('insight-date').value=requestedKey;
  el('insight-text').value=dailyInsights[requestedKey]||'';
  modal.classList.remove('hidden'); setModalPageLock(true);
  window.setTimeout(()=>el('insight-text')?.focus(),0);
}
function closeInsightModal(){ const modal=el('insight-modal'); if(modal) modal.classList.add('hidden'); editingInsightKey=null; setModalPageLock(false); }
function removeInsight(key){
  if(!dailyInsights[key]) return;
  if(!window.confirm(t('deleteInsightConfirm',{date:formatDate(parseKey(key),true)}))) return;
  delete dailyInsights[key]; saveInsights(); renderInsight(); renderMaterials(); showToast(t('insightDeleted'));
}

let editingSongId=null;
let openedSongId=null;
function getCurrentSongs(){ return songs.filter(song=>song.profileId===profile.id); }
function renderSongFontSize(){
  const lyrics=el('song-detail-lyrics'); if(lyrics) lyrics.style.setProperty('--song-font-scale',String(songFontSize/100));
  const output=el('song-font-size-value'); if(output) output.textContent=`${songFontSize}%`;
  const decrease=el('song-font-decrease'), increase=el('song-font-increase'); if(decrease) decrease.disabled=songFontSize<=80; if(increase) increase.disabled=songFontSize>=160;
}
function changeSongFontSize(delta){ songFontSize=normalizeSongFontSize(songFontSize+delta); saveSongFontSize(); renderSongFontSize(); }
function renderSongDetail(){
  const song=songs.find(item=>item.id===openedSongId&&item.profileId===profile.id), libraryPanel=el('songs-library-panel'), detailPanel=el('song-detail-panel');
  if(!song){ openedSongId=null; renderSongs(); return; }
  libraryPanel.classList.add('hidden'); detailPanel.classList.remove('hidden'); el('song-detail-title').textContent=song.title; const artist=el('song-detail-artist'); artist.textContent=song.artist||t('mySong'); artist.classList.toggle('hidden',!song.artist); el('song-detail-chords').textContent=song.chords; el('song-detail-lyrics').textContent=song.lyrics; renderSongFontSize();
}
function openSong(songId){ openedSongId=songId; renderSongDetail(); }
function closeSongDetail(){ openedSongId=null; renderSongs(); }
function renderSongs(){
  const list=el('songs-list'); if(!list) return;
  const locale=i18n.getLanguage()==='ru'?'ru-RU':'en-US', currentSongs=getCurrentSongs(), query=songSearchQuery.trim().toLocaleLowerCase(locale), libraryPanel=el('songs-library-panel'), detailPanel=el('song-detail-panel');
  if(openedSongId){ renderSongDetail(); return; }
  libraryPanel.classList.remove('hidden'); detailPanel.classList.add('hidden');
  if(el('song-search')&&el('song-search').value!==songSearchQuery) el('song-search').value=songSearchQuery;
  el('songs-count').textContent=currentSongs.length; list.innerHTML='';
  if(!currentSongs.length){ list.innerHTML=`<div class="songs-empty"><strong>${t('songsEmpty')}</strong><span>${t('songsEmptyHint')}</span></div>`; return; }
  const visibleSongs=currentSongs.filter(song=>!query||[song.title,song.artist,song.chords,song.lyrics].some(value=>String(value||'').toLocaleLowerCase(locale).includes(query)));
  if(!visibleSongs.length){ list.innerHTML=`<div class="songs-empty"><strong>${t('songsNotFound')}</strong><span>${t('songsNotFoundHint')}</span></div>`; return; }
  visibleSongs.forEach(song=>{
    const item=document.createElement('article'); item.className='song-item';
    item.innerHTML=`<div class="song-item-head"><button class="song-open" type="button" aria-label="${t('songOpenAria',{title:escapeHtml(song.title)})}"><span class="song-open-icon">♫</span><span class="song-open-copy"><strong>${escapeHtml(song.title)}</strong>${song.artist?`<span class="song-artist">${escapeHtml(song.artist)}</span>`:''}<small>${t('songOpenHint')}</small></span><span class="song-open-arrow">→</span></button><div class="song-item-actions"><button class="song-edit" type="button">${t('edit')}</button><button class="song-delete" type="button">${t('delete')}</button></div></div>`;
    item.querySelector('.song-open').addEventListener('click',()=>openSong(song.id));
    item.querySelector('.song-edit').addEventListener('click',()=>editSong(song.id));
    item.querySelector('.song-delete').addEventListener('click',()=>removeSong(song.id));
    list.appendChild(item);
  });
}
function resetSongForm(){
  editingSongId=null; el('song-form').reset(); el('song-form-title').textContent=t('addSong'); el('song-submit').innerHTML=`${t('addSong')} <span>↗</span>`; el('cancel-song-edit').classList.add('hidden');
}
function editSong(songId){
  const song=songs.find(item=>item.id===songId&&item.profileId===profile.id); if(!song) return;
  openedSongId=null; renderSongs(); editingSongId=songId; el('song-title').value=song.title; el('song-artist').value=song.artist||''; el('song-chords').value=song.chords; el('song-lyrics').value=song.lyrics; el('song-form-title').textContent=t('editSong'); el('song-submit').innerHTML=`${t('saveSong')} <span>↗</span>`; el('cancel-song-edit').classList.remove('hidden'); el('song-title').focus();
}
function removeSong(songId){
  const song=songs.find(item=>item.id===songId&&item.profileId===profile.id); if(!song) return;
  if(!window.confirm(t('deleteSongConfirm',{title:song.title}))) return;
  songs=songs.filter(item=>item.id!==songId); saveSongs(); if(editingSongId===songId) resetSongForm(); if(openedSongId===songId) openedSongId=null; renderSongs(); showToast(t('songDeleted'));
}

let editingTermId=null;
let termCategoryFilter='all';
let quizState={terms:[],currentIndex:0,correct:0,incorrect:0,answered:false,pendingAnswer:null,screen:'start',selection:'all',repeatOnly:false,filter:'all',baseFilter:'all',missedIds:[],currentStreak:0,maxStreak:0,recorded:false};

function getCurrentTerms(){ return terms.filter(term=>term.profileId===profile.id); }
function getKnowledgeLevel(term){ return KNOWLEDGE_LEVELS[term.knowledgeLevel]?term.knowledgeLevel:'new'; }
function getKnowledgeMeta(term){ const meta=KNOWLEDGE_LEVELS[getKnowledgeLevel(term)]; return {...meta,label:t(meta.labelKey)}; }
function getTermDayStats(term,dateKey=todayKey){
  const stored=term.dailyStats?.[dateKey]; if(stored) return stored;
  if(dateKey===todayKey&&term.lastReviewedAt&&toKey(new Date(term.lastReviewedAt))===dateKey){ const incorrect=term.lastIncorrectAt&&toKey(new Date(term.lastIncorrectAt))===dateKey?1:0; return {attempts:1,correct:incorrect?0:1,incorrect,lastResult:incorrect?'incorrect':'correct'}; }
  return null;
}
function getDailyTermStatus(term,dateKey=todayKey){
  const day=getTermDayStats(term,dateKey); if(!day||!(Number(day.attempts)||Number(day.correct)||Number(day.incorrect))) return 'learning';
  if((Number(day.incorrect)||0)>0||day.lastResult==='incorrect') return 'difficult';
  if((Number(day.correct)||0)>0||day.lastResult==='correct') return 'known';
  return 'learning';
}
function getDailyStatusMeta(term){ const meta=DAILY_TERM_STATUSES[getDailyTermStatus(term)]; return {...meta,label:t(meta.labelKey)}; }
function isTermDifficult(term){ return getDailyTermStatus(term)==='difficult'; }
function lowerKnowledgeLevel(level){ return level==='mastered'?'known':level==='known'?'learning':level==='learning'?'new':'new'; }
function updateTermAfterAnswer(term,correct){
  const storedIndex=terms.findIndex(item=>item.id===term.id&&item.profileId===profile.id), previous=storedIndex>=0?terms[storedIndex]:term, timestamp=new Date().toISOString(), attempts=(Number(previous.attempts)||0)+1;
  const correctCount=(Number(previous.correctCount)||0)+(correct?1:0), incorrectCount=(Number(previous.incorrectCount)||0)+(correct?0:1), consecutiveCorrect=correct?(Number(previous.consecutiveCorrect)||0)+1:0;
  let knowledgeLevel=getKnowledgeLevel(previous);
  if(correct){ if(consecutiveCorrect>=5) knowledgeLevel='mastered'; else if(consecutiveCorrect>=3) knowledgeLevel='known'; else knowledgeLevel='learning'; } else if((Number(previous.attempts)||0)>0) knowledgeLevel=lowerKnowledgeLevel(knowledgeLevel);
  const dailyStats={...(previous.dailyStats||{})}, day={...(dailyStats[todayKey]||{attempts:0,correct:0,incorrect:0})}; day.attempts=(Number(day.attempts)||0)+1; day.correct=(Number(day.correct)||0)+(correct?1:0); day.incorrect=(Number(day.incorrect)||0)+(correct?0:1); day.lastResult=correct?'correct':'incorrect'; dailyStats[todayKey]=day;
  const updated={...previous,profileId:profile.id,attempts,correctCount,incorrectCount,wrongCount:incorrectCount,consecutiveCorrect,knowledgeLevel,lastReviewedAt:timestamp,lastIncorrectAt:correct?previous.lastIncorrectAt:timestamp,updatedAt:timestamp,dailyStats};
  if(storedIndex>=0) terms[storedIndex]=updated; else terms.push(updated);
  return updated;
}
function renderTerms(){
  const list=el('terms-list'); if(!list) return;
  const locale=i18n.getLanguage()==='ru'?'ru-RU':'en-US', currentTerms=getCurrentTerms(), query=termSearchQuery.trim().toLocaleLowerCase(locale), filterLabels={all:t('allTerms'),known:t('knownToday'),learning:t('learningToday'),difficult:t('difficultToday')};
  if(el('term-search')&&el('term-search').value!==termSearchQuery) el('term-search').value=termSearchQuery;
  el('term-filter-label').textContent=filterLabels[termCategoryFilter]||filterLabels.all; el('term-filter-clear').classList.toggle('hidden',termCategoryFilter==='all');
  const visibleTerms=currentTerms.filter(term=>(termCategoryFilter==='all'||getDailyTermStatus(term)===termCategoryFilter)&&(!query||[term.word,term.meaning,term.category].some(value=>String(value||'').toLocaleLowerCase(locale).includes(query))));
  el('terms-count').textContent=currentTerms.length; list.innerHTML='';
  if(!currentTerms.length){ list.innerHTML=`<div class="terms-empty"><strong>${t('wordsEmpty')}</strong><span>${t('wordsEmptyHint')}</span></div>`; renderQuizStart(); return; }
  if(!visibleTerms.length){ const filteredByCategory=termCategoryFilter!=='all'; list.innerHTML=`<div class="terms-empty"><strong>${filteredByCategory?t('categoryEmpty'):t('searchEmpty')}</strong><span>${filteredByCategory?t('categoryEmptyHint'):t('searchEmptyHint')}</span></div>`; renderQuizStart(); return; }
  visibleTerms.forEach(term=>{
    const meta=getDailyStatusMeta(term), todayErrors=Number(getTermDayStats(term)?.incorrect)||0, item=document.createElement('article'); item.className='term-item';
    item.innerHTML=`<div class="term-item-copy"><div class="term-item-title"><strong>${escapeHtml(term.word)}</strong><span class="term-level level-${meta.className}">${meta.label}</span></div><span>${escapeHtml(term.meaning)}</span>${term.category?`<small class="term-category">${escapeHtml(term.category)}</small>`:''}${todayErrors?`<small>${t('errorsToday',{count:todayErrors})}</small>`:''}</div><div class="term-item-actions"><button class="term-edit" type="button">${t('edit')}</button><button class="term-delete" type="button">${t('delete')}</button></div>`;
    item.querySelector('.term-edit').addEventListener('click',()=>editTerm(term.id));
    item.querySelector('.term-delete').addEventListener('click',()=>removeTerm(term.id));
    list.appendChild(item);
  });
  renderQuizStart();
}
function resetTermForm(){
  editingTermId=null; el('term-form').reset(); el('term-form-title').textContent=t('addTerm'); el('term-submit').innerHTML=`${t('add')} <span>↗</span>`; el('cancel-term-edit').classList.add('hidden');
}
function editTerm(termId){
  const term=terms.find(item=>item.id===termId&&item.profileId===profile.id); if(!term) return;
  editingTermId=termId; el('term-word').value=term.word; el('term-meaning').value=term.meaning; el('term-category').value=term.category||''; el('term-form-title').textContent=t('editTerm'); el('term-submit').innerHTML=`${t('save')} <span>↗</span>`; el('cancel-term-edit').classList.remove('hidden'); el('term-word').focus();
}
function removeTerm(termId){
  const term=terms.find(item=>item.id===termId&&item.profileId===profile.id); if(!term) return;
  if(!window.confirm(t('deleteTermConfirm',{word:term.word}))) return;
  terms=terms.filter(item=>item.id!==termId); saveTerms(); if(editingTermId===termId) resetTermForm(); renderTerms(); renderWordStats(); showToast(t('termDeleted'));
}
function setTestMode(mode){
  document.querySelectorAll('[data-test-mode]').forEach(button=>{ if(button.classList.contains('test-mode-tab')){ const active=button.dataset.testMode===mode; button.classList.toggle('active',active); button.setAttribute('aria-selected',String(active)); } });
  el('test-library-panel').classList.toggle('hidden',mode!=='library'); el('quiz-panel').classList.toggle('hidden',mode!=='quiz'); el('word-stats-panel').classList.toggle('hidden',mode!=='word-stats');
  if(mode==='library') renderTerms(); if(mode==='word-stats') renderWordStats(); if(mode==='quiz'&&quizState.screen==='start') renderQuizStart();
}
function renderQuizStart(){
  const currentTerms=getCurrentTerms(), difficult=currentTerms.filter(isTermDifficult), ready=el('quiz-ready-state'), empty=el('quiz-empty-state'); if(!ready||!empty) return;
  el('quiz-term-count').textContent=currentTerms.length; el('quiz-difficult-count').textContent=difficult.length; ready.classList.toggle('hidden',!currentTerms.length); empty.classList.toggle('hidden',!!currentTerms.length);
  document.querySelectorAll('[data-quiz-filter]').forEach(button=>button.classList.toggle('active',button.dataset.quizFilter===quizSetup.filter)); document.querySelectorAll('[data-quiz-size]').forEach(button=>{ button.disabled=!currentTerms.length; button.classList.toggle('active',button.dataset.quizSize===quizSetup.size); });
  el('quiz-start-button').disabled=!currentTerms.length; const repeat=el('quiz-repeat-difficult'); repeat.hidden=!difficult.length; el('quiz-repeat-count').textContent=difficult.length?`(${difficult.length})`:'';
}
function shuffle(items){ const result=[...items]; for(let index=result.length-1;index>0;index--){ const swapIndex=Math.floor(Math.random()*(index+1)); [result[index],result[swapIndex]]=[result[swapIndex],result[index]]; } return result; }
function getQuizPool(filter,missedIds=[]){
  const currentTerms=getCurrentTerms();
  if(filter==='new') return currentTerms.filter(term=>(Number(term.attempts)||0)===0||getKnowledgeLevel(term)==='new'&&(Number(term.correctCount)||0)===0);
  if(filter==='review') return currentTerms.filter(term=>(Number(term.attempts)||0)>0&&getKnowledgeLevel(term)!=='mastered');
  if(filter==='difficult') return currentTerms.filter(isTermDifficult);
  if(filter==='errors') return currentTerms.filter(term=>missedIds.includes(term.id));
  return currentTerms;
}
function startQuiz(selection='all',repeatOnly=false,filter=quizSetup.filter){
  if(repeatOnly) filter='difficult';
  const previousMissedIds=quizState.missedIds||[], pool=getQuizPool(filter,previousMissedIds);
  if(!pool.length){ setTestMode('quiz'); renderQuizStart(); showToast(filter==='difficult'?t('noDifficult'):filter==='errors'?t('noErrors'):t('noCategoryWords')); return; }
  const amount=selection==='all'?pool.length:Math.min(Number(selection),pool.length);
  quizState={terms:shuffle(pool).slice(0,amount),currentIndex:0,correct:0,incorrect:0,answered:false,pendingAnswer:null,screen:'question',selection,repeatOnly,filter,baseFilter:filter==='errors'?'all':filter,missedIds:[],currentStreak:0,maxStreak:0,recorded:false}; quizSetup={filter:filter==='errors'?'all':filter,size:selection}; setTestMode('quiz'); renderQuizQuestion();
}
function updateQuizScore(){ el('quiz-current').textContent=quizState.currentIndex+1; el('quiz-total').textContent=quizState.terms.length; el('quiz-correct').textContent=quizState.correct; el('quiz-incorrect').textContent=quizState.incorrect; }
function renderQuizFeedback(){
  const feedback=el('quiz-feedback'), pending=quizState.pendingAnswer, term=quizState.terms[quizState.currentIndex];
  if(!feedback) return;
  const answered=quizState.answered&&pending&&term;
  feedback.textContent=answered?(pending.correct?(pending.selfCorrected?t('selfCorrectDone'):t('correct')):t('incorrect',{meaning:term.meaning})):'';
  feedback.className=answered?`quiz-feedback ${pending.correct?'correct':'incorrect'}`:'quiz-feedback hidden';
  const selfCorrect=el('quiz-self-correct'), next=el('quiz-next');
  if(selfCorrect) selfCorrect.classList.toggle('hidden',!answered||pending.correct);
  if(next){ next.classList.toggle('hidden',!answered); next.innerHTML=`${t('nextWord')} <span>→</span>`; }
}
function renderQuizQuestion(){
  const term=quizState.terms[quizState.currentIndex]; if(!term){ renderQuizResult(); return; }
  const locale=i18n.getLanguage()==='ru'?'ru-RU':'en-US'; el('quiz-start').classList.add('hidden'); el('quiz-result').classList.add('hidden'); el('quiz-question').classList.remove('hidden'); el('quiz-word').textContent=term.word.toLocaleUpperCase(locale); el('quiz-answer').value=''; el('quiz-answer').disabled=false; el('quiz-check').disabled=false; quizState.answered=false; quizState.pendingAnswer=null; renderQuizFeedback(); updateQuizScore(); window.setTimeout(()=>el('quiz-answer')?.focus(),0);
}
function normalizeAnswer(value){ return String(value||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' '); }
function levenshtein(left,right){ const row=Array.from({length:right.length+1},(_,index)=>index); for(let leftIndex=1;leftIndex<=left.length;leftIndex++){ let previous=row[0]; row[0]=leftIndex; for(let rightIndex=1;rightIndex<=right.length;rightIndex++){ const current=row[rightIndex]; row[rightIndex]=left[leftIndex-1]===right[rightIndex-1]?previous:Math.min(previous+1,row[rightIndex-1]+1,current+1); previous=current; } } return row[right.length]; }
function isAnswerCorrect(answer,expected){ const left=normalizeAnswer(answer), right=normalizeAnswer(expected); if(!left||!right) return false; if(left===right) return true; if(left.replace(/\s/g,'')===right.replace(/\s/g,'')&&right.length>5) return true; if(right.length<5) return false; const distance=levenshtein(left,right), allowed=right.length>20?3:right.length>10?2:1; return distance<=allowed&&distance/Math.max(left.length,right.length)<=0.18; }
function submitQuizAnswer(){
  if(quizState.answered) return;
  const answer=el('quiz-answer').value.trim(); if(!answer){ showToast(t('answerRequired')); el('quiz-answer').focus(); return; }
  const term=quizState.terms[quizState.currentIndex], correct=isAnswerCorrect(answer,term.meaning), termBeforeAnswer={...term}, streakBeforeAnswer=quizState.currentStreak; quizState.answered=true; quizState.pendingAnswer={termId:term.id,termBeforeAnswer,streakBeforeAnswer,correct,selfCorrected:false};
  if(correct){ quizState.correct++; quizState.currentStreak++; quizState.maxStreak=Math.max(quizState.maxStreak,quizState.currentStreak); } else { quizState.incorrect++; quizState.currentStreak=0; if(!quizState.missedIds.includes(term.id)) quizState.missedIds.push(term.id); }
  quizState.terms[quizState.currentIndex]=updateTermAfterAnswer(term,correct); saveTerms(); renderTerms(); renderWordStats(); updateQuizScore();
  el('quiz-answer').disabled=true; el('quiz-check').disabled=true; renderQuizFeedback();
}
function acceptSelfCorrectAnswer(){
  const pending=quizState.pendingAnswer; if(!quizState.answered||!pending||pending.correct||pending.selfCorrected) return;
  const storedIndex=terms.findIndex(item=>item.id===pending.termId&&item.profileId===profile.id); if(storedIndex<0) return;
  terms[storedIndex]=pending.termBeforeAnswer;
  const correctedTerm=updateTermAfterAnswer(pending.termBeforeAnswer,true); quizState.terms[quizState.currentIndex]=correctedTerm; quizState.incorrect=Math.max(0,quizState.incorrect-1); quizState.correct++; quizState.currentStreak=pending.streakBeforeAnswer+1; quizState.maxStreak=Math.max(quizState.maxStreak,quizState.currentStreak); quizState.missedIds=quizState.missedIds.filter(id=>id!==pending.termId); pending.correct=true; pending.selfCorrected=true;
  saveTerms(); renderTerms(); renderWordStats(); updateQuizScore(); renderQuizFeedback();
}
function nextQuizQuestion(){ if(!quizState.answered) return; if(quizState.currentIndex>=quizState.terms.length-1){ renderQuizResult(); return; } quizState.currentIndex++; renderQuizQuestion(); }
function recordQuizStats(){
  if(quizState.recorded) return; const stats=getProfileTestStats(), total=quizState.terms.length; stats.tests++; stats.answers+=total; stats.correct+=quizState.correct; stats.incorrect+=quizState.incorrect; const day=stats.days[todayKey]||{tests:0,reviewed:0,correct:0,incorrect:0}; day.tests=(Number(day.tests)||0)+1; day.reviewed=(Number(day.reviewed)||0)+total; day.correct=(Number(day.correct)||0)+quizState.correct; day.incorrect=(Number(day.incorrect)||0)+quizState.incorrect; stats.days[todayKey]=day; quizState.recorded=true; saveTestStats();
}
function renderQuizResult(){
  quizState.screen='result'; recordQuizStats(); el('quiz-start').classList.add('hidden'); el('quiz-question').classList.add('hidden'); el('quiz-result').classList.remove('hidden'); const total=quizState.terms.length, percent=total?Math.round(quizState.correct/total*100):0; el('quiz-result-correct').textContent=quizState.correct; el('quiz-result-total').textContent=total; el('quiz-result-percent').textContent=`${percent}%`; el('quiz-result-incorrect').textContent=quizState.incorrect; el('quiz-result-streak').textContent=quizState.maxStreak; el('quiz-result-reviewed').textContent=total;
  const missedTerms=quizState.missedIds.map(id=>getCurrentTerms().find(term=>term.id===id)).filter(Boolean), missedBox=el('quiz-missed'), missedList=el('quiz-missed-list'); missedList.innerHTML=missedTerms.map(term=>`<span>${escapeHtml(term.word)}</span>`).join(''); missedBox.classList.toggle('hidden',!missedTerms.length); el('quiz-repeat-errors').hidden=!missedTerms.length; renderWordStats();
}
function renderWordStats(){
  const currentTerms=getCurrentTerms(), total=currentTerms.length, known=currentTerms.filter(term=>getDailyTermStatus(term)==='known').length, learning=currentTerms.filter(term=>getDailyTermStatus(term)==='learning').length, difficult=currentTerms.filter(isTermDifficult).length, stats=getProfileTestStats(), today=getDayTestStats(stats.days[todayKey]), monthStart=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`, month=aggregateTestStats(monthStart,todayKey), all=aggregateTestStats();
  el('word-stat-total').textContent=total; el('word-stat-known').textContent=known; el('word-stat-learning').textContent=learning; el('word-stat-difficult').textContent=difficult; el('word-progress-known').textContent=known; el('word-progress-total').textContent=total; const progress=total?Math.round(known/total*100):0; el('word-progress-percent').textContent=`${progress}%`; el('word-progress-bar').style.width=`${progress}%`;
  const todayAccuracy=today.answers?Math.round(today.correct/today.answers*100):0, monthAccuracy=month.answers?Math.round(month.correct/month.answers*100):0, allAccuracy=all.answers?Math.round(all.correct/all.answers*100):0; el('word-today-reviewed').textContent=today.answers; el('word-today-correct').textContent=today.correct; el('word-today-accuracy').textContent=`${todayAccuracy}%`; el('word-month-tests').textContent=month.tests; el('word-month-answers').textContent=month.answers; el('word-month-accuracy').textContent=`${monthAccuracy}%`; el('word-all-tests').textContent=all.tests; el('word-all-answers').textContent=all.answers; el('word-all-accuracy').textContent=`${allAccuracy}%`;
}
function showTermCategory(category){ termCategoryFilter=category; termSearchQuery=''; setTestMode('library'); renderTerms(); }

function svgNode(tag, attrs={}){ const node=document.createElementNS('http://www.w3.org/2000/svg',tag); Object.entries(attrs).forEach(([key,value])=>node.setAttribute(key,value)); return node; }
function renderDailyChart(chartId, emptyId, rangeId, days, points, valueKey, yMax, isPercent){
  const chart=el(chartId); if(!chart) return [];
  const width=760,height=300,left=48,right=15,top=18,bottom=42,plotW=width-left-right,plotH=height-top-bottom;
  chart.innerHTML='';
  const recordedPoints=points.filter(point=>point[valueKey]!==null);
  [0,25,50,75,100].forEach(value=>{ const y=top+plotH-(value/100)*plotH; chart.appendChild(svgNode('line',{x1:left,y1:y,x2:width-right,y2:y,class:'chart-grid-line'})); const label=svgNode('text',{x:left-10,y:y+4,'text-anchor':'end',class:'chart-scale-label'}); label.textContent=isPercent?t('chartPercent',{value}):t('chartMinutes',{value:Math.round(yMax*value/100)}); chart.appendChild(label); });
  const xAt=index=>days.length===1?left+plotW/2:left+(index/(days.length-1))*plotW;
  const yAt=value=>top+plotH-(value/yMax)*plotH;
  if(recordedPoints.length>1){ const path=svgNode('path',{d:recordedPoints.map((point,index)=>`${index?'L':'M'} ${xAt(point.index)} ${yAt(point[valueKey])}`).join(' '),class:'chart-line'}); chart.appendChild(path); }
  recordedPoints.forEach(point=>{ chart.appendChild(svgNode('circle',{cx:xAt(point.index),cy:yAt(point[valueKey]),r:5,class:'chart-point'})); const value=svgNode('text',{x:xAt(point.index),y:yAt(point[valueKey])-11,'text-anchor':'middle',class:'chart-point-label'}); value.textContent=isPercent?t('chartPercent',{value:point[valueKey]}):t('chartMinutes',{value:point[valueKey]}); chart.appendChild(value); });
  points.forEach((point,index)=>{ if(days.length>8&&index%2===1&&index!==days.length-1)return; const label=svgNode('text',{x:xAt(index),y:height-15,'text-anchor':'middle',class:'chart-date-label'}); label.textContent=`${point.date.getDate()} ${MONTHS_GEN[point.date.getMonth()].slice(0,3)}`; chart.appendChild(label); });
  el(rangeId).textContent=days.length?`${formatDate(days[0])} — ${formatDate(days[days.length-1])}`:t('noPeriod'); el(emptyId).classList.toggle('visible',recordedPoints.length===0);
  return recordedPoints;
}
function renderProgress(){
  const chart=el('progress-chart'); if(!chart) return;
  const startDate=parseKey(profile.startDate), monthStart=new Date(now.getFullYear(),now.getMonth(),1), monthEnd=new Date(now.getFullYear(),now.getMonth()+1,0);
  const rangeStart=startDate>monthStart?startDate:monthStart, days=[]; for(let d=new Date(rangeStart); d<=monthEnd; d.setDate(d.getDate()+1)) days.push(new Date(d));
  const points=days.map((date,index)=>{ const key=toKey(date), entry=hasDiaryEntry(key)?entries[key]:null; return {date,key,index,minutes:entry?Math.max(0,Number(entry.minutes)||0):null,progress:entry?Math.max(0,Math.min(100,Number(entry.progress)||0)):null}; });
  const progressPoints=renderDailyChart('progress-chart','progress-empty','progress-chart-range',days,points,'progress',100,true);
  const maxMinutes=points.reduce((max,point)=>Math.max(max,point.minutes??0),0), yMax=maxMinutes?Math.max(60,Math.ceil(maxMinutes/30)*30):60;
  renderDailyChart('time-chart','time-empty','time-chart-range',days,points,'minutes',yMax,false);
  const totalMinutes=progressPoints.reduce((sum,item)=>sum+item.minutes,0), weightedProgress=totalMinutes?Math.round(progressPoints.reduce((sum,item)=>sum+item.progress*item.minutes,0)/totalMinutes):progressPoints.length?Math.round(progressPoints.reduce((sum,item)=>sum+item.progress,0)/progressPoints.length):0;
  el('average-progress').textContent=`${weightedProgress}%`; el('progress-days').textContent=progressPoints.length;
  renderWeeklyGoal();
}
function updateDateLabels(){
  const labels=i18n.getDateLabels();
  MONTHS=labels.months; MONTHS_GEN=labels.monthsGen; WEEKDAYS_LONG=labels.weekdaysLong; WEEKDAYS=labels.weekdays;
}
function refreshLocalizedView(){
  updateDateLabels();
  i18n.applyStaticTranslations();
  el('greeting-name').textContent=profile.name;
  el('user-avatar').textContent=getInitials(profile.name);
  updateTodayUi();
  renderProfile(); renderCalendar(); renderForm(); renderRecent(); calcStats(); renderMaterials(); renderSongs(); renderTerms(); renderWordStats();
  if(quizState.screen==='question') renderQuizFeedback();
  else if(quizState.screen==='result') renderQuizResult();
  else renderQuizStart();
}

el('entry-form').addEventListener('submit',e=>{ e.preventDefault(); const key=toKey(selectedDate); if(key<profile.startDate){ showToast(t('startDateRequired')); return; } const training=el('training').value.trim(), assignment=el('assignment').value.trim(), teacherSession=el('teacher-session').checked; if(!training && !assignment && !el('minutes').value&&!teacherSession){ showToast(t('entryRequired')); return; } const previousEntry=entries[key]||{}; entries[key]={...previousEntry,training,assignment,minutes:Number(el('minutes').value)||0,progress:Number(el('progress').value)||0,teacherSession}; saveEntries(); renderCalendar(); renderForm(); renderRecent(); calcStats(); closeMobileEntry(); showToast(t('entrySaved')); });
el('delete-entry').addEventListener('click',()=>{ const key=toKey(selectedDate); if(!entries[key]){ showToast(t('noEntry')); return; } removeEntry(key); });
el('progress').addEventListener('input',updateRange);
el('weekly-goal-edit').addEventListener('click',openWeeklyGoalModal);
el('weekly-goal-modal-close').addEventListener('click',closeWeeklyGoalModal);
el('weekly-goal-cancel').addEventListener('click',closeWeeklyGoalModal);
el('weekly-goal-modal').addEventListener('click',event=>{ if(event.target.id==='weekly-goal-modal') closeWeeklyGoalModal(); });
el('weekly-goal-form').addEventListener('submit',event=>{ event.preventDefault(); if(!updateWeeklyGoal(el('weekly-goal-editor').value)){ showToast(t('weeklyGoalInvalid')); el('weekly-goal-editor').focus(); return; } closeWeeklyGoalModal(); showToast(t('weeklyGoalUpdated')); });
el('prev-month').addEventListener('click',()=>{ calendarDate.setMonth(calendarDate.getMonth()-1); renderCalendar(); });
el('next-month').addEventListener('click',()=>{ calendarDate.setMonth(calendarDate.getMonth()+1); renderCalendar(); });
el('today-button').addEventListener('click',()=>{ selectedDate=new Date(now.getFullYear(),now.getMonth(),now.getDate()); calendarDate=new Date(now.getFullYear(),now.getMonth(),1); renderCalendar(); renderForm(); if(window.matchMedia('(max-width:700px)').matches) openMobileEntry(); });
el('show-all').addEventListener('click',()=>{ document.querySelector('.recent-section').scrollIntoView({behavior:'smooth'}); });
document.querySelectorAll('[data-view]').forEach(btn=>btn.addEventListener('click',()=>{ if(btn.dataset.view==='profile') renderProfile(); switchView(btn.dataset.view); if(btn.closest('.mobile-drawer')) closeMobileDrawer(); }));
document.querySelectorAll('[data-go-journal]').forEach(btn=>btn.addEventListener('click',()=>switchView('journal')));
document.querySelectorAll('[data-test-mode]').forEach(btn=>btn.addEventListener('click',()=>setTestMode(btn.dataset.testMode)));
el('song-search').addEventListener('input',event=>{ songSearchQuery=event.target.value; renderSongs(); });
el('song-detail-back').addEventListener('click',closeSongDetail);
el('song-detail-edit').addEventListener('click',()=>{ if(openedSongId) editSong(openedSongId); });
el('song-font-decrease').addEventListener('click',()=>changeSongFontSize(-10));
el('song-font-increase').addEventListener('click',()=>changeSongFontSize(10));
el('song-form').addEventListener('submit',event=>{
  event.preventDefault();
  const title=el('song-title').value.trim(), artist=el('song-artist').value.trim(), chords=el('song-chords').value.trim(), lyrics=el('song-lyrics').value.trim();
  if(!title||!chords||!lyrics){ showToast(t('songRequired')); return; }
  const timestamp=new Date().toISOString();
  if(editingSongId){
    const index=songs.findIndex(song=>song.id===editingSongId&&song.profileId===profile.id);
    if(index>=0) songs[index]={...songs[index],title,artist,chords,lyrics,updatedAt:timestamp};
    showToast(t('songUpdated'));
  } else {
    songs.push({id:createLocalId('song'),profileId:profile.id,title,artist,chords,lyrics,createdAt:timestamp,updatedAt:timestamp}); showToast(t('songAdded'));
  }
  saveSongs(); resetSongForm(); renderSongs();
});
el('cancel-song-edit').addEventListener('click',resetSongForm);
el('term-search').addEventListener('input',event=>{ termSearchQuery=event.target.value; renderTerms(); });
el('term-filter-clear').addEventListener('click',()=>{ termCategoryFilter='all'; renderTerms(); });
document.querySelectorAll('[data-word-category]').forEach(button=>button.addEventListener('click',()=>showTermCategory(button.dataset.wordCategory)));
el('term-form').addEventListener('submit',event=>{
  event.preventDefault();
  const word=el('term-word').value.trim(), meaning=el('term-meaning').value.trim(), category=el('term-category').value.trim();
  if(!word||!meaning){ showToast(t('termRequired')); return; }
  const timestamp=new Date().toISOString();
  if(editingTermId){
    const term=terms.find(item=>item.id===editingTermId&&item.profileId===profile.id);
    if(term){ term.word=word; term.meaning=meaning; term.category=category; term.updatedAt=timestamp; showToast(t('termUpdated')); }
  } else {
    terms.push({id:createLocalId('term'),profileId:profile.id,word,meaning,category,attempts:0,correctCount:0,incorrectCount:0,wrongCount:0,knowledgeLevel:'new',consecutiveCorrect:0,createdAt:timestamp,updatedAt:timestamp,lastReviewedAt:null,lastIncorrectAt:null,dailyStats:{}}); showToast(t('termAdded'));
  }
  saveTerms(); resetTermForm(); renderTerms(); renderWordStats();
});
el('cancel-term-edit').addEventListener('click',resetTermForm);
document.querySelectorAll('[data-quiz-filter]').forEach(btn=>btn.addEventListener('click',()=>{ quizSetup.filter=btn.dataset.quizFilter; renderQuizStart(); }));
document.querySelectorAll('[data-quiz-size]').forEach(btn=>btn.addEventListener('click',()=>{ quizSetup.size=btn.dataset.quizSize; renderQuizStart(); }));
el('quiz-start-button').addEventListener('click',()=>startQuiz(quizSetup.size,false,quizSetup.filter));
el('quiz-repeat-difficult').addEventListener('click',()=>startQuiz('all',false,'difficult'));
el('quiz-repeat-errors').addEventListener('click',()=>startQuiz('all',false,'errors'));
el('quiz-check').addEventListener('click',submitQuizAnswer);
el('quiz-self-correct').addEventListener('click',acceptSelfCorrectAnswer);
el('quiz-next').addEventListener('click',nextQuizQuestion);
el('quiz-answer').addEventListener('keydown',event=>{ if((event.ctrlKey||event.metaKey)&&event.key==='Enter') submitQuizAnswer(); });
el('quiz-retry').addEventListener('click',()=>startQuiz(quizState.selection,quizState.repeatOnly,quizState.baseFilter));
el('mobile-menu-toggle').addEventListener('click',()=>setMobileDrawer(true));
el('mobile-drawer-close').addEventListener('click',closeMobileDrawer);
el('mobile-drawer-scrim').addEventListener('click',closeMobileDrawer);
el('mobile-entry-open').addEventListener('click',openMobileEntry);
el('mobile-entry-close').addEventListener('click',closeMobileEntry);
el('mobile-entry-backdrop').addEventListener('click',closeMobileEntry);
document.addEventListener('keydown',event=>{ if(event.key==='Escape'){ closeMobileDrawer(); closeMobileEntry(); closeWeeklyGoalModal(); closeInsightModal(); closeFavoriteModal(); closeFavoriteDetail(); } });
el('insight-edit').addEventListener('click',()=>openInsightModal(todayKey));
el('insight-delete').addEventListener('click',()=>removeInsight(todayKey));
el('new-insight').addEventListener('click',()=>openInsightModal(toKey(selectedDate)));
el('insight-modal-close').addEventListener('click',closeInsightModal);
el('insight-cancel').addEventListener('click',closeInsightModal);
el('insight-modal').addEventListener('click',event=>{ if(event.target.id==='insight-modal') closeInsightModal(); });
el('insight-form').addEventListener('submit',event=>{
  event.preventDefault();
  const key=el('insight-date').value, text=el('insight-text').value.trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(key)){ showToast(t('insightDateRequired')); return; }
  if(!text){ showToast(t('insightRequired')); el('insight-text').focus(); return; }
  if(editingInsightKey && editingInsightKey!==key) delete dailyInsights[editingInsightKey];
  dailyInsights[key]=text; saveInsights(); closeInsightModal(); renderInsight(); renderMaterials(); showToast(t('insightSaved'));
});
el('new-favorite').addEventListener('click',()=>openFavoriteModal());
el('favorite-modal-close').addEventListener('click',closeFavoriteModal);
el('favorite-cancel').addEventListener('click',closeFavoriteModal);
el('favorite-modal').addEventListener('click',event=>{ if(event.target.id==='favorite-modal') closeFavoriteModal(); });
el('favorite-form').addEventListener('submit',event=>{
  event.preventDefault();
  const title=el('favorite-title').value.trim(), content=el('favorite-text').value.trim();
  if(!title||!content){ showToast(t('favoriteRequired')); return; }
  const timestamp=new Date().toISOString();
  if(editingFavoriteId){ const favorite=favorites.find(item=>item.id===editingFavoriteId&&item.profileId===profile.id); if(favorite){ favorite.title=title; favorite.content=content; favorite.updatedAt=timestamp; showToast(t('favoriteUpdated')); } }
  else { favorites.push({id:createLocalId('favorite'),profileId:profile.id,title,content,createdAt:timestamp,updatedAt:timestamp}); showToast(t('favoriteAdded')); }
  saveFavorites(); closeFavoriteModal(); renderMaterials();
});
el('favorite-detail-close').addEventListener('click',closeFavoriteDetail);
el('favorite-detail-modal').addEventListener('click',event=>{ if(event.target.id==='favorite-detail-modal') closeFavoriteDetail(); });
el('favorite-detail-edit').addEventListener('click',()=>{ if(openedFavoriteId) editFavorite(openedFavoriteId); });
el('favorite-detail-delete').addEventListener('click',()=>{ if(openedFavoriteId) removeFavorite(openedFavoriteId); });
el('favorite-search').addEventListener('input',renderFavoriteList);
document.querySelectorAll('[data-language-option]').forEach(button=>button.addEventListener('click',()=>i18n.setLanguage(button.dataset.languageOption,true)));
window.addEventListener('guitar-diary-language-change',refreshLocalizedView);
updateTodayUi();
el('greeting-name').textContent=profile.name;
el('user-avatar').textContent=getInitials(profile.name);
el('profile-form').addEventListener('submit',event=>{
  event.preventDefault();
  const name=el('profile-name').value.trim(), startDate=el('profile-start-date').value;
  if(!name || !startDate){ showToast(t('profileRequired')); return; }
  profile={...profile,name,startDate}; saveProfile();
  el('greeting-name').textContent=profile.name; el('user-avatar').textContent=getInitials(profile.name); el('profile-avatar').textContent=getInitials(profile.name);
  if(toKey(selectedDate)<profile.startDate) selectedDate=parseKey(profile.startDate);
  calendarDate=new Date(selectedDate.getFullYear(),selectedDate.getMonth(),1);
  renderCalendar(); renderForm(); calcStats(); showToast(t('profileSaved'));
});
el('new-profile').addEventListener('click',()=>{
  if(!window.confirm(t('newProfileConfirm'))) return;
  const freshName=telegramUser?[telegramUser.first_name,telegramUser.last_name].filter(Boolean).join(' ').trim()||t('newStudent'):t('newStudent'); profile={id:createLocalId('profile'),name:freshName,startDate:todayKey,weeklyGoal:DEFAULT_WEEKLY_GOAL}; if(telegramUser?.username) profile.telegramUsername=telegramUser.username; entries={}; dailyInsights={}; favorites=[]; terms=[]; songs=[]; testStats={}; saveProfile(); saveEntries(); saveInsights(); saveFavorites(); saveTerms(); saveSongs(); saveTestStats();
  selectedDate=new Date(now.getFullYear(),now.getMonth(),now.getDate()); calendarDate=new Date(now.getFullYear(),now.getMonth(),1);
  el('greeting-name').textContent=profile.name; el('user-avatar').textContent=getInitials(profile.name); renderProfile(); renderInsight(); renderMaterials(); renderSongs(); renderTerms(); renderQuizStart(); renderWordStats(); renderCalendar(); renderForm(); renderRecent(); calcStats(); showToast(t('profileCreated'));
});
renderMaterials();
renderProfile();
renderSongs();
renderTerms();
renderWordStats();
renderCalendar(); renderForm(); renderRecent(); calcStats();
refreshLocalizedView();
setInterval(refreshToday,60000);
document.addEventListener('visibilitychange',()=>{ if(!document.hidden) refreshToday(); });

function getBackupData(){
  if(!backupTools) throw new Error('Модуль резервного копирования недоступен.');
  return backupTools.createBackup({
    language:i18n.getLanguage(),
    profile,
    entries,
    insights:dailyInsights,
    favorites:favorites.filter(favorite=>favorite.profileId===profile.id),
    terms:terms.filter(term=>term.profileId===profile.id),
    songs:songs.filter(song=>song.profileId===profile.id),
    testStats:testStats[profile.id]||null,
    visits:getCurrentVisitDays(),
    songFontSize
  });
}
function createBackupFile(){
  const backup=getBackupData(), json=backupTools.serializeBackup(backup), fileName=backupTools.getFileName(), blob=new Blob([json],{type:'application/json;charset=utf-8'});
  let file=null;
  if(typeof File==='function'){
    try{ file=new File([blob],fileName,{type:'application/json'}); }catch(error){ console.error('Backup File creation failed',error); }
  }
  return {blob,file,fileName};
}
async function exportBackup(){
  try{
    const {blob,file,fileName}=createBackupFile();
    let canShareFiles=false;
    if(typeof navigator!=='undefined'&&file&&typeof navigator.share==='function'&&typeof navigator.canShare==='function'){
      try{ canShareFiles=navigator.canShare({files:[file]}); }catch(error){ console.error('Backup share detection failed',error); }
    }
    if(canShareFiles){
      try{ await navigator.share({files:[file],title:t('backupTitle')}); showToast(t('backupSent')); return; }
      catch(error){ if(error?.name==='AbortError') return; console.error('Backup share failed',error); }
    }
    if(typeof URL==='undefined'||typeof URL.createObjectURL!=='function'||typeof URL.revokeObjectURL!=='function') throw new Error('Download fallback unavailable.');
    const url=URL.createObjectURL(blob), link=document.createElement('a');
    try{ link.href=url; link.download=fileName; link.style.display='none'; document.body.append(link); link.click(); link.remove(); }
    finally{ window.setTimeout(()=>URL.revokeObjectURL(url),0); }
    showToast(t('backupDownloaded'));
  }catch(error){ console.error('Backup export failed',error); showToast(t('backupExportFailed')); }
}
function readBackupFile(file){
  return new Promise((resolve,reject)=>{
    if(typeof FileReader!=='function'){ const error=new Error('Чтение файлов недоступно.'); error.code='FILE_READ_FAILED'; reject(error); return; }
    const reader=new FileReader();
    reader.onload=()=>resolve(typeof reader.result==='string'?reader.result:'');
    reader.onerror=()=>{ const error=new Error('Не удалось прочитать файл.'); error.code='FILE_READ_FAILED'; reject(error); };
    reader.onabort=()=>{ const error=new Error('Чтение файла отменено.'); error.code='FILE_READ_ABORTED'; reject(error); };
    try{ reader.readAsText(file); }catch(error){ error.code='FILE_READ_FAILED'; reject(error); }
  });
}
function prepareImportedState(data){
  const importedProfile={...data.profile,id:data.profile.id||createLocalId('profile'),weeklyGoal:normalizeWeeklyGoal(data.profile.weeklyGoal)};
  const importedFavorites=data.favorites.map(favorite=>{ const normalized=normalizeFavorite(favorite,importedProfile.id); return normalized?{...normalized,profileId:importedProfile.id}:null; }).filter(Boolean);
  const importedTerms=data.terms.map(term=>{ const normalized=normalizeTerm(term,importedProfile.id); return normalized?{...normalized,profileId:importedProfile.id}:null; }).filter(Boolean);
  const importedSongs=data.songs.map(song=>{ const normalized=normalizeSong(song,importedProfile.id); return normalized?{...normalized,profileId:importedProfile.id}:null; }).filter(Boolean);
  const importedVisits=new Set(Array.isArray(data.visits)?data.visits:[]); importedVisits.add(todayKey);
  return {language:i18n.normalizeLanguage(data.language)||i18n.getLanguage(),profile:importedProfile,entries:{...data.entries},dailyInsights:{...data.insights},favorites:importedFavorites,terms:importedTerms,songs:importedSongs,testStats:data.testStats?{[importedProfile.id]:data.testStats}:{},visitDays:{[importedProfile.id]:Array.from(importedVisits).sort()},songFontSize:normalizeSongFontSize(data.songFontSize===undefined?100:data.songFontSize)};
}
function getImportedStorageValues(state){
  return {
    [LANGUAGE_KEY]:state.language,
    [PROFILE_KEY]:JSON.stringify(state.profile),
    [STORAGE_KEY]:JSON.stringify(state.entries),
    [INSIGHTS_KEY]:JSON.stringify(state.dailyInsights),
    [FAVORITES_KEY]:JSON.stringify(state.favorites),
    [TERMS_KEY]:JSON.stringify(state.terms),
    [SONGS_KEY]:JSON.stringify(state.songs),
    [TEST_STATS_KEY]:JSON.stringify(state.testStats),
    [VISITS_KEY]:JSON.stringify(state.visitDays),
    [SONG_FONT_SIZE_KEY]:String(state.songFontSize)
  };
}
function applyImportedState(state){
  backupTools.replaceStorageAtomically(localStorage,getImportedStorageValues(state));
  i18n.setLanguage(state.language,false);
  profile=state.profile; entries=state.entries; dailyInsights=state.dailyInsights; favorites=state.favorites; terms=state.terms; songs=state.songs; testStats=state.testStats; visitDays=state.visitDays; songFontSize=state.songFontSize;
  termSearchQuery=''; termCategoryFilter='all'; songSearchQuery=''; openedSongId=null; editingSongId=null; editingTermId=null; editingFavoriteId=null; openedFavoriteId=null;
  quizState={terms:[],currentIndex:0,correct:0,incorrect:0,answered:false,pendingAnswer:null,screen:'start',selection:'all',repeatOnly:false,filter:'all',baseFilter:'all',missedIds:[],currentStreak:0,maxStreak:0,recorded:false};
  el('quiz-start').classList.remove('hidden'); el('quiz-question').classList.add('hidden'); el('quiz-result').classList.add('hidden');
  if(toKey(selectedDate)<profile.startDate) selectedDate=parseKey(profile.startDate);
  calendarDate=new Date(selectedDate.getFullYear(),selectedDate.getMonth(),1);
  el('greeting-name').textContent=profile.name; el('user-avatar').textContent=getInitials(profile.name);
  renderProfile(); renderInsight(); renderMaterials(); renderSongs(); renderTerms(); renderQuizStart(); renderWordStats(); renderCalendar(); renderForm(); renderRecent(); calcStats();
}
function backupImportErrorMessage(error){
  switch(error?.code){
    case 'EMPTY_FILE': return t('backupEmpty');
    case 'INVALID_JSON': return t('backupJson');
    case 'INVALID_ROOT': return t('backupRoot');
    case 'INVALID_APP': return t('backupApp');
    case 'UNSUPPORTED_VERSION': return t('backupVersion');
    case 'MISSING_DATA': return t('backupData');
    case 'INVALID_DATA': return t('backupStructure');
    case 'FILE_READ_FAILED': return t('fileRead');
    case 'FILE_READ_ABORTED': return t('fileAborted');
    case 'STORAGE_ROLLBACK_FAILED':
    case 'STORAGE_WRITE_FAILED': return t('storage');
    default: return t('backupGeneric');
  }
}
async function importBackupFile(event){
  const input=event.target, file=input.files?.[0]; input.value='';
  if(!file) return;
  if(!/\.json$/i.test(String(file.name||''))&&file.type!=='application/json'){ showToast(t('jsonOnly')); return; }
  try{
    const text=await readBackupFile(file), backup=backupTools.parseBackupText(text);
    if(!window.confirm(t('restoreConfirm'))) return;
    applyImportedState(prepareImportedState(backup.data)); showToast(t('backupRestored'));
  }catch(error){ console.error('Backup import failed',error); showToast(backupImportErrorMessage(error)); }
}
// Перенос дневника между телефоном и компьютером без сервера.
el('export-data').addEventListener('click',exportBackup);
el('import-data').addEventListener('click',()=>el('import-file').click());
el('import-file').addEventListener('change',importBackupFile);
if('serviceWorker' in navigator && location.protocol!=='file:'){
  const hadController=Boolean(navigator.serviceWorker.controller); let refreshing=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{ if(!hadController||refreshing) return; refreshing=true; window.location.reload(); });
  window.addEventListener('load',()=>{ navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).then(registration=>registration.update()).catch(()=>{}); });
}
