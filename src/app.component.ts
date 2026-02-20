
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FacilityService } from './services/facility.service';
import { ThemeService } from './services/theme.service';
import { SoundService } from './services/sound.service';
import { GamificationService } from './services/gamification.service';
import { AppModeService } from './services/app-mode.service';
import { RoomCardComponent } from './components/room-card.component';
import { VegCardComponent } from './components/veg-card.component';
import { ConsultantComponent } from './components/consultant.component';
import { TickerComponent } from './components/ticker.component';
import { DebugConsoleComponent } from './components/debug-console.component';
import { AiConsultantService } from './services/ai-consultant.service';

import { SimulationControlPanelComponent } from './components/simulation-control-panel.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RoomCardComponent, VegCardComponent, ConsultantComponent, TickerComponent, DebugConsoleComponent, SimulationControlPanelComponent],
  templateUrl: './app.component.html',
})
export class AppComponent {
  facility = inject(FacilityService);
  aiService = inject(AiConsultantService);
  theme = inject(ThemeService);
  sound = inject(SoundService);
  gamification = inject(GamificationService);
  appMode = inject(AppModeService);

  formatTime(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }
}
