// All sound is synthesised with WebAudio: no audio files, no network. A small
// dawn music loop (a slow pentatonic arpeggio), an engine hum that follows the
// player's speed, a two-tone siren while wanted, and one-shot blips for pickup,
// cash, punch and capture. The context starts on the first user gesture.
export function createAudio() {
  let context = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let musicTimer = 0;
  let muted = false;
  let musicStep = 0;

  // A slow, warm arpeggio in A minor pentatonic, one note every 0.42 s.
  const MELODY = [220, 261.63, 329.63, 392, 440, 392, 329.63, 261.63];

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      const engineFilter = context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      sirenOsc = context.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 720;
      sirenGain = context.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      return true;
    } catch {
      return false;
    }
  }

  function blip(frequency, duration, type, volume) {
    if (!context || muted) return;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(volume || 0.2, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(context.currentTime + duration);
  }

  return {
    /** Call from any user gesture; safe to call repeatedly. */
    unlock() {
      if (ensure() && context.state === 'suspended') context.resume();
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted() {
      return muted;
    },
    pickup() {
      blip(660, 0.12, 'sine', 0.25);
      setTimeout(() => blip(990, 0.16, 'sine', 0.25), 90);
    },
    cash() {
      blip(880, 0.1, 'triangle', 0.22);
      setTimeout(() => blip(1174, 0.2, 'triangle', 0.22), 80);
    },
    punch() {
      blip(140, 0.09, 'square', 0.18);
    },
    hurt() {
      blip(110, 0.18, 'sawtooth', 0.2);
    },
    capture() {
      [523, 659, 784].forEach((frequency, index) => {
        setTimeout(() => blip(frequency, 0.18, 'sine', 0.22), index * 110);
      });
    },
    fail() {
      [330, 262, 196].forEach((frequency, index) => {
        setTimeout(() => blip(frequency, 0.22, 'triangle', 0.2), index * 130);
      });
    },
    /** Per-frame update: engine pitch, siren wail and the music loop. */
    update(dt, speed, wanted, playing) {
      if (!context || muted) return;
      if (engineGain) {
        const target = playing ? 0.02 + Math.min(0.09, Math.abs(speed) / 430 * 0.09) : 0;
        engineGain.gain.setTargetAtTime(target, context.currentTime, 0.1);
        engineOsc.frequency.setTargetAtTime(50 + Math.abs(speed) * 0.22, context.currentTime, 0.1);
      }
      if (sirenGain) {
        if (wanted > 0 && playing) {
          sirenTimer += dt;
          const tone = Math.sin(sirenTimer * 4.2) > 0 ? 780 : 580;
          sirenOsc.frequency.setTargetAtTime(tone, context.currentTime, 0.05);
          sirenGain.gain.setTargetAtTime(0.035, context.currentTime, 0.2);
        } else {
          sirenGain.gain.setTargetAtTime(0, context.currentTime, 0.2);
        }
      }
      if (playing) {
        musicTimer += dt;
        if (musicTimer >= 0.42) {
          musicTimer -= 0.42;
          blip(MELODY[musicStep % MELODY.length], 0.36, 'sine', 0.07);
          musicStep += 1;
        }
      }
    },
  };
}
