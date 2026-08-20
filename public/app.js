/**
 * NEXUS VISION AI - Application Logic
 * Camera Stream, Motion Detection, Vision API Integration, Web Audio & Speech TTS
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Element References
  const webcamVideo = document.getElementById('webcamVideo');
  const hudCanvas = document.getElementById('hudCanvas');
  const motionCanvas = document.getElementById('motionCanvas');
  const cameraPlaceholder = document.getElementById('cameraPlaceholder');
  const startCameraBtn = document.getElementById('startCameraBtn');
  const cameraSourceSelect = document.getElementById('cameraSourceSelect');
  const analyzeNowBtn = document.getElementById('analyzeNowBtn');
  const laserScanner = document.getElementById('laserScanner');
  
  // Status Badges & HUD
  const cameraStatusBadge = document.getElementById('cameraStatusBadge');
  const cameraStatusText = document.getElementById('cameraStatusText');
  const apiStatusText = document.getElementById('apiStatusText');
  const hudFpsText = document.getElementById('hudFpsText');
  const hudResText = document.getElementById('hudResText');
  const motionSensitivityBadge = document.getElementById('motionSensitivityBadge');
  const toggleGridBtn = document.getElementById('toggleGridBtn');
  const hudReticle = document.getElementById('hudReticle');

  // Mode Buttons
  const modeManualBtn = document.getElementById('modeManualBtn');
  const modeAutoBtn = document.getElementById('modeAutoBtn');
  const modeMotionBtn = document.getElementById('modeMotionBtn');

  // Presets & Prompts
  const presetChips = document.querySelectorAll('.preset-chip');
  const customPromptInput = document.getElementById('customPromptInput');
  const sendCustomPromptBtn = document.getElementById('sendCustomPromptBtn');

  // Output Elements
  const emptyOutputState = document.getElementById('emptyOutputState');
  const loadingState = document.getElementById('loadingState');
  const loadingPromptTitle = document.getElementById('loadingPromptTitle');
  const analysisResultBox = document.getElementById('analysisResultBox');
  const resultModelName = document.getElementById('resultModelName');
  const resultLatencyPill = document.getElementById('resultLatencyPill');
  const resultTimestampPill = document.getElementById('resultTimestampPill');
  const resultTextBody = document.getElementById('resultTextBody');

  // Action Buttons
  const ttsSpeakBtn = document.getElementById('ttsSpeakBtn');
  const ttsBtnText = document.getElementById('ttsBtnText');
  const copyResultBtn = document.getElementById('copyResultBtn');
  const downloadReportBtn = document.getElementById('downloadReportBtn');

  // History Gallery
  const historyGallery = document.getElementById('historyGallery');
  const historyCountBadge = document.getElementById('historyCountBadge');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');

  // Config Modal
  const configToggleBtn = document.getElementById('configToggleBtn');
  const configModal = document.getElementById('configModal');
  const closeConfigModalBtn = document.getElementById('closeConfigModalBtn');
  const saveConfigBtn = document.getElementById('saveConfigBtn');
  const configApiKeyInput = document.getElementById('configApiKeyInput');
  const configModelSelect = document.getElementById('configModelSelect');
  const configTtsToggle = document.getElementById('configTtsToggle');
  const configSfxToggle = document.getElementById('configSfxToggle');

  // Application State
  let mediaStream = null;
  let isCameraActive = false;
  let currentScanMode = 'manual'; // manual | auto | motion
  let activePreset = 'object'; // object | ocr | safety | count | custom
  let autoScanTimer = null;
  let lastAnalysisTime = 0;
  let isAnalyzing = false;
  let lastAnalysisData = null;
  let historyItems = [];

  // Motion Detection State
  let motionCtx = null;
  let prevFrameData = null;
  let motionCheckInterval = null;
  let motionThreshold = 18; // Percentage pixel change threshold
  let motionCooldown = false;

  // FPS Counter
  let frameCount = 0;
  let lastFpsCalc = Date.now();

  // Settings
  let configSettings = {
    apiKey: '',
    model: 'meta/llama-3.2-11b-vision-instruct',
    ttsEnabled: true, // Voice readout ACTIVE by default
    sfxEnabled: true
  };

  // Preset Prompts Catalog
  const PROMPTS = {
    object: "Examine the object placed in front of the camera. Identify what it is, its exact position in the frame, main colors, key features, material, and likely purpose or function.",
    ocr: "Read and extract all visible text, document headers, serial numbers, labels, or handwritten notes in this camera view.",
    safety: "Inspect the camera view for safety hazards, broken items, spilled liquids, blocked pathways, or out-of-place objects.",
    count: "Count and list all distinct items visible in this camera view, categorizing them by object type."
  };

  // ==========================================
  // Web Audio API Sound Synthesizer
  // ==========================================
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  function playSound(type) {
    if (!configSettings.sfxEnabled) return;
    try {
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (type === 'shutter') {
        // Camera click shutter tone
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.08);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'success') {
        // Futuristic success chime
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
        osc.frequency.setValueAtTime(783.99, now + 0.16); // G5
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      } else if (type === 'motion') {
        // Soft blip for motion
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1050, now);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
      }
    } catch (e) {
      console.log('Audio synth error:', e);
    }
  }

  // ==========================================
  // Web Speech API Text-to-Speech
  // ==========================================
  function speakText(text) {
    if (!('speechSynthesis' in window) || !configSettings.ttsEnabled) return;
    window.speechSynthesis.cancel(); // Stop ongoing speech

    // Clean markdown symbols for cleaner TTS
    const cleanText = text.replace(/[*#_`~]/g, '').trim();
    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    // Pick natural English voice if available
    const voices = window.speechSynthesis.getVoices();
    const englishVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha')));
    if (englishVoice) utterance.voice = englishVoice;

    utterance.onstart = () => {
      ttsSpeakBtn.classList.add('active');
      ttsBtnText.textContent = "Speaking...";
    };

    utterance.onend = utterance.onerror = () => {
      ttsSpeakBtn.classList.remove('active');
      ttsBtnText.textContent = "Read Aloud";
    };

    window.speechSynthesis.speak(utterance);
  }

  // ==========================================
  // Web Speech API Microphone Voice Input
  // ==========================================
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let isListening = false;
  let speechSilenceTimer = null;
  let lastSpokenText = '';
  let hasSubmittedSpeech = false;

  const micBtn = document.getElementById('micBtn');
  const voiceStatusBar = document.getElementById('voiceStatusBar');
  const voiceStatusText = document.getElementById('voiceStatusText');

  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      isListening = true;
      hasSubmittedSpeech = false;
      lastSpokenText = '';
      if (micBtn) micBtn.classList.add('recording');
      if (voiceStatusBar) voiceStatusBar.style.display = 'flex';
      if (voiceStatusText) voiceStatusText.textContent = "Listening... Speak your question now!";
      playSound('motion');
    };

    recognition.onresult = (event) => {
      let transcript = '';
      let isFinal = false;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
        if (event.results[i].isFinal) isFinal = true;
      }

      const cleanTranscript = transcript.trim();
      if (cleanTranscript) {
        lastSpokenText = cleanTranscript;
        if (customPromptInput) customPromptInput.value = lastSpokenText;
        if (voiceStatusText) voiceStatusText.textContent = `Hearing: "${lastSpokenText}"`;

        // Silence detection: 700ms silence after speech auto-completes & submits
        if (speechSilenceTimer) clearTimeout(speechSilenceTimer);

        const autoSubmitDelay = isFinal ? 200 : 700;
        speechSilenceTimer = setTimeout(() => {
          if (isListening && lastSpokenText && !hasSubmittedSpeech) {
            hasSubmittedSpeech = true;
            try { recognition.stop(); } catch (e) {}
          }
        }, autoSubmitDelay);
      }
    };

    recognition.onerror = (event) => {
      console.warn("Speech Recognition Error:", event.error);
      stopListening();
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        alert(`Microphone Error (${event.error}). Please allow microphone access.`);
      }
    };

    recognition.onend = () => {
      stopListening();
      if (speechSilenceTimer) clearTimeout(speechSilenceTimer);

      const finalPrompt = (lastSpokenText || (customPromptInput ? customPromptInput.value : '')).trim();
      if (finalPrompt && !isAnalyzing) {
        hasSubmittedSpeech = true;
        presetChips.forEach(c => c.classList.remove('active'));
        activePreset = 'custom';
        console.log(`Auto-submitting spoken question: "${finalPrompt}"`);
        triggerAnalysis();
      }
    };
  }

  function startListening() {
    if (!recognition) {
      alert("Voice input is supported in Google Chrome, Microsoft Edge, and Safari.");
      return;
    }
    try {
      recognition.start();
    } catch (e) {
      console.log('Recognition start error:', e);
    }
  }

  function stopListening() {
    isListening = false;
    if (micBtn) micBtn.classList.remove('recording');
    if (voiceStatusBar) voiceStatusBar.style.display = 'none';
  }

  if (micBtn) {
    micBtn.addEventListener('click', () => {
      if (isListening) {
        recognition.stop();
      } else {
        startListening();
      }
    });
  }

  // Detect if running on Mobile Phone vs Laptop/Desktop
  const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
    || (navigator.maxTouchPoints && navigator.maxTouchPoints > 1 && /Macintosh/i.test(navigator.userAgent));

  // Application State: Phone -> Back Camera ('environment'), Laptop -> Normal Webcam ('user')
  let mediaStream = null;
  let isCameraActive = false;
  let currentFacingMode = isMobileDevice ? 'environment' : 'user';
  let currentScanMode = 'manual'; // manual | auto | motion
  let activePreset = 'object'; // object | ocr | safety | count | custom
  let autoScanTimer = null;
  let lastAnalysisTime = 0;
  let isAnalyzing = false;
  let lastAnalysisData = null;
  let historyItems = [];

  const flipCameraBtn = document.getElementById('flipCameraBtn');
  const flipCameraLabel = document.getElementById('flipCameraLabel');

  if (flipCameraLabel) {
    flipCameraLabel.textContent = (currentFacingMode === 'environment') ? 'Back Cam 🔄' : 'Front Cam 🔄';
  }

  // ==========================================
  // Camera Management (WebRTC)
  // ==========================================
  async function initCamera() {
    try {
      // Stop existing tracks if switching camera
      if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
      }

      await enumerateCameraDevices();
      
      const constraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: { ideal: currentFacingMode }
        },
        audio: false
      };

      const selectedDeviceId = cameraSourceSelect.value;
      if (selectedDeviceId) {
        constraints.video.deviceId = { exact: selectedDeviceId };
      }

      mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      webcamVideo.srcObject = mediaStream;

      // Apply unmirrored transform for back camera, mirrored for selfie camera
      webcamVideo.style.transform = (currentFacingMode === 'user') ? 'scaleX(-1)' : 'scaleX(1)';

      webcamVideo.onloadedmetadata = () => {
        webcamVideo.play();
        isCameraActive = true;
        cameraPlaceholder.style.display = 'none';
        analyzeNowBtn.disabled = false;
        
        const modeLabel = currentFacingMode === 'environment' ? 'Back Camera' : 'Front Camera';
        updateCameraStatus(true, `Live (${modeLabel})`);
        hudResText.textContent = `${webcamVideo.videoWidth}x${webcamVideo.videoHeight}`;
        
        startMotionDetector();
        startFpsCounter();
        playSound('success');
      };

    } catch (err) {
      console.error("Camera Init Error:", err);
      updateCameraStatus(false, "Camera Access Denied");
      alert("Could not access camera feed. Please allow camera permissions in your browser.");
    }
  }

  async function enumerateCameraDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      
      cameraSourceSelect.innerHTML = '';
      if (videoDevices.length === 0) {
        cameraSourceSelect.innerHTML = '<option value="">Default Camera</option>';
        return;
      }

      videoDevices.forEach((device, idx) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent = device.label || `Camera ${idx + 1}`;
        cameraSourceSelect.appendChild(option);
      });
    } catch (err) {
      console.warn("Could not enumerate camera devices:", err);
    }
  }

  function stopCamera() {
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      mediaStream = null;
    }
    isCameraActive = false;
    webcamVideo.srcObject = null;
    cameraPlaceholder.style.display = 'flex';
    analyzeNowBtn.disabled = true;
    updateCameraStatus(false, "Camera Off");
  }

  function updateCameraStatus(active, text) {
    cameraStatusText.textContent = text;
    const dot = cameraStatusBadge.querySelector('.status-dot');
    if (active) {
      dot.className = 'status-dot green';
    } else {
      dot.className = 'status-dot red';
    }
  }

  function startFpsCounter() {
    frameCount++;
    const now = Date.now();
    if (now - lastFpsCalc >= 1000) {
      hudFpsText.textContent = `${frameCount} FPS`;
      frameCount = 0;
      lastFpsCalc = now;
    }
    if (isCameraActive) {
      requestAnimationFrame(startFpsCounter);
    }
  }

  // ==========================================
  // Motion Detection Engine
  // ==========================================
  function startMotionDetector() {
    motionCanvas.width = 64;
    motionCanvas.height = 48;
    motionCtx = motionCanvas.getContext('2d', { willReadFrequently: true });
    
    if (motionCheckInterval) clearInterval(motionCheckInterval);

    motionCheckInterval = setInterval(() => {
      if (!isCameraActive || webcamVideo.paused || webcamVideo.ended) return;

      motionCtx.drawImage(webcamVideo, 0, 0, 64, 48);
      const currentFrame = motionCtx.getImageData(0, 0, 64, 48);

      if (prevFrameData) {
        let changedPixels = 0;
        const totalPixels = currentFrame.data.length / 4;

        for (let i = 0; i < currentFrame.data.length; i += 4) {
          const rDiff = Math.abs(currentFrame.data[i] - prevFrameData.data[i]);
          const gDiff = Math.abs(currentFrame.data[i + 1] - prevFrameData.data[i + 1]);
          const bDiff = Math.abs(currentFrame.data[i + 2] - prevFrameData.data[i + 2]);

          if ((rDiff + gDiff + bDiff) / 3 > 35) {
            changedPixels++;
          }
        }

        const changePercent = (changedPixels / totalPixels) * 100;

        if (changePercent > motionThreshold) {
          motionSensitivityBadge.classList.add('active');
          
          if (currentScanMode === 'motion' && !isAnalyzing && !motionCooldown) {
            console.log(`Motion detected (${changePercent.toFixed(1)}%). Triggering instant analysis...`);
            playSound('motion');
            motionCooldown = true;
            triggerAnalysis();
            setTimeout(() => { motionCooldown = false; }, 4000); // 4s cooldown
          }
        } else {
          motionSensitivityBadge.classList.remove('active');
        }
      }

      prevFrameData = currentFrame;
    }, 250);
  }

  // ==========================================
  // Frame Capture & Image Optimization
  // ==========================================
  function captureOptimizedFrame() {
    if (!webcamVideo.videoWidth) return null;

    const canvas = document.createElement('canvas');
    const maxDim = 800; // Optimal for fast vision API inference
    let width = webcamVideo.videoWidth;
    let height = webcamVideo.videoHeight;

    if (width > maxDim || height > maxDim) {
      if (width > height) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(webcamVideo, 0, 0, width, height);

    return canvas.toDataURL('image/jpeg', 0.82);
  }

  // ==========================================
  // Vision Analysis API Request
  // ==========================================
  async function triggerAnalysis() {
    if (!isCameraActive || isAnalyzing) return;

    const imageDataUrl = captureOptimizedFrame();
    if (!imageDataUrl) return;

    isAnalyzing = true;
    playSound('shutter');
    laserScanner.classList.add('active');

    // UI Loading State
    emptyOutputState.style.display = 'none';
    analysisResultBox.style.display = 'none';
    loadingState.style.display = 'flex';

    // Determine prompt
    let targetPrompt = PROMPTS[activePreset] || PROMPTS.object;
    if (activePreset === 'custom' && customPromptInput.value.trim()) {
      targetPrompt = customPromptInput.value.trim();
    }
    loadingPromptTitle.textContent = activePreset === 'custom' ? `Analyzing: "${targetPrompt.substring(0, 30)}..."` : `Analyzing Camera View...`;

    try {
      // Resolve backend API URL dynamically for file:// or cross-origin dev servers
      const apiEndpoint = (window.location.protocol === 'file:' || window.location.port !== '3000') 
        ? 'http://localhost:3000/api/analyze' 
        : '/api/analyze';

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imageDataUrl,
          prompt: targetPrompt,
          apiKey: configSettings.apiKey,
          model: configSettings.model
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to analyze image.");
      }

      lastAnalysisData = {
        image: imageDataUrl,
        analysis: data.analysis,
        model: data.model,
        latencyMs: data.latencyMs,
        timestamp: new Date().toLocaleTimeString(),
        prompt: targetPrompt
      };

      displayAnalysisResult(lastAnalysisData);
      addHistoryItem(lastAnalysisData);
      playSound('success');

      if (configSettings.ttsEnabled) {
        speakText(data.analysis);
      }

    } catch (err) {
      console.error("Analysis Error:", err);
      const msg = err.message === 'Failed to fetch' 
        ? "Could not reach backend server at http://localhost:3000. Please ensure 'node server.js' is running." 
        : err.message;
      alert(`Vision API Analysis Failed: ${msg}`);
      emptyOutputState.style.display = 'flex';
      loadingState.style.display = 'none';
    } finally {
      isAnalyzing = false;
      laserScanner.classList.remove('active');
    }
  }

  // Render Result in UI
  function displayAnalysisResult(data) {
    loadingState.style.display = 'none';
    emptyOutputState.style.display = 'none';
    analysisResultBox.style.display = 'flex';

    resultModelName.textContent = data.model;
    resultLatencyPill.textContent = `${data.latencyMs} ms`;
    resultTimestampPill.textContent = data.timestamp;

    // Simple markdown formatting for bold and paragraphs
    let formattedHtml = data.analysis
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');

    resultTextBody.innerHTML = `<p>${formattedHtml}</p>`;
  }

  // ==========================================
  // History & Gallery Manager
  // ==========================================
  function addHistoryItem(item) {
    historyItems.unshift(item);
    if (historyItems.length > 20) historyItems.pop();

    renderHistoryGallery();
  }

  function renderHistoryGallery() {
    historyCountBadge.textContent = historyItems.length;
    if (historyItems.length === 0) {
      historyGallery.innerHTML = `<div class="history-empty-hint">No inspection snapshots recorded yet. Capture or run auto-scan to save timeline history.</div>`;
      return;
    }

    historyGallery.innerHTML = '';
    historyItems.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'history-item';
      card.innerHTML = `
        <img src="${item.image}" alt="Snapshot ${index}">
        <div class="history-item-overlay">
          <span class="history-item-time">${item.timestamp}</span>
        </div>
      `;
      card.addEventListener('click', () => {
        displayAnalysisResult(item);
      });
      historyGallery.appendChild(card);
    });
  }

  // ==========================================
  // Event Listeners & Mode Controllers
  // ==========================================
  startCameraBtn.addEventListener('click', initCamera);
  analyzeNowBtn.addEventListener('click', triggerAnalysis);
  cameraSourceSelect.addEventListener('change', initCamera);

  if (flipCameraBtn) {
    flipCameraBtn.addEventListener('click', () => {
      currentFacingMode = (currentFacingMode === 'environment') ? 'user' : 'environment';
      if (flipCameraLabel) {
        flipCameraLabel.textContent = (currentFacingMode === 'environment') ? 'Back Cam 🔄' : 'Front Cam 🔄';
      }
      if (cameraSourceSelect) cameraSourceSelect.value = '';
      initCamera();
    });
  }

  // Keyboard shortcut: Spacebar triggers analysis
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      triggerAnalysis();
    }
  });

  // Mode Selection
  function setScanMode(mode) {
    currentScanMode = mode;
    [modeManualBtn, modeAutoBtn, modeMotionBtn].forEach(b => b.classList.remove('active'));

    if (autoScanTimer) clearInterval(autoScanTimer);

    if (mode === 'manual') {
      modeManualBtn.classList.add('active');
    } else if (mode === 'auto') {
      modeAutoBtn.classList.add('active');
      autoScanTimer = setInterval(() => {
        if (isCameraActive && !isAnalyzing) {
          triggerAnalysis();
        }
      }, 1000); // Instant 1 second auto-scan
    } else if (mode === 'motion') {
      modeMotionBtn.classList.add('active');
    }
  }

  modeManualBtn.addEventListener('click', () => setScanMode('manual'));
  modeAutoBtn.addEventListener('click', () => setScanMode('auto'));
  modeMotionBtn.addEventListener('click', () => setScanMode('motion'));

  // Preset Chips
  presetChips.forEach(chip => {
    chip.addEventListener('click', () => {
      presetChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activePreset = chip.dataset.preset;
      customPromptInput.value = '';
    });
  });

  sendCustomPromptBtn.addEventListener('click', () => {
    if (customPromptInput.value.trim()) {
      presetChips.forEach(c => c.classList.remove('active'));
      activePreset = 'custom';
      triggerAnalysis();
    }
  });

  customPromptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && customPromptInput.value.trim()) {
      presetChips.forEach(c => c.classList.remove('active'));
      activePreset = 'custom';
      triggerAnalysis();
    }
  });

  // Grid Reticle Toggle
  toggleGridBtn.addEventListener('click', () => {
    const isVisible = hudReticle.style.display !== 'none';
    hudReticle.style.display = isVisible ? 'none' : 'block';
    toggleGridBtn.classList.toggle('active', !isVisible);
  });

  // Action Buttons
  ttsSpeakBtn.addEventListener('click', () => {
    if (lastAnalysisData && lastAnalysisData.analysis) {
      speakText(lastAnalysisData.analysis);
    }
  });

  copyResultBtn.addEventListener('click', () => {
    if (lastAnalysisData && lastAnalysisData.analysis) {
      navigator.clipboard.writeText(lastAnalysisData.analysis);
      const originalText = copyResultBtn.querySelector('span').textContent;
      copyResultBtn.querySelector('span').textContent = "Copied!";
      setTimeout(() => { copyResultBtn.querySelector('span').textContent = originalText; }, 2000);
    }
  });

  downloadReportBtn.addEventListener('click', () => {
    if (!lastAnalysisData) return;
    const reportText = `NEXUS VISION AI - INSPECTION REPORT
Timestamp: ${lastAnalysisData.timestamp}
Model: ${lastAnalysisData.model}
Latency: ${lastAnalysisData.latencyMs} ms
Prompt: ${lastAnalysisData.prompt}

--------------------------------------------------
ANALYSIS:
${lastAnalysisData.analysis}
--------------------------------------------------
`;

    const blob = new Blob([reportText], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `nexus_vision_report_${Date.now()}.txt`;
    a.click();
  });

  clearHistoryBtn.addEventListener('click', () => {
    historyItems = [];
    renderHistoryGallery();
  });

  // Quick Voice Toggle Button
  const quickTtsToggleBtn = document.getElementById('quickTtsToggleBtn');
  const quickTtsIcon = document.getElementById('quickTtsIcon');
  const quickTtsText = document.getElementById('quickTtsText');

  function updateTtsUi() {
    if (configSettings.ttsEnabled) {
      quickTtsIcon.textContent = '🔊';
      quickTtsText.textContent = 'Voice ON';
      if (quickTtsToggleBtn) quickTtsToggleBtn.classList.add('active');
      if (configTtsToggle) configTtsToggle.checked = true;
    } else {
      quickTtsIcon.textContent = '🔇';
      quickTtsText.textContent = 'Voice OFF';
      if (quickTtsToggleBtn) quickTtsToggleBtn.classList.remove('active');
      if (configTtsToggle) configTtsToggle.checked = false;
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    }
  }

  if (quickTtsToggleBtn) {
    quickTtsToggleBtn.addEventListener('click', () => {
      configSettings.ttsEnabled = !configSettings.ttsEnabled;
      updateTtsUi();
    });
  }

  // Config Modal
  configToggleBtn.addEventListener('click', () => {
    configModal.classList.add('active');
  });

  closeConfigModalBtn.addEventListener('click', () => {
    configModal.classList.remove('active');
  });

  saveConfigBtn.addEventListener('click', () => {
    configSettings.apiKey = configApiKeyInput.value.trim();
    configSettings.model = configModelSelect.value;
    configSettings.ttsEnabled = configTtsToggle.checked;
    configSettings.sfxEnabled = configSfxToggle.checked;
    updateTtsUi();
    configModal.classList.remove('active');
    apiStatusText.textContent = `NVIDIA Vision (${configSettings.model.split('/')[1]})`;
  });

  // Initial UI sync
  updateTtsUi();

});
