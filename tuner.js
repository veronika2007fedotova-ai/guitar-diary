(() => {
  'use strict';

  const screen = document.getElementById('tuner-screen');
  const toolsPanel = document.getElementById('home-tools');
  if (!screen || !toolsPanel) return;

  const get = id => document.getElementById(id);
  const chooser = toolsPanel.querySelector('.music-tool-choices');
  const tunerButton = toolsPanel.querySelector('[data-music-tool="tuner"]');
  const dialog = get('home-dialog');
  const fallbackBackdrop = get('home-dialog-fallback-backdrop');
  const i18n = window.GuitarDiaryI18n;

  const GUITAR_STRINGS = [
    { name: 'E2', shortName: 'E', frequency: 82.4069 },
    { name: 'A2', shortName: 'A', frequency: 110.0 },
    { name: 'D3', shortName: 'D', frequency: 146.832 },
    { name: 'G3', shortName: 'G', frequency: 195.998 },
    { name: 'B3', shortName: 'B', frequency: 246.942 },
    { name: 'E4', shortName: 'E', frequency: 329.628 }
  ];
  const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const WAITING_MESSAGE = 'Начните настройку, играя любую струну';

  let mode = 'guitar';
  let selectedString = null;
  let activeString = null;
  let tunedString = null;
  let audioContext = null;
  let analyser = null;
  let mediaSource = null;
  let mediaStream = null;
  let analyserBuffer = null;
  let animationFrame = null;
  let active = false;
  let starting = false;
  let frameCounter = 0;
  let lastPitchAt = 0;
  let lastDisplayedFrequency = null;
  let pitchHistory = [];

  function text(key, fallback) {
    try {
      return i18n?.t?.(key) || fallback;
    } catch (error) {
      return fallback;
    }
  }

  function setText(id, key, fallback) {
    const element = get(id);
    if (element) element.textContent = text(key, fallback);
  }

  function renderLanguage() {
    setText('tuner-title', 'tuner', 'Тюнер');
    setText('tuner-screen-subtitle', 'tunerGuitar', 'Гитара 6 струн');
    setText('tuner-guitar-tab', 'tunerGuitar', 'Гитара 6 струн');
    setText('tuner-chromatic-tab', 'tunerChromatic', 'Хроматический');
    setText('tuner-guitar-summary', 'tunerGuitar', 'Гитара 6 струн');
    setText('tuner-standard-summary', 'tunerStandard', 'Стандарт ›');
    setText('tuner-chromatic-label', 'tunerChromaticLabel', 'Хроматический режим');
    setText('tuner-flat-label', 'tunerBelow', '♭ Ниже');
    setText('tuner-sharp-label', 'tunerAbove', 'Выше ♯');
    setText('tuner-chromatic-flat-label', 'tunerBelow', '♭ Ниже');
    setText('tuner-chromatic-sharp-label', 'tunerAbove', 'Выше ♯');
    setText('tuner-auto', 'tunerAuto', 'AUTO');
    setText('tuner-chromatic-hint', 'tunerChromaticHint', 'Определяет ближайшую ноту по полутонам');
    if (!active && !starting) setText('tuner-microphone-status', 'tunerMicOff', 'Микрофон выключен');
    if (!active && !starting) setText('tuner-microphone', 'tunerMicStart', 'Включить микрофон');
    if (!lastDisplayedFrequency) {
      setText('tuner-guitar-guidance', 'tunerStartHint', WAITING_MESSAGE);
      setText('tuner-chromatic-guidance', 'tunerStartHint', WAITING_MESSAGE);
    }
    updateModeTabs();
    if (lastDisplayedFrequency) updateReadout(lastDisplayedFrequency);
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function formatCents(value) {
    const rounded = Math.round(value);
    if (Math.abs(rounded) < 1) return '0 cents';
    return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded)} cents`;
  }

  function frequencyUnit() {
    try {
      return i18n?.getLanguage?.() === 'en' ? 'Hz' : 'Гц';
    } catch (error) {
      return 'Гц';
    }
  }

  function frequencyToNote(frequency) {
    if (!Number.isFinite(frequency) || frequency <= 0) return null;
    const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
    const noteIndex = ((midi % 12) + 12) % 12;
    return {
      midi,
      name: NOTE_NAMES[noteIndex],
      octave: Math.floor(midi / 12) - 1,
      frequency: 440 * Math.pow(2, (midi - 69) / 12)
    };
  }

  function detectPitch(buffer, sampleRate) {
    if (!buffer || !buffer.length || !Number.isFinite(sampleRate)) return null;
    const sampleCount = Math.min(buffer.length, 3072);
    let mean = 0;
    for (let index = 0; index < sampleCount; index += 1) mean += buffer[index];
    mean /= sampleCount;

    let energy = 0;
    for (let index = 0; index < sampleCount; index += 1) {
      const sample = buffer[index] - mean;
      energy += sample * sample;
    }
    const rms = Math.sqrt(energy / sampleCount);
    if (rms < 0.009 || energy < 0.000001) return null;

    const minLag = Math.max(2, Math.floor(sampleRate / 1200));
    const maxLag = Math.min(sampleCount - 2, Math.floor(sampleRate / 45));
    const correlations = new Float64Array(maxLag + 1);
    for (let lag = minLag; lag <= maxLag; lag += 1) {
      let correlation = 0;
      const limit = sampleCount - lag;
      for (let index = 0; index < limit; index += 1) {
        correlation += (buffer[index] - mean) * (buffer[index + lag] - mean);
      }
      correlations[lag] = correlation / energy;
    }

    // Ignore the misleading high correlation at very short lags and choose a real local period peak.
    let bestLag = 0;
    let bestCorrelation = 0;
    for (let lag = minLag + 1; lag < maxLag; lag += 1) {
      const correlation = correlations[lag];
      if (correlation >= correlations[lag - 1] && correlation >= correlations[lag + 1] && correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestLag = lag;
      }
    }
    if (!bestLag || bestCorrelation < 0.22) return null;

    let refinedLag = bestLag;
    const previous = correlations[bestLag - 1];
    const next = correlations[bestLag + 1];
    const denominator = previous - 2 * bestCorrelation + next;
    if (Math.abs(denominator) > 0.00001) refinedLag += 0.5 * (previous - next) / denominator;

    const frequency = sampleRate / refinedLag;
    if (frequency < 45 || frequency > 1200) return null;
    return { frequency, clarity: bestCorrelation, rms };
  }

  function setMeter(needleId, cents) {
    const needle = get(needleId);
    if (!needle) return;
    const offset = clamp(cents, -50, 50) / 50 * 45;
    needle.style.setProperty('--tuner-offset', `${offset}%`);
    needle.classList.toggle('tuned', Math.abs(cents) <= 5);
  }

  function resetMeter(needleId) {
    const needle = get(needleId);
    if (!needle) return;
    needle.style.setProperty('--tuner-offset', '0%');
    needle.classList.remove('tuned');
  }

  function setGuidance(id, message, state) {
    const element = get(id);
    if (!element) return;
    element.textContent = message;
    element.dataset.state = state || 'waiting';
  }

  function resetReadouts() {
    get('tuner-guitar-note').textContent = '—';
    get('tuner-guitar-frequency').textContent = `— ${frequencyUnit()}`;
    get('tuner-guitar-cents').textContent = '0 cents';
    get('tuner-chromatic-note').textContent = '—';
    get('tuner-chromatic-frequency').textContent = `— ${frequencyUnit()}`;
    get('tuner-chromatic-cents').textContent = '0 cents';
    setGuidance('tuner-guitar-guidance', text('tunerStartHint', WAITING_MESSAGE), 'waiting');
    setGuidance('tuner-chromatic-guidance', text('tunerStartHint', WAITING_MESSAGE), 'waiting');
    resetMeter('tuner-guitar-needle');
    resetMeter('tuner-chromatic-needle');
    activeString = null;
    tunedString = null;
    updateStringSelection();
    lastPitchAt = 0;
    lastDisplayedFrequency = null;
    pitchHistory = [];
  }

  function updateStringSelection() {
    const highlightedString = selectedString === null ? activeString : selectedString;
    screen.querySelectorAll('[data-tuner-string]').forEach(button => {
      const isSelected = selectedString !== null && Number(button.dataset.tunerString) === selectedString;
      button.classList.toggle('selected', isSelected);
      button.setAttribute('aria-pressed', String(isSelected));
    });
    screen.querySelectorAll('[data-string]').forEach(element => {
      const isActive = highlightedString !== null && element.dataset.string === GUITAR_STRINGS[highlightedString]?.name;
      const isTuned = isActive && tunedString === highlightedString;
      element.classList.toggle('active', isActive);
      element.classList.toggle('tuned', isTuned);
      if (element.matches?.('[data-tuner-string]')) element.classList.toggle('selected', isActive);
    });
    get('tuner-auto')?.classList.toggle('active', selectedString === null);
  }

  function updateModeTabs() {
    const guitar = mode === 'guitar';
    get('tuner-guitar-tab')?.classList.toggle('active', guitar);
    get('tuner-chromatic-tab')?.classList.toggle('active', !guitar);
    get('tuner-guitar-tab')?.setAttribute('aria-selected', String(guitar));
    get('tuner-chromatic-tab')?.setAttribute('aria-selected', String(!guitar));
    get('tuner-guitar-mode')?.classList.toggle('hidden', !guitar);
    get('tuner-chromatic-mode')?.classList.toggle('hidden', guitar);
    setText('tuner-screen-subtitle', guitar ? 'tunerGuitar' : 'tunerChromatic', guitar ? 'Гитара 6 струн' : 'Хроматический');
  }

  function updateReadout(frequency) {
    if (!Number.isFinite(frequency) || frequency <= 0) return;
    const note = frequencyToNote(frequency);
    if (!note) return;
    lastPitchAt = performance.now() || 1;
    lastDisplayedFrequency = frequency;

    if (mode === 'guitar') {
      const candidateIndex = selectedString === null
        ? GUITAR_STRINGS.reduce((best, string, index) => {
          const currentDistance = Math.abs(1200 * Math.log2(frequency / string.frequency));
          const bestDistance = Math.abs(1200 * Math.log2(frequency / GUITAR_STRINGS[best].frequency));
          return currentDistance < bestDistance ? index : best;
        }, 0)
        : selectedString;
      activeString = candidateIndex;
      // Keep the existing AUTO target calculation unchanged; activeString only
      // controls the visual highlight of the matching string and peg.
      const targetIndex = selectedString === null ? candidateIndex : selectedString;
      const target = GUITAR_STRINGS[targetIndex];
      const cents = 1200 * Math.log2(frequency / target.frequency);
      get('tuner-guitar-note').textContent = target.name;
      get('tuner-guitar-frequency').textContent = `${frequency.toFixed(1)} ${frequencyUnit()}`;
      get('tuner-guitar-cents').textContent = formatCents(cents);
      setMeter('tuner-guitar-needle', cents);
      tunedString = Math.abs(cents) <= 5 ? targetIndex : null;
      updateStringSelection();
      if (Math.abs(cents) <= 5) setGuidance('tuner-guitar-guidance', text('tunerTuned', 'Струна настроена'), 'tuned');
      else if (cents < 0) setGuidance('tuner-guitar-guidance', text('tunerLow', 'Ниже нужной ноты'), 'flat');
      else setGuidance('tuner-guitar-guidance', text('tunerHigh', 'Выше нужной ноты'), 'sharp');
      return;
    }

    const cents = 1200 * Math.log2(frequency / note.frequency);
    get('tuner-chromatic-note').textContent = `${note.name}${note.octave}`;
    get('tuner-chromatic-frequency').textContent = `${frequency.toFixed(1)} ${frequencyUnit()}`;
    get('tuner-chromatic-cents').textContent = formatCents(cents);
    setMeter('tuner-chromatic-needle', cents);
    if (Math.abs(cents) <= 5) setGuidance('tuner-chromatic-guidance', text('tunerExact', 'Точно'), 'tuned');
    else if (cents < 0) setGuidance('tuner-chromatic-guidance', text('tunerLow', 'Ниже нужной ноты'), 'flat');
    else setGuidance('tuner-chromatic-guidance', text('tunerHigh', 'Выше нужной ноты'), 'sharp');
  }

  function analyseFrame() {
    if (!active || !analyser || !analyserBuffer) return;
    if (audioContext?.state !== 'running') {
      setGuidance(mode === 'guitar' ? 'tuner-guitar-guidance' : 'tuner-chromatic-guidance', text('tunerNoSignal', 'Слушаю…'), 'waiting');
    } else {
      analyser.getFloatTimeDomainData(analyserBuffer);
      frameCounter += 1;
      if (frameCounter % 2 === 0) {
        const detected = detectPitch(analyserBuffer, audioContext.sampleRate);
        if (detected) {
          pitchHistory.push(detected.frequency);
          if (pitchHistory.length > 5) pitchHistory.shift();
          const sorted = [...pitchHistory].sort((left, right) => left - right);
          updateReadout(sorted[Math.floor(sorted.length / 2)]);
        } else if (lastPitchAt && performance.now() - lastPitchAt > 360) {
          resetReadouts();
        }
      }
    }
    animationFrame = window.requestAnimationFrame(analyseFrame);
  }

  function ensureAudioContext() {
    if (!AudioContextClass) throw new Error(text('tunerMicUnsupported', 'Браузер не поддерживает доступ к микрофону'));
    if (!audioContext || audioContext.state === 'closed') audioContext = new AudioContextClass();
    return audioContext;
  }

  function stopAnalysis() {
    active = false;
    if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
    animationFrame = null;
    if (mediaSource) {
      try { mediaSource.disconnect(); } catch (error) { /* source may already be disconnected */ }
    }
    mediaSource = null;
    if (analyser) {
      try { analyser.disconnect(); } catch (error) { /* analyser may already be disconnected */ }
    }
    analyser = null;
    analyserBuffer = null;
    if (mediaStream) mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
    starting = false;
    resetReadouts();
    updateMicrophoneUi();
  }

  function updateMicrophoneUi() {
    const button = get('tuner-microphone');
    const status = get('tuner-microphone-status');
    if (!button || !status) return;
    if (starting) {
      button.disabled = true;
      button.textContent = text('tunerMicStarting', 'Запрашиваем доступ…');
      status.textContent = text('tunerMicStarting', 'Запрашиваем доступ…');
      return;
    }
    button.disabled = false;
    button.textContent = active ? text('tunerMicStop', 'Остановить микрофон') : text('tunerMicStart', 'Включить микрофон');
    status.textContent = active ? text('tunerMicReady', 'Микрофон включён') : text('tunerMicOff', 'Микрофон выключен');
    button.classList.toggle('active', active);
  }

  async function requestMicrophoneAccess() {
    if (starting || active) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      get('tuner-microphone-status').textContent = text('tunerMicUnsupported', 'Браузер не поддерживает доступ к микрофону');
      setGuidance('tuner-guitar-guidance', text('tunerMicUnsupported', 'Браузер не поддерживает доступ к микрофону'), 'error');
      setGuidance('tuner-chromatic-guidance', text('tunerMicUnsupported', 'Браузер не поддерживает доступ к микрофону'), 'error');
      return;
    }
    starting = true;
    updateMicrophoneUi();
    let stream;
    try {
      const context = ensureAudioContext();
      const streamPromise = navigator.mediaDevices.getUserMedia({ audio: true });
      streamPromise.catch(() => {});
      if (context.state !== 'running') await context.resume();
      if (context.state !== 'running') throw new Error('AudioContext is not running');
      stream = await streamPromise;
      if (screen.classList.contains('hidden')) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      mediaStream = stream;
      analyser = context.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.16;
      analyserBuffer = new Float32Array(analyser.fftSize);
      mediaSource = context.createMediaStreamSource(mediaStream);
      mediaSource.connect(analyser);
      active = true;
      frameCounter = 0;
      pitchHistory = [];
      resetReadouts();
      updateMicrophoneUi();
      animationFrame = window.requestAnimationFrame(analyseFrame);
    } catch (error) {
      if (stream) stream.getTracks().forEach(track => track.stop());
      const denied = error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError';
      const message = denied
        ? text('tunerMicDenied', 'Для работы тюнера нужен доступ к микрофону')
        : text('tunerMicUnavailable', 'Микрофон недоступен на этом устройстве');
      get('tuner-microphone-status').textContent = message;
      setGuidance('tuner-guitar-guidance', message, 'error');
      setGuidance('tuner-chromatic-guidance', message, 'error');
      console.warn('Tuner microphone unavailable.', error);
    } finally {
      starting = false;
      updateMicrophoneUi();
    }
  }

  function setMode(nextMode) {
    mode = nextMode === 'chromatic' ? 'chromatic' : 'guitar';
    resetReadouts();
    updateModeTabs();
  }

  function setTargetString(index) {
    const value = Number(index);
    if (!Number.isInteger(value) || value < 0 || value >= GUITAR_STRINGS.length) return;
    mode = 'guitar';
    selectedString = value;
    updateModeTabs();
    resetReadouts();
    activeString = value;
    updateStringSelection();
  }

  function setAutoMode() {
    selectedString = null;
    updateStringSelection();
    resetReadouts();
  }

  function openTunerScreen() {
    chooser?.classList.add('hidden');
    screen.classList.remove('hidden');
    dialog?.classList.add('tuner-mode');
    selectedString = null;
    setMode('guitar');
    updateMicrophoneUi();
    get('tuner-back')?.focus({ preventScroll: true });
  }

  function destroyTuner() {
    stopAnalysis();
    if (audioContext && audioContext.state !== 'closed') {
      const context = audioContext;
      audioContext = null;
      context.close().catch(() => {});
    } else audioContext = null;
  }

  function closeTunerScreen() {
    destroyTuner();
    screen.classList.add('hidden');
    chooser?.classList.remove('hidden');
    dialog?.classList.remove('tuner-mode');
    selectedString = null;
    setMode('guitar');
  }

  function onVisibilityChange() {
    if (document.hidden && active) stopAnalysis();
  }

  tunerButton?.addEventListener('click', openTunerScreen);
  get('tuner-back')?.addEventListener('click', closeTunerScreen);
  get('tuner-microphone')?.addEventListener('click', () => { if (active) stopAnalysis(); else requestMicrophoneAccess(); });
  get('tuner-guitar-tab')?.addEventListener('click', () => setMode('guitar'));
  get('tuner-chromatic-tab')?.addEventListener('click', () => setMode('chromatic'));
  get('tuner-auto')?.addEventListener('click', setAutoMode);
  screen.querySelectorAll('[data-tuner-string]').forEach(button => button.addEventListener('click', () => setTargetString(button.dataset.tunerString)));
  dialog?.addEventListener('close', () => { if (!screen.classList.contains('hidden')) closeTunerScreen(); });
  fallbackBackdrop?.addEventListener('click', () => { if (!screen.classList.contains('hidden')) closeTunerScreen(); });
  window.addEventListener('guitar-diary-language-change', renderLanguage);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', stopAnalysis);

  renderLanguage();
  resetReadouts();
  updateStringSelection();
  updateMicrophoneUi();

  window.GuitarTuner = {
    initTuner: openTunerScreen,
    requestMicrophoneAccess,
    startTuner: requestMicrophoneAccess,
    stopTuner: stopAnalysis,
    detectPitch,
    frequencyToNote,
    getCentsOffset: (frequency, targetFrequency) => 1200 * Math.log2(frequency / targetFrequency),
    setTargetString,
    setAutoMode,
    setChromaticMode: () => setMode('chromatic'),
    setGuitarMode: () => setMode('guitar'),
    updateTunerUI: updateReadout,
    destroyTuner,
    GUITAR_STRINGS: GUITAR_STRINGS.map(string => ({ ...string }))
  };
})();
