// Business card capture -> OCR -> editable contact form -> vCard save.

const CardScanner = (() => {
  let capturedCanvas = null;
  let photoBase64Full = ''; // for on-screen preview
  let photoBase64Jpeg = ''; // raw base64 (no data: prefix) embedded in the vCard

  const els = {};
  function cacheEls() {
    els.video = document.getElementById('card-video');
    els.stepCapture = document.getElementById('card-step-capture');
    els.stepReview = document.getElementById('card-step-review');
    els.shutter = document.getElementById('card-shutter');
    els.pickFile = document.getElementById('card-pick-file');
    els.fileInput = document.getElementById('card-file-input');
    els.camStatus = document.getElementById('card-cam-status');
    els.photoImg = document.getElementById('card-photo-img');
    els.rawToggle = document.getElementById('card-raw-toggle');
    els.rawText = document.getElementById('card-raw-text');
    els.saveBtn = document.getElementById('card-save-btn');
    els.retakeBtn = document.getElementById('card-retake-btn');
  }

  async function start() {
    cacheEls();
    resetToCapture();
    els.camStatus.textContent = 'Starting camera…';
    const ok = await Camera.start(els.video);
    els.camStatus.textContent = ok ? '' : 'Camera unavailable — use the photo picker instead.';
  }

  function resetToCapture() {
    els.stepCapture.style.display = 'block';
    els.stepReview.style.display = 'none';
  }

  function reset() {
    Camera.stop();
    capturedCanvas = null;
    if (els.stepCapture) resetToCapture();
  }

  async function handleCanvas(canvas) {
    Camera.stop();
    capturedCanvas = canvas;
    photoBase64Full = canvas.toDataURL('image/jpeg', 0.85);
    els.photoImg.src = photoBase64Full;

    els.stepCapture.style.display = 'none';
    els.stepReview.style.display = 'flex';
    els.rawText.classList.remove('show');
    els.rawToggle.textContent = 'Show recognized text';

    showOverlay('Reading card… 0%');
    try {
      const thumb = downscaleCanvas(canvas, 640);
      photoBase64Jpeg = thumb.toDataURL('image/jpeg', 0.7).split(',')[1];

      const text = await OCR.recognize(canvas, (p) => {
        showOverlay(`Reading card… ${Math.round(p * 100)}%`);
      });
      const fields = extractContact(text);
      fillForm(fields);
      els.rawText.textContent = text.trim() || '(no text recognized)';
    } catch (err) {
      console.error(err);
      toast('Could not read text automatically — please fill fields manually.');
    } finally {
      hideOverlay();
    }
  }

  function fillForm(f) {
    document.getElementById('f-name').value = f.name || '';
    document.getElementById('f-title').value = f.title || '';
    document.getElementById('f-company').value = f.company || '';
    document.getElementById('f-phone1').value = f.phone1 || '';
    document.getElementById('f-phone2').value = f.phone2 || '';
    document.getElementById('f-email').value = f.email || '';
    document.getElementById('f-website').value = f.website || '';
    document.getElementById('f-address').value = f.address || '';
  }

  function readForm() {
    return {
      name: document.getElementById('f-name').value.trim(),
      title: document.getElementById('f-title').value.trim(),
      company: document.getElementById('f-company').value.trim(),
      phone1: document.getElementById('f-phone1').value.trim(),
      phone2: document.getElementById('f-phone2').value.trim(),
      email: document.getElementById('f-email').value.trim(),
      website: document.getElementById('f-website').value.trim(),
      address: document.getElementById('f-address').value.trim()
    };
  }

  function downscaleCanvas(canvas, maxWidth) {
    if (canvas.width <= maxWidth) return canvas;
    const scale = maxWidth / canvas.width;
    const out = document.createElement('canvas');
    out.width = maxWidth;
    out.height = Math.round(canvas.height * scale);
    out.getContext('2d').drawImage(canvas, 0, 0, out.width, out.height);
    return out;
  }

  function saveContact() {
    const fields = readForm();
    if (!fields.name) {
      toast('Please enter at least a name.');
      return;
    }
    const vcard = buildVCard(fields, photoBase64Jpeg);
    const blob = new Blob([vcard], { type: 'text/vcard' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fields.name.replace(/[^a-z0-9]+/gi, '_') || 'contact'}.vcf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);

    Store.add({ type: 'card', title: fields.name });
    toast('Contact file downloaded — tap it to add to Contacts.');
  }

  function bindEvents() {
    cacheEls();

    els.shutter.addEventListener('click', () => {
      if (!Camera.stream) return;
      handleCanvas(Camera.capture());
    });

    els.pickFile.addEventListener('click', () => els.fileInput.click());
    els.fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const canvas = await fileToCanvas(file);
      handleCanvas(canvas);
      e.target.value = '';
    });

    els.rawToggle.addEventListener('click', () => {
      els.rawText.classList.toggle('show');
      els.rawToggle.textContent = els.rawText.classList.contains('show')
        ? 'Hide recognized text' : 'Show recognized text';
    });

    els.saveBtn.addEventListener('click', saveContact);
    els.retakeBtn.addEventListener('click', () => start());
  }

  function fileToCanvas(file) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);
        URL.revokeObjectURL(img.src);
        resolve(canvas);
      };
      img.src = URL.createObjectURL(file);
    });
  }

  document.addEventListener('DOMContentLoaded', bindEvents);

  return { start, reset };
})();

window.CardScanner = CardScanner;
