(() => {
  'use strict';

  const screen = document.getElementById('metronome-screen');
  const toolsPanel = document.getElementById('home-tools');
  if (!screen || !toolsPanel) return;

  const get = id => document.getElementById(id);
  const MIN_BPM = 30;
  const MAX_BPM = 240;
  const INITIAL_BPM = 65;
  const DIAL_CENTER = 160;
  const DIAL_RADIUS = 137;
  const DIAL_START = 135;
  const DIAL_END = 405;
  const DIAL_SWEEP = DIAL_END - DIAL_START;
  const LOOKAHEAD_MS = 25;
  const SCHEDULE_AHEAD_SECONDS = 0.1;

  let bpm = INITIAL_BPM;
  let timeSignature = '4/4';
  let beatCount = 4;
  let audioContext = null;
  let schedulerTimer = null;
  let nextNoteTime = 0;
  let currentBeat = 0;
  let running = false;
  let starting = false;
  let pointerId = null;
  let touchActive = false;
  let dialAngle = bpmToAngle(INITIAL_BPM);
  let screenMounted = false;
  const scheduledOscillators = new Set();
  const indicatorTimers = new Set();

  const chooser = toolsPanel.querySelector('.music-tool-choices');
  const metronomeButton = toolsPanel.querySelector('[data-music-tool="metronome"]');
  const tunerButton = toolsPanel.querySelector('[data-music-tool="tuner"]');
  const dial = get('metronome-dial');
  const ticks = get('metronome-ticks');
  const labels = get('metronome-dial-labels');
  const marker = get('metronome-dial-marker');
  const beats = get('metronome-beats');
  const signatureSheet = get('metronome-signature-sheet');
  const dialog = get('home-dialog');
  const fallbackBackdrop = get('home-dialog-fallback-backdrop');
  const testSoundButton = get('metronome-test-sound');
  const debugOutput = get('metronome-debug-output');
  const debugLines = [];

  function debugAudio(message) {
    const line = `${new Date().toISOString().slice(11, 23)} ${message}`;
    debugLines.push(line);
    while (debugLines.length > 18) debugLines.shift();
    if (debugOutput) debugOutput.textContent = debugLines.join('\n');
    console.log('[Metronome]', message);
  }

  function formatAudioTime(value) {
    return Number.isFinite(value) ? value.toFixed(3) : 'n/a';
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function bpmToAngle(value) {
    return DIAL_START + ((value - MIN_BPM) / (MAX_BPM - MIN_BPM)) * DIAL_SWEEP;
  }

  function angleToBpm(angle) {
    return Math.round(MIN_BPM + ((angle - DIAL_START) / DIAL_SWEEP) * (MAX_BPM - MIN_BPM));
  }

  function polarPoint(angle, radius) {
    const radians = angle * Math.PI / 180;
    return { x: DIAL_CENTER + Math.cos(radians) * radius, y: DIAL_CENTER + Math.sin(radians) * radius };
  }

  function renderDial() {
    if (!ticks || !labels || !marker) return;
    const tickCount = MAX_BPM - MIN_BPM;
    const activeIndex = Math.round(((bpm - MIN_BPM) / (MAX_BPM - MIN_BPM)) * tickCount);
    const tickMarkup = [];
    for (let index = 0; index <= tickCount; index += 1) {
      const angle = DIAL_START + (index / tickCount) * DIAL_SWEEP;
      const major = index % 10 === 0 || index === tickCount;
      const outer = polarPoint(angle, DIAL_RADIUS);
      const inner = polarPoint(angle, major ? DIAL_RADIUS - 14 : DIAL_RADIUS - 9);
      const color = index <= activeIndex ? 'var(--orange)' : 'var(--dial-muted)';
      tickMarkup.push(`<line x1="${inner.x.toFixed(2)}" y1="${inner.y.toFixed(2)}" x2="${outer.x.toFixed(2)}" y2="${outer.y.toFixed(2)}" class="metronome-tick${major ? ' major' : ''}" stroke="${color}" />`);
    }
    ticks.innerHTML = tickMarkup.join('');
    const labelValues = [30, 75, 135, 195, 240];
    labels.innerHTML = labelValues.map(value => {
      const point = polarPoint(bpmToAngle(value), 101);
      return `<text x="${point.x.toFixed(2)}" y="${point.y.toFixed(2)}" class="metronome-dial-label" text-anchor="middle" dominant-baseline="middle">${value}</text>`;
    }).join('');
    const activePoint = polarPoint(dialAngle, DIAL_RADIUS + 1);
    marker.setAttribute('cx', activePoint.x.toFixed(2));
    marker.setAttribute('cy', activePoint.y.toFixed(2));
    dial?.setAttribute('aria-valuenow', String(bpm));
  }

  function renderBpm() {
    const output = get('metronome-bpm-value');
    if (output) output.textContent = String(bpm);
    const decrease = get('metronome-decrease');
    const increase = get('metronome-increase');
    if (decrease) decrease.disabled = bpm <= MIN_BPM;
    if (increase) increase.disabled = bpm >= MAX_BPM;
    dialAngle = bpmToAngle(bpm);
    renderDial();
  }

  function setBpm(value) {
    bpm = clamp(Math.round(Number(value) || INITIAL_BPM), MIN_BPM, MAX_BPM);
    renderBpm();
  }

  function incrementBpm() { setBpm(bpm + 1); }
  function decrementBpm() { setBpm(bpm - 1); }

  function renderBeatIndicators(activeBeat = -1) {
    if (!beats) return;
    beats.innerHTML = Array.from({ length: beatCount }, (_, index) => `<i class="metronome-beat${index === 0 ? ' accent' : ''}${index === activeBeat ? ' active' : ''}" aria-label="Доля ${index + 1}"></i>`).join('');
  }

  function updateBeatIndicators(beat) {
    if (!beats) return;
    [...beats.children].forEach((element, index) => element.classList.toggle('active', index === beat));
  }

  function clearIndicatorTimers() {
    indicatorTimers.forEach(timer => window.clearTimeout(timer));
    indicatorTimers.clear();
  }

  function scheduleIndicator(beat, time) {
    if (!audioContext) return;
    const delay = Math.max(0, (time - audioContext.currentTime) * 1000);
    const timer = window.setTimeout(() => {
      indicatorTimers.delete(timer);
      if (running) updateBeatIndicators(beat);
    }, delay);
    indicatorTimers.add(timer);
  }

  function stopScheduledOscillators() {
    scheduledOscillators.forEach(oscillator => {
      try { oscillator.stop(); } catch (_) { /* already ended */ }
      try { oscillator.disconnect(); } catch (_) { /* already disconnected */ }
    });
    scheduledOscillators.clear();
  }

  function scheduleBeat(beat, time) {
    if (!audioContext) return;
    const now = audioContext.currentTime;
    const scheduledTime = Math.max(time, now + 0.005);
    debugAudio(`scheduleBeat() beat=${beat + 1} scheduled=${formatAudioTime(scheduledTime)} current=${formatAudioTime(now)} delta=${formatAudioTime(scheduledTime - now)}`);
    if (scheduledTime !== time) debugAudio(`beat time was in the past; shifted from ${formatAudioTime(time)} to ${formatAudioTime(scheduledTime)}`);
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const accent = beat === 0;
    debugAudio('oscillator/source created');
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(accent ? 1320 : 880, scheduledTime);
    gain.gain.setValueAtTime(0.0001, scheduledTime);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.24 : 0.14, scheduledTime + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, scheduledTime + 0.075);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    debugAudio('oscillator/source connected to gain and destination');
    oscillator.onended = () => {
      scheduledOscillators.delete(oscillator);
      try { gain.disconnect(); } catch (_) { /* already disconnected */ }
    };
    scheduledOscillators.add(oscillator);
    oscillator.start(scheduledTime);
    oscillator.stop(scheduledTime + 0.09);
    debugAudio(`oscillator started; stop=${formatAudioTime(scheduledTime + 0.09)}`);
    scheduleIndicator(beat, scheduledTime);
  }

  function advanceBeat() {
    nextNoteTime += 60 / bpm;
    currentBeat = (currentBeat + 1) % beatCount;
  }

  function scheduler() {
    if (!running || !audioContext) return;
    const now = audioContext.currentTime;
    if (nextNoteTime < now) {
      debugAudio(`scheduler caught up: next=${formatAudioTime(nextNoteTime)} current=${formatAudioTime(now)}`);
      nextNoteTime = now + 0.01;
    }
    while (nextNoteTime < audioContext.currentTime + SCHEDULE_AHEAD_SECONDS) {
      scheduleBeat(currentBeat, nextNoteTime);
      advanceBeat();
    }
    schedulerTimer = window.setTimeout(scheduler, LOOKAHEAD_MS);
  }

  function createAudioContext() {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) return null;
    if (audioContext?.state === 'closed') audioContext = null;
    if (!audioContext) {
      audioContext = new AudioContextConstructor();
      debugAudio('AudioContext created');
    } else {
      debugAudio('AudioContext reused');
    }
    return audioContext;
  }

  async function startMetronome() {
    if (running || starting) return;
    starting = true;
    try {
      const context = createAudioContext();
      if (!context) return;
      console.log('AudioContext state:', audioContext.state);
      debugAudio(`start: state before resume=${audioContext.state} currentTime=${formatAudioTime(audioContext.currentTime)}`);
      try {
        if (context.state !== 'running') await context.resume();
      } finally {
        console.log('AudioContext state:', audioContext.state);
        debugAudio(`start: state after resume=${audioContext.state} currentTime=${formatAudioTime(audioContext.currentTime)}`);
      }
      if (context.state !== 'running') {
        console.warn('Metronome audio is not running.', context.state);
        debugAudio(`start aborted: state=${context.state}`);
        return;
      }
      running = true;
      currentBeat = 0;
      clearIndicatorTimers();
      renderBeatIndicators();
      nextNoteTime = context.currentTime + 0.05;
      scheduler();
      updateToggle();
      debugAudio(`scheduler started at currentTime=${formatAudioTime(context.currentTime)}`);
    } catch (error) {
      console.warn('Metronome audio is unavailable.', error);
    } finally {
      starting = false;
    }
  }

  function stopMetronome() {
    running = false;
    if (schedulerTimer !== null) window.clearTimeout(schedulerTimer);
    schedulerTimer = null;
    clearIndicatorTimers();
    stopScheduledOscillators();
    updateBeatIndicators(-1);
    updateToggle();
    debugAudio(audioContext ? `stop: scheduler cleared; state=${audioContext.state} currentTime=${formatAudioTime(audioContext.currentTime)}` : 'stop: scheduler cleared; no AudioContext');
  }

  function destroyMetronome() {
    stopMetronome();
    if (audioContext) {
      const context = audioContext;
      audioContext = null;
      context.close().catch(() => {});
      debugAudio('destroy: AudioContext closed');
    }
  }

  async function testIOSBeep() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      debugAudio('TEST SOUND: AudioContext is unavailable');
      return;
    }
    if (!audioContext || audioContext.state === 'closed') audioContext = new AudioContextClass();
    console.log('AudioContext state:', audioContext.state);
    debugAudio(`TEST SOUND: before resume state=${audioContext.state} currentTime=${formatAudioTime(audioContext.currentTime)}`);
    try {
      if (audioContext.state !== 'running') await audioContext.resume();
    } catch (error) {
      debugAudio(`TEST SOUND: resume failed: ${error?.message || error}`);
      return;
    } finally {
      console.log('AudioContext state:', audioContext.state);
      debugAudio(`TEST SOUND: after resume state=${audioContext.state} currentTime=${formatAudioTime(audioContext.currentTime)}`);
    }
    if (audioContext.state !== 'running') {
      debugAudio(`TEST SOUND: aborted because state=${audioContext.state}`);
      return;
    }
    const time = audioContext.currentTime;
    const duration = 0.12;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    debugAudio('TEST SOUND: oscillator/source created');
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.2, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc.connect(gain);
    gain.connect(audioContext.destination);
    debugAudio(`TEST SOUND: connected to destination at ${formatAudioTime(time)}`);
    osc.onended = () => {
      scheduledOscillators.delete(osc);
      try { gain.disconnect(); } catch (_) { /* already disconnected */ }
      debugAudio('TEST SOUND: oscillator ended');
    };
    scheduledOscillators.add(osc);
    osc.start(time);
    osc.stop(time + duration);
    debugAudio(`TEST SOUND: started=${formatAudioTime(time)} stopped=${formatAudioTime(time + duration)}`);
  }

  function onTestSoundClick() {
    void testIOSBeep().catch(error => debugAudio(`TEST SOUND: playback failed: ${error?.message || error}`));
  }

  function updateToggle() {
    const button = get('metronome-toggle');
    const icon = get('metronome-toggle-icon');
    if (icon) icon.textContent = running ? '■' : '▶';
    if (button) {
      button.setAttribute('aria-pressed', String(running));
      button.setAttribute('aria-label', running ? 'Остановить метроном' : 'Запустить метроном');
    }
  }

  function parseSignature(value) {
    const numerator = Number(String(value).split('/')[0]);
    return Number.isFinite(numerator) ? clamp(Math.round(numerator), 2, 12) : 4;
  }

  function setTimeSignature(value) {
    const option = [...signatureSheet.querySelectorAll('[data-time-signature]')].find(button => button.dataset.timeSignature === value);
    if (!option) return;
    timeSignature = value;
    beatCount = parseSignature(value);
    get('metronome-signature-value').textContent = value;
    signatureSheet.classList.add('hidden');
    get('metronome-signature-button').setAttribute('aria-expanded', 'false');
    [...signatureSheet.querySelectorAll('[data-time-signature]')].forEach(button => button.setAttribute('aria-selected', String(button === option)));
    currentBeat = 0;
    renderBeatIndicators();
    if (running && audioContext) {
      if (schedulerTimer !== null) window.clearTimeout(schedulerTimer);
      schedulerTimer = null;
      clearIndicatorTimers();
      stopScheduledOscillators();
      nextNoteTime = audioContext.currentTime + 0.05;
      scheduler();
    }
  }

  function toggleMetronome() {
    if (running) stopMetronome();
    else startMetronome();
  }

  function toggleSignatureSheet() {
    const open = signatureSheet.classList.toggle('hidden');
    get('metronome-signature-button').setAttribute('aria-expanded', String(!open));
  }

  function onSignatureOptionClick(event) {
    const option = event.target.closest('[data-time-signature]');
    if (option && signatureSheet.contains(option)) setTimeSignature(option.dataset.timeSignature);
  }

  function angleFromCoordinates(clientX, clientY) {
    const rect = dial.getBoundingClientRect();
    const x = (clientX - rect.left) * (320 / rect.width) - DIAL_CENTER;
    const y = (clientY - rect.top) * (320 / rect.height) - DIAL_CENTER;
    const raw = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    const candidates = [raw - 360, raw, raw + 360, raw + 720];
    const nearest = candidates.reduce((best, candidate) => Math.abs(candidate - dialAngle) < Math.abs(best - dialAngle) ? candidate : best, candidates[0]);
    return clamp(nearest, DIAL_START, DIAL_END);
  }

  function angleFromPointer(event) { return angleFromCoordinates(event.clientX, event.clientY); }

  function updateFromPointer(event) {
    if (pointerId === null || event.pointerId !== pointerId) return;
    event.preventDefault();
    dialAngle = angleFromPointer(event);
    setBpm(angleToBpm(dialAngle));
  }

  function stopPointer(event) {
    if (pointerId === null || (event && event.pointerId !== pointerId)) return;
    if (event && dial.hasPointerCapture?.(pointerId)) dial.releasePointerCapture(pointerId);
    pointerId = null;
  }

  function onTouchStart(event) {
    const touch = event.changedTouches[0];
    if (!touch) return;
    event.preventDefault();
    touchActive = true;
    dialAngle = angleFromCoordinates(touch.clientX, touch.clientY);
    setBpm(angleToBpm(dialAngle));
  }

  function onTouchMove(event) {
    if (!touchActive) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    event.preventDefault();
    dialAngle = angleFromCoordinates(touch.clientX, touch.clientY);
    setBpm(angleToBpm(dialAngle));
  }

  function onTouchEnd(event) {
    if (!touchActive) return;
    event.preventDefault();
    touchActive = false;
  }

  function mountScreen() {
    if (screenMounted) return;
    screenMounted = true;
    renderBpm();
    renderBeatIndicators();
    updateToggle();
    get('metronome-decrease').addEventListener('click', decrementBpm);
    get('metronome-increase').addEventListener('click', incrementBpm);
    get('metronome-toggle').addEventListener('click', toggleMetronome);
    get('metronome-signature-button').addEventListener('click', toggleSignatureSheet);
    testSoundButton?.addEventListener('click', onTestSoundClick);
    signatureSheet.addEventListener('click', onSignatureOptionClick);
    get('metronome-back').addEventListener('click', closeMetronomeScreen);
    if ('PointerEvent' in window) {
      dial.addEventListener('pointerdown', onPointerDown);
      dial.addEventListener('pointermove', updateFromPointer);
      dial.addEventListener('pointerup', stopPointer);
      dial.addEventListener('pointercancel', stopPointer);
      dial.addEventListener('lostpointercapture', stopPointer);
    } else {
      dial.addEventListener('touchstart', onTouchStart, { passive: false });
      dial.addEventListener('touchmove', onTouchMove, { passive: false });
      dial.addEventListener('touchend', onTouchEnd, { passive: false });
      dial.addEventListener('touchcancel', onTouchEnd, { passive: false });
    }
    dial.addEventListener('keydown', onDialKeydown);
  }

  function unmountScreen() {
    if (!screenMounted) return;
    destroyMetronome();
    screenMounted = false;
    pointerId = null;
    get('metronome-decrease').removeEventListener('click', decrementBpm);
    get('metronome-increase').removeEventListener('click', incrementBpm);
    get('metronome-toggle').removeEventListener('click', toggleMetronome);
    get('metronome-signature-button').removeEventListener('click', toggleSignatureSheet);
    testSoundButton?.removeEventListener('click', onTestSoundClick);
    signatureSheet.removeEventListener('click', onSignatureOptionClick);
    get('metronome-back').removeEventListener('click', closeMetronomeScreen);
    if ('PointerEvent' in window) {
      dial.removeEventListener('pointerdown', onPointerDown);
      dial.removeEventListener('pointermove', updateFromPointer);
      dial.removeEventListener('pointerup', stopPointer);
      dial.removeEventListener('pointercancel', stopPointer);
      dial.removeEventListener('lostpointercapture', stopPointer);
    } else {
      dial.removeEventListener('touchstart', onTouchStart);
      dial.removeEventListener('touchmove', onTouchMove);
      dial.removeEventListener('touchend', onTouchEnd);
      dial.removeEventListener('touchcancel', onTouchEnd);
    }
    touchActive = false;
    dial.removeEventListener('keydown', onDialKeydown);
  }

  function openMetronomeScreen() {
    chooser.classList.add('hidden');
    screen.classList.remove('hidden');
    dialog?.classList.add('metronome-mode');
    mountScreen();
  }

  function closeMetronomeScreen() {
    unmountScreen();
    screen.classList.add('hidden');
    chooser.classList.remove('hidden');
    signatureSheet.classList.add('hidden');
    get('metronome-signature-button').setAttribute('aria-expanded', 'false');
    dialog?.classList.remove('metronome-mode');
  }

  function onPointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    pointerId = event.pointerId;
    dial.setPointerCapture?.(pointerId);
    updateFromPointer(event);
  }

  function onDialKeydown(event) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') { event.preventDefault(); incrementBpm(); }
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') { event.preventDefault(); decrementBpm(); }
    else if (event.key === 'Home') { event.preventDefault(); setBpm(MIN_BPM); }
    else if (event.key === 'End') { event.preventDefault(); setBpm(MAX_BPM); }
  }

  metronomeButton?.addEventListener('click', openMetronomeScreen);
  dialog?.addEventListener('close', closeMetronomeScreen);
  fallbackBackdrop?.addEventListener('click', closeMetronomeScreen);
  const dialogObserver = typeof MutationObserver === 'function' && dialog ? new MutationObserver(() => {
    if (!dialog.hasAttribute('open') && !screen.classList.contains('hidden')) closeMetronomeScreen();
  }) : null;
  dialogObserver?.observe(dialog, { attributes: true, attributeFilter: ['open'] });

  renderBpm();
  renderBeatIndicators();
  window.GuitarMetronome = { startMetronome, stopMetronome, setBpm, incrementBpm, decrementBpm, setTimeSignature, scheduleBeat, updateBeatIndicators, destroyMetronome, testIOSBeep };
})();
