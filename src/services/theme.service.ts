
import { Injectable, inject, effect, signal } from '@angular/core';
import { FacilityService } from './facility.service';
import { SoundService } from './sound.service';

export type ThemeMode = 'NOMINAL' | 'FROST' | 'HEAT_WAVE';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private facility = inject(FacilityService);
  private sound = inject(SoundService);

  activeTheme = signal<ThemeMode>('NOMINAL');
  overrideTheme = signal<ThemeMode | null>(null);

  constructor() {
    effect(() => {
        // Priority 1: Manual Override
        const manual = this.overrideTheme();
        if (manual) {
            if (this.activeTheme() !== manual) {
                this.setTheme(manual);
            }
            return;
        }

        // Priority 2: Automatic Sensor Logic
        const roomA = this.facility.roomA();
        const roomB = this.facility.roomB();

        // HEAT WAVE LOGIC
        // Trigger: Any room > 95F (35°C) OR Sensor Error
        if (roomA.temp > 95 || roomB.temp > 95 || roomA.sensorStatus === 'ERROR' || roomB.sensorStatus === 'ERROR') {
            if (this.activeTheme() !== 'HEAT_WAVE') {
                this.setTheme('HEAT_WAVE');
                this.sound.playAlert();
            }
        }
        // FROST LOGIC
        // Trigger: Room A is late flower (>50 days) AND temp < 59F (15°C)
        else if (roomA.dayOfCycle > 50 && roomA.temp < 59) {
             if (this.activeTheme() !== 'FROST') {
                 this.setTheme('FROST');
             }
        }
        // NOMINAL
        else {
            if (this.activeTheme() !== 'NOMINAL') {
                this.setTheme('NOMINAL');
            }
        }
    });
  }

  setTheme(theme: ThemeMode) {
      this.activeTheme.set(theme);
      
      // Update Body Classes
      if (typeof document !== 'undefined') {
          const body = document.body;
          body.classList.remove('theme-frost', 'theme-heat-wave');
          
          if (theme === 'FROST') {
              body.classList.add('theme-frost');
          } else if (theme === 'HEAT_WAVE') {
              body.classList.add('theme-heat-wave');
          }
      }
  }
}
