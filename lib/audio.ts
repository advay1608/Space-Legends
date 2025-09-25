// This is the main audio interface for the browser.
let audioCtx: AudioContext | null = null;
// Browsers require a user interaction (like a click) before audio can play.
// This flag tracks if the user has "unlocked" audio yet.
let audioUnlocked = false;

/**
 * Initializes the AudioContext. This should be called once when the game loads.
 */
export function initAudio() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioUnlocked = false;
  } catch(e) {
    console.error("Web Audio API is not supported in this browser");
  }
}

/**
 * Plays a synthesized sound based on a given name.
 * @param sound The name of the sound to play (e.g., 'pew', 'boom').
 */
export function play(sound: string) {
  if (!audioCtx || !audioUnlocked) return;

  // Create an oscillator (generates a wave) and a gain node (controls volume)
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  const now = audioCtx.currentTime;

  // Use a switch statement to play a different sound for each name
  switch (sound) {
    case 'new_shot':
    case 'pew':
      // A high-pitched laser zap
      gain.gain.setValueAtTime(0.08, now);
      osc.frequency.setValueAtTime(1200, now);
      // Make the sound fade out and drop in pitch quickly
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
      osc.frequency.exponentialRampToValueAtTime(100, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
      break;

    case 'boom':
      // A low, noisy explosion
      osc.type = 'sawtooth'; // A harsher, buzzier waveform
      gain.gain.setValueAtTime(0.2, now);
      osc.frequency.setValueAtTime(300, now);
      // Fade out and drop pitch over a longer duration
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
      osc.frequency.exponentialRampToValueAtTime(50, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
      break;
    
    case 'hit':
      // A short, noisy hit sound
      osc.type = 'square';
      gain.gain.setValueAtTime(0.15, now);
      osc.frequency.setValueAtTime(400, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
      break;
    
    case 'power':
      // An ascending "power up" chime
      gain.gain.setValueAtTime(0.1, now);
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
      break;

    default:
      // A fallback beep if the sound name is unknown
      osc.frequency.setValueAtTime(200, now);
      gain.gain.setValueAtTime(0.1, now);
      osc.start(now);
      osc.stop(now + 0.1);
      break;
  }
}

// This event listener waits for the first click on the page to unlock the audio.
// This is a requirement in all modern browsers.
window.addEventListener('click', () => {
  if (audioCtx && !audioUnlocked) {
    audioCtx.resume().then(() => { 
      audioUnlocked = true;
      console.log('Audio Unlocked');
    });
  }
}, { once: true }); // The `{ once: true }` option automatically removes the listener after it runs.