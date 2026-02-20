
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SimulationService } from '../services/simulation.service';
import { AppModeService } from '../services/app-mode.service';
import { AiConsultantService } from '../services/ai-consultant.service';

@Component({
  selector: 'app-simulation-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (appMode.isSim()) {
      <div class="fixed bottom-0 left-0 w-full bg-zinc-950 border-t-4 border-amber-500 shadow-[0_-5px_20px_rgba(245,158,11,0.3)] z-[9999] animate-in slide-in-from-bottom duration-300 flex flex-col">
        
        <!-- EXPANDED PANEL (OVERRIDES) -->
        @if (expanded()) {
          <div class="bg-zinc-900/95 border-b border-zinc-800 p-4 grid grid-cols-1 md:grid-cols-4 gap-6 animate-in slide-in-from-bottom-10">
              
              <!-- 1. VIRTUAL HARDWARE -->
              <div class="space-y-3 border-r border-zinc-800 pr-4">
                  <h3 class="text-amber-500 font-black uppercase text-xs tracking-widest mb-2">Virtual Hardware</h3>
                  
                  <div class="grid grid-cols-2 gap-2">
                      <button (click)="toggleOverride('LIGHTS_A')" [class]="getOverrideClass('LIGHTS_A')">LIGHTS A</button>
                      <button (click)="toggleOverride('LIGHTS_B')" [class]="getOverrideClass('LIGHTS_B')">LIGHTS B</button>
                      <button (click)="toggleOverride('PUMP_A')" [class]="getOverrideClass('PUMP_A')">PUMP A</button>
                      <button (click)="toggleOverride('PUMP_B')" [class]="getOverrideClass('PUMP_B')">PUMP B</button>
                      <button (click)="toggleOverride('AC_A')" [class]="getOverrideClass('AC_A')">AC UNIT A</button>
                      <button (click)="toggleOverride('AC_B')" [class]="getOverrideClass('AC_B')">AC UNIT B</button>
                  </div>

                  <div class="control-group mt-2">
                      <label>Reservoir Level ({{ sim.reservoirLevel() | number:'1.0-0' }}%)</label>
                      <input type="range" [ngModel]="sim.reservoirLevel()" (ngModelChange)="sim.setReservoirLevel($event)" class="sim-range">
                  </div>
              </div>

              <!-- 2. IRRIGATION TRIGGERS -->
              <div class="space-y-3 border-r border-zinc-800 pr-4">
                  <h3 class="text-amber-500 font-black uppercase text-xs tracking-widest mb-2">Force Irrigation</h3>
                  
                  <div class="grid grid-cols-2 gap-x-4 gap-y-2">
                      <div class="text-[10px] text-zinc-500 font-bold text-center col-span-1">ROOM A</div>
                      <div class="text-[10px] text-zinc-500 font-bold text-center col-span-1">ROOM B</div>
                      
                      <button (click)="sim.triggerIrrigation('A', 'P1')" class="sim-btn-xs">P1 (RAMP)</button>
                      <button (click)="sim.triggerIrrigation('B', 'P1')" class="sim-btn-xs">P1 (RAMP)</button>
                      
                      <button (click)="sim.triggerIrrigation('A', 'P2')" class="sim-btn-xs">P2 (MAINT)</button>
                      <button (click)="sim.triggerIrrigation('B', 'P2')" class="sim-btn-xs">P2 (MAINT)</button>
                      
                      <button (click)="sim.triggerIrrigation('A', 'P3')" class="sim-btn-xs text-red-400 border-red-900">P3 (FLUSH)</button>
                      <button (click)="sim.triggerIrrigation('B', 'P3')" class="sim-btn-xs text-red-400 border-red-900">P3 (FLUSH)</button>
                  </div>
              </div>

              <!-- 3. AI & TIME -->
              <div class="space-y-3 col-span-2">
                  <h3 class="text-amber-500 font-black uppercase text-xs tracking-widest mb-2">Time & Intelligence</h3>
                  
                  <div class="grid grid-cols-2 gap-4">
                      <div class="control-group">
                          <label>Time Travel (Sim Date)</label>
                          <input type="datetime-local" (change)="updateSimDate($event)" class="sim-input">
                      </div>

                      <div class="control-group">
                          <label>AI Brain Model</label>
                          <div class="flex gap-1">
                              <button (click)="aiService.toggleProvider('GEMINI')" 
                                      [class]="aiService.activeProvider() === 'GEMINI' ? 'bg-amber-600 text-black' : 'bg-zinc-900 text-zinc-500'"
                                      class="flex-1 text-[10px] font-bold py-1 border border-zinc-700 rounded">GEMINI</button>
                              <button (click)="aiService.toggleProvider('OLLAMA')" 
                                      [class]="aiService.activeProvider() === 'OLLAMA' ? 'bg-amber-600 text-black' : 'bg-zinc-900 text-zinc-500'"
                                      class="flex-1 text-[10px] font-bold py-1 border border-zinc-700 rounded">OLLAMA</button>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
        }

        <!-- MAIN BAR -->
        <div class="p-4 max-w-[1600px] mx-auto w-full flex flex-col md:flex-row gap-6 items-center">
          
          <!-- HEADER -->
          <div class="flex items-center gap-4 min-w-[200px] cursor-pointer group" (click)="expanded.set(!expanded())">
             <div class="w-12 h-12 bg-amber-500 text-black flex items-center justify-center font-black text-2xl rounded animate-pulse group-hover:scale-110 transition-transform">
                {{ expanded() ? '▼' : '⚠' }}
             </div>
             <div>
                <h2 class="text-amber-500 font-black uppercase text-lg leading-none">Simulation<br>Control</h2>
                <span class="text-[10px] text-zinc-500 font-mono group-hover:text-amber-400 transition-colors">
                    {{ expanded() ? 'CLICK TO COLLAPSE' : 'CLICK TO EXPAND' }}
                </span>
             </div>
          </div>

          <!-- CONTROLS GRID -->
          <div class="flex-grow grid grid-cols-2 md:grid-cols-5 gap-4 w-full">
            
            <!-- Plant Count -->
            <div class="control-group">
               <label>Plant Count</label>
               <input type="number" [ngModel]="sim.config().plantCount" (ngModelChange)="update('plantCount', $event)" 
                      class="sim-input" min="0" max="200">
            </div>

            <!-- Growth Stage -->
            <div class="control-group">
               <label>Growth Day ({{ sim.config().growthStageDay }})</label>
               <input type="range" [ngModel]="sim.config().growthStageDay" (ngModelChange)="update('growthStageDay', $event)" 
                      class="sim-range" min="1" max="65">
            </div>

            <!-- Strain Multiplier -->
            <div class="control-group">
               <label>Strain Thirst ({{ sim.config().strainMultiplier }}x)</label>
               <input type="range" [ngModel]="sim.config().strainMultiplier" (ngModelChange)="update('strainMultiplier', $event)" 
                      class="sim-range" min="0.8" max="1.5" step="0.1">
            </div>

            <!-- Ambient Profile -->
            <div class="control-group">
               <label>Ambient Profile</label>
               <select [ngModel]="sim.config().ambientProfile" (ngModelChange)="update('ambientProfile', $event)" class="sim-input">
                  <option value="CASTLEGAR_SUMMER">CASTLEGAR SUMMER</option>
                  <option value="CASTLEGAR_WINTER">CASTLEGAR WINTER</option>
               </select>
            </div>

            <!-- Tick Speed -->
            <div class="control-group">
               <label>Tick Speed ({{ sim.config().tickSpeedMs }}ms)</label>
               <input type="range" [ngModel]="sim.config().tickSpeedMs" (ngModelChange)="update('tickSpeedMs', $event)" 
                      class="sim-range" min="10" max="2000" step="10" style="direction: rtl"> <!-- Right is faster (lower ms) -->
            </div>

          </div>

          <!-- ACTIONS -->
          <div class="flex flex-col gap-2 min-w-[150px]">
             <button (click)="sim.resetSimulation()" class="bg-zinc-800 hover:bg-red-900 text-zinc-400 hover:text-white border border-zinc-600 hover:border-red-500 font-bold text-xs py-2 px-4 rounded uppercase transition-colors">
                RESET PHYSICS
             </button>
             <div class="text-[10px] text-zinc-600 font-mono text-center">
                VWC LOAD: {{ (sim.roomA().vwc).toFixed(1) }}%
             </div>
          </div>

        </div>
      </div>
    }
  `,
  styles: [`
    .control-group {
      @apply flex flex-col gap-1;
    }
    .control-group label {
      @apply text-[10px] font-bold text-amber-600 uppercase tracking-wider;
    }
    .sim-input {
      @apply bg-zinc-900 border border-zinc-700 text-amber-500 text-xs p-2 rounded focus:border-amber-500 outline-none font-mono;
    }
    .sim-range {
      @apply w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500;
    }
    .sim-btn-xs {
        @apply bg-zinc-900 border border-zinc-700 text-zinc-400 hover:text-amber-400 hover:border-amber-500 text-[9px] font-bold py-1 px-2 rounded uppercase transition-all;
    }
  `]
})
export class SimulationControlPanelComponent {
  sim = inject(SimulationService);
  appMode = inject(AppModeService);
  aiService = inject(AiConsultantService);
  
  expanded = signal(false);
  
  // Track local override state for UI feedback
  overrides = signal<Record<string, boolean>>({});

  update(key: string, value: any) {
    this.sim.updateConfig({ [key]: value });
  }

  toggleOverride(deviceId: string) {
    const current = this.overrides()[deviceId] || false;
    const newState = !current;
    
    this.overrides.update(o => ({ ...o, [deviceId]: newState }));
    this.sim.overrideHardware(deviceId, newState);
  }

  getOverrideClass(deviceId: string) {
    const isActive = this.overrides()[deviceId];
    return isActive 
        ? 'sim-btn-xs bg-amber-900/30 text-amber-500 border-amber-500' 
        : 'sim-btn-xs';
  }

  updateSimDate(event: any) {
      if(event.target.value) {
          const date = new Date(event.target.value);
          this.sim.setTime(date.getTime());
      }
  }
}
