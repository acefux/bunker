
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FacilityService } from './services/facility.service';
import { ThemeService } from './services/theme.service';
import { SoundService } from './services/sound.service';
import { GamificationService } from './services/gamification.service';
import { RoomCardComponent } from './components/room-card.component';
import { VegCardComponent } from './components/veg-card.component';
import { ConsultantComponent } from './components/consultant.component';
import { TickerComponent } from './components/ticker.component';
import { SimulationControlsComponent } from './components/simulation-controls.component';
import { DebugConsoleComponent } from './components/debug-console.component';
import { DevTerminalComponent } from './components/dev-terminal.component'; // NEW
import { AiConsultantService } from './services/ai-consultant.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RoomCardComponent, VegCardComponent, ConsultantComponent, TickerComponent, SimulationControlsComponent, DebugConsoleComponent, DevTerminalComponent],
  templateUrl: './app.component.html',
})
export class AppComponent {
  facility = inject(FacilityService);
  aiService = inject(AiConsultantService);
  theme = inject(ThemeService);
  sound = inject(SoundService);
  gamification = inject(GamificationService);

  formatTime(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }
}
