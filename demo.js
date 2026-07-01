  let GestureRecognizer, FilesetResolver, DrawingUtils;

  const SIGN_MAP = {
    "Thumb_Up": "Like",
    "Thumb_Down": "Dislike",
    "Open_Palm": "Hello",
    "Closed_Fist": "Fist",
    "Victory": "Peace",
    "Pointing_Up": "Pointing_Up",
    "ILoveYou": "I Love You",
    "None": "No gesture"
  };

  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const demoPlaceholder = document.getElementById('demoPlaceholder');
  const video = document.getElementById('demoVideo');
  const overlay = document.getElementById('demoOverlay');
  const btnCamera = document.getElementById('btnCamera');
  const btnUpload = document.getElementById('btnUpload');
  const btnStop = document.getElementById('btnStop');
  const fileInput = document.getElementById('fileInput');
  const resultSign = document.getElementById('resultSign');
  const resultHand = document.getElementById('resultHand');
  const resultConf = document.getElementById('resultConf');
  const confFill = document.getElementById('confFill');

  let gestureRecognizer = null;
  let runningMode = "IMAGE";
  let stream = null;
  let rafId = null;
  const overlayCtx = overlay.getContext('2d');

  function setStatus(text, state){
    statusText.textContent = text;
    statusDot.className = 'status-dot' + (state ? ' ' + state : '');
  }

  function showResult(categoryName, score, handLabel){
    const label = SIGN_MAP[categoryName] || categoryName;
    resultSign.textContent = label;
    resultHand.textContent = "Hand: " + (handLabel || "—");
    resultConf.textContent = "Confidence: " + (score ? Math.round(score*100) + "%" : "—");
    confFill.style.width = (score ? Math.round(score*100) : 0) + "%";
  }

  function clearResult(){
    resultSign.textContent = "—";
    resultHand.textContent = "Hand: —";
    resultConf.textContent = "Confidence: —";
    confFill.style.width = "0%";
  }

  async function initRecognizer(){
    setStatus("Loading model…", "loading");
    try {
      if(!GestureRecognizer){
        const mod = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14");
        GestureRecognizer = mod.GestureRecognizer;
        FilesetResolver = mod.FilesetResolver;
        DrawingUtils = mod.DrawingUtils;
      }
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );
      gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "assets/gesture_recognizer.task"
        },
        runningMode: runningMode,
        numHands: 2
      });
      setStatus("Model ready", "live");
      return true;
    } catch (err) {
      console.error(err);
      setStatus("Model failed to load — check internet connection", null);
      return false;
    }
  }

  async function ensureRunningMode(mode){
    if(!gestureRecognizer) return;
    if(runningMode !== mode){
      runningMode = mode;
      await gestureRecognizer.setOptions({ runningMode: mode });
    }
  }

  // ---- CAMERA MODE ----
  async function startCamera(){
    if(!gestureRecognizer){
      const ok = await initRecognizer();
      if(!ok) return;
    }
    await ensureRunningMode("VIDEO");

    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true });
    } catch(err){
      setStatus("Camera permission denied", null);
      return;
    }

    video.srcObject = stream;
    demoPlaceholder.style.display = 'none';
    video.style.display = 'block';
    overlay.style.display = 'block';

    video.addEventListener('loadedmetadata', () => {
      overlay.width = video.videoWidth;
      overlay.height = video.videoHeight;
    }, { once: true });

    btnCamera.disabled = true;
    btnUpload.disabled = true;
    btnStop.disabled = false;
    setStatus("Camera live — detecting…", "live");

    predictLoop();
  }

  function predictLoop(){
    if(!stream) return;
    const now = performance.now();
    if(video.readyState >= 2){
      const result = gestureRecognizer.recognizeForVideo(video, now);
      overlayCtx.save();
      overlayCtx.clearRect(0,0,overlay.width, overlay.height);

      if(result.landmarks && result.landmarks.length > 0){
        const drawer = new DrawingUtils(overlayCtx);
        for(const lm of result.landmarks){
          drawer.drawConnectors(lm, GestureRecognizer.HAND_CONNECTIONS, { color: "#8B5CF6", lineWidth: 2 });
          drawer.drawLandmarks(lm, { color: "#007AFF", radius: 3 });
        }
      }
      overlayCtx.restore();

      if(result.gestures && result.gestures.length > 0){
        const top = result.gestures[0][0];
        const handLabel = result.handedness && result.handedness[0] ? result.handedness[0][0].categoryName : "—";
        showResult(top.categoryName, top.score, handLabel);
      } else {
        clearResult();
      }
    }
    rafId = requestAnimationFrame(predictLoop);
  }

  function stopCamera(){
    if(rafId) cancelAnimationFrame(rafId);
    if(stream){
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    video.style.display = 'none';
    overlay.style.display = 'none';
    demoPlaceholder.style.display = 'block';
    demoPlaceholder.textContent = "Start your camera or upload a photo to begin";
    btnCamera.disabled = false;
    btnUpload.disabled = false;
    btnStop.disabled = true;
    clearResult();
    setStatus("Stopped", null);
  }

  // ---- IMAGE UPLOAD MODE ----
  async function handleImageUpload(file){
    if(!gestureRecognizer){
      const ok = await initRecognizer();
      if(!ok) return;
    }
    await ensureRunningMode("IMAGE");
    stopCamera();

    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      demoPlaceholder.style.display = 'none';
      overlay.style.display = 'block';
      overlay.width = img.width;
      overlay.height = img.height;
      overlayCtx.drawImage(img, 0, 0, img.width, img.height);

      const result = gestureRecognizer.recognize(img);

      if(result.landmarks && result.landmarks.length > 0){
        const drawer = new DrawingUtils(overlayCtx);
        for(const lm of result.landmarks){
          drawer.drawConnectors(lm, GestureRecognizer.HAND_CONNECTIONS, { color: "#8B5CF6", lineWidth: 2 });
          drawer.drawLandmarks(lm, { color: "#007AFF", radius: 4 });
        }
      }

      if(result.gestures && result.gestures.length > 0){
        const top = result.gestures[0][0];
        const handLabel = result.handedness && result.handedness[0] ? result.handedness[0][0].categoryName : "—";
        showResult(top.categoryName, top.score, handLabel);
        setStatus("Detected from photo", "live");
      } else {
        clearResult();
        setStatus("No hand detected in photo", null);
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  btnCamera.addEventListener('click', startCamera);
  btnStop.addEventListener('click', stopCamera);
  btnUpload.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    if(e.target.files && e.target.files[0]){
      handleImageUpload(e.target.files[0]);
    }
  });

  // preload model lazily when demo section enters view
  const demoSection = document.getElementById('demo');
  const demoObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if(entry.isIntersecting && !gestureRecognizer){
        initRecognizer();
        demoObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.2 });
  demoObserver.observe(demoSection);
