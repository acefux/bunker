
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class SoundService {
  private audioCtx: AudioContext;
  private masterGain: GainNode;
  private initialized = false;

  constructor() {
    const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    this.audioCtx = new AudioContext();
    this.masterGain = this.audioCtx.createGain();
    this.masterGain.gain.value = 0.3; // Default volume
    this.masterGain.connect(this.audioCtx.destination);
  }

  // Must be called after a user interaction to unlock AudioContext
  init() {
    if (!this.initialized) {
      this.audioCtx.resume();
      this.playBootSequence();
      this.initialized = true;
    }
  }

  playBootSequence() {
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    
    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(50, this.audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1000, this.audioCtx.currentTime + 0.5);
    
    gain.gain.setValueAtTime(0, this.audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.5, this.audioCtx.currentTime + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.5);

    osc.start();
    osc.stop(this.audioCtx.currentTime + 0.5);
  }

  playValveOpen() {
    // Hydraulic Hiss (White Noise)
    const bufferSize = this.audioCtx.sampleRate * 0.5; // 0.5 seconds
    const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.audioCtx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = this.audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;

    const gain = this.audioCtx.createGain();
    gain.gain.setValueAtTime(0.4, this.audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.5);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    
    noise.start();
  }

  playAlert() {
    // Industrial Klaxon
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    
    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.type = 'square';
    osc.frequency.setValueAtTime(150, this.audioCtx.currentTime);
    osc.frequency.linearRampToValueAtTime(100, this.audioCtx.currentTime + 0.3);
    
    gain.gain.setValueAtTime(0.5, this.audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.audioCtx.currentTime + 0.3);

    osc.start();
    osc.stop(this.audioCtx.currentTime + 0.3);
  }

  playClick() {
    // Sharp mechanical click
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    
    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.type = 'square';
    osc.frequency.setValueAtTime(800, this.audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, this.audioCtx.currentTime + 0.05);
    
    gain.gain.setValueAtTime(0.2, this.audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.05);

    osc.start();
    osc.stop(this.audioCtx.currentTime + 0.05);
  }

  playRelay() {
    // Heavy mechanical clunk
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    
    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.type = 'square';
    osc.frequency.setValueAtTime(100, this.audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, this.audioCtx.currentTime + 0.1);
    
    gain.gain.setValueAtTime(0.4, this.audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.1);

    osc.start();
    osc.stop(this.audioCtx.currentTime + 0.1);
  }

  playHum() {
    // Low frequency hum
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    
    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.type = 'sawtooth';
    osc.frequency.value = 60;
    
    gain.gain.setValueAtTime(0.1, this.audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.audioCtx.currentTime + 0.5);

    osc.start();
    osc.stop(this.audioCtx.currentTime + 0.5);
  }

  playPerfectHit() {
    // Positive feedback sound
    const now = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1760, now + 0.1);
    
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    
    osc.start();
    osc.stop(now + 0.3);
  }

  playError() {
    // Negative feedback sound
    const now = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.linearRampToValueAtTime(100, now + 0.2);
    
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.2);
    
    osc.start();
    osc.stop(now + 0.2);
  }

  playAchievement() {
    // High-pitched chime
    const now = this.audioCtx.currentTime;
    [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        
        osc.type = 'sine';
        osc.frequency.value = freq;
        
        const start = now + (i * 0.1);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.2, start + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
        
        osc.start(start);
        osc.stop(start + 0.4);
    });
  }

  // --- BACKGROUND LOOPS ---
  private bgOsc: OscillatorNode | null = null;
  private bgGain: GainNode | null = null;

  startBackgroundLoop() {
      if (this.bgOsc) return;

      this.bgOsc = this.audioCtx.createOscillator();
      this.bgGain = this.audioCtx.createGain();

      this.bgOsc.connect(this.bgGain);
      this.bgGain.connect(this.masterGain);

      // Low rumble (HVAC/Fans)
      this.bgOsc.type = 'sawtooth';
      this.bgOsc.frequency.value = 40;
      
      this.bgGain.gain.value = 0.05;

      this.bgOsc.start();
  }

  stopBackgroundLoop() {
      if (this.bgOsc) {
          this.bgOsc.stop();
          this.bgOsc.disconnect();
          this.bgOsc = null;
      }
  }
}
