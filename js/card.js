// Thin wrapper around getUserMedia so card.js / document.js don't duplicate camera plumbing.

const Camera = {
  stream: null,
  videoEl: null,

  async start(videoEl) {
    this.videoEl = videoEl;
    this.stop();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } },
        audio: false
      });
      videoEl.srcObject = this.stream;
      await videoEl.play();
      return true;
    } catch (err) {
      console.error('Camera error', err);
      return false;
    }
  },

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
  },

  // Grabs the current video frame as a canvas at native resolution.
  capture() {
    const v = this.videoEl;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    return canvas;
  }
};

window.Camera = Camera;
