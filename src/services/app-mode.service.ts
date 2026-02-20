
import { Injectable, signal, effect, computed } from '@angular/core';

export type AppMode = 'LIVE' | 'SIM';

@Injectable({
  providedIn: 'root'
})
export class AppModeService {
  
  // The Master Toggle
  mode = signal<AppMode>('SIM'); // Default to SIM for safety

  // Computed properties for easy access
  isLive = computed(() => this.mode() === 'LIVE');
  isSim = computed(() => this.mode() === 'SIM');

  constructor() {
    // Persist mode selection if needed, or default to SIM on boot for safety
    const savedMode = localStorage.getItem('app_mode') as AppMode;
    if (savedMode) {
      this.mode.set(savedMode);
    }

    // Effect to handle side effects of mode switching
    effect(() => {
      const currentMode = this.mode();
      localStorage.setItem('app_mode', currentMode);
      
      if (currentMode === 'SIM') {
        document.body.classList.add('mode-sim');
        document.body.classList.remove('mode-live');
        console.warn('⚠️ APP MODE: SIMULATION ACTIVE. AIR GAP ENGAGED.');
      } else {
        document.body.classList.add('mode-live');
        document.body.classList.remove('mode-sim');
        console.log('🔴 APP MODE: LIVE. CONNECTING TO HARDWARE...');
      }
    });
  }

  setMode(newMode: AppMode) {
    if (newMode === this.mode()) return;
    
    // Logic to cleanly tear down or spin up connections could go here
    // or be reactive in other services based on the signal.
    
    this.mode.set(newMode);
  }

  toggleMode() {
    this.setMode(this.isLive() ? 'SIM' : 'LIVE');
  }
}
