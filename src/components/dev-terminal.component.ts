
import { Component, inject, signal, HostListener, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ThemeService, ThemeMode } from '../services/theme.service';
import { GamificationService } from '../services/gamification.service';
import { FacilityService } from '../services/facility.service';
import { LogService } from '../services/log.service';
import { AiConsultantService } from '../services/ai-consultant.service';
import { ChaosService } from '../services/chaos.service';
import { OllamaService } from '../services/ollama.service';
import { RoomState } from '../models';

@Component({
  selector: 'app-dev-terminal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (isVisible()) {
      <div class="fixed z-[9999] w-[650px] font-mono rounded-lg overflow-hidden shadow-[0_0_50px_#00ff00]"
           [style.top.px]="position.y" 
           [style.left.px]="position.x"
           style="background-color: rgba(0, 15, 0, 0.98); border: 2px solid #00ff41;">
        
        <!-- Draggable Header -->
        <div class="bg-black/90 p-3 cursor-move border-b border-green-500 flex justify-between items-center select-none"
             (mousedown)="startDrag($event)">
          <div class="text-green-400 font-bold text-sm uppercase flex items-center gap-2 tracking-widest">
             <span class="material-icons text-base text-green-400">terminal</span>
             COMMAND_CONSOLE_V2.3 // SEVERITY_LINK
          </div>
          <button (click)="isVisible.set(false)" class="text-green-600 hover:text-green-200 font-bold text-lg">[X]</button>
        </div>

        <!-- === 16-DIODE HUD (Room A & B) === -->
        <div class="bg-black border-b border-green-800 p-4 space-y-4 relative">
            
            <!-- ROOM A DIODES -->
            <div class="flex items-center gap-4">
                <div class="flex flex-col items-end w-16">
                     <span class="text-xs font-bold text-green-500">ROOM A</span>
                     <span class="text-[10px] font-mono text-zinc-500">{{ facility.roomA().phase }}</span>
                </div>
                
                <div class="flex-1 h-6 bg-black rounded-sm border border-green-900/50 relative overflow-hidden flex gap-[2px] p-[2px]">
                    @if (isCriticalA()) {
                        <!-- STATE 3: CRITICAL FAILURE (RED CYLON SWEEP) -->
                        <div class="scanner-bar-red h-full w-[15%] bg-[#FF0000] opacity-80 blur-md absolute top-0 z-20"></div>
                        @for (i of diodeIndices; track i) {
                             <div class="flex-1 h-full bg-[#FF0000]/20 z-10 border-r border-black/80 last:border-0"></div>
                        }
                    } @else if (isNominalA()) {
                        <!-- STATE 1: ALL CLEAR (TRANQUIL PULSE) -->
                         <div class="scanner-bar-tranquil h-full w-[40%] bg-gradient-to-r from-transparent via-[#00FF41] to-transparent opacity-30 blur-xl absolute top-0 z-20"></div>
                         <!-- Dim Base State -->
                         @for (i of diodeIndices; track i) {
                             <div class="flex-1 h-full bg-[#00FF41]/15 z-10 border-r border-[#00FF41]/10 last:border-0"></div>
                         }
                    } @else {
                        <!-- STATE 2: DIAGNOSTIC (SEVERITY BLOCKS) -->
                         @for (color of diodeColorsA(); track $index) {
                             <div class="flex-1 h-full border-r border-black/80 last:border-0 transition-colors duration-200"
                                  [class]="color"></div>
                         }
                    }
                </div>
            </div>

            <!-- ROOM B DIODES -->
            <div class="flex items-center gap-4">
                <div class="flex flex-col items-end w-16">
                     <span class="text-xs font-bold text-green-500">ROOM B</span>
                     <span class="text-[10px] font-mono text-zinc-500">{{ facility.roomB().phase }}</span>
                </div>
                
                <div class="flex-1 h-6 bg-black rounded-sm border border-green-900/50 relative overflow-hidden flex gap-[2px] p-[2px]">
                    @if (isCriticalB()) {
                        <div class="scanner-bar-red h-full w-[15%] bg-[#FF0000] opacity-80 blur-md absolute top-0 z-20"></div>
                        @for (i of diodeIndices; track i) {
                             <div class="flex-1 h-full bg-[#FF0000]/20 z-10 border-r border-black/80 last:border-0"></div>
                        }
                    } @else if (isNominalB()) {
                         <div class="scanner-bar-tranquil h-full w-[40%] bg-gradient-to-r from-transparent via-[#00FF41] to-transparent opacity-30 blur-xl absolute top-0 z-20"></div>
                         @for (i of diodeIndices; track i) {
                             <div class="flex-1 h-full bg-[#00FF41]/15 z-10 border-r border-[#00FF41]/10 last:border-0"></div>
                         }
                    } @else {
                         @for (color of diodeColorsB(); track $index) {
                             <div class="flex-1 h-full border-r border-black/80 last:border-0 transition-colors duration-200"
                                  [class]="color"></div>
                         }
                    }
                </div>
            </div>

            <!-- Legend for Diagnostic Mode -->
            <div class="flex justify-between px-16 text-[10px] text-zinc-500 uppercase font-mono tracking-wider font-bold">
                <span>[1-4] TEMP</span>
                <span>[5-8] VWC</span>
                <span>[9-12] VPD</span>
                <span>[13-16] CO2 (ppm)</span>
            </div>
            <div class="flex justify-center gap-6 text-[10px] text-zinc-500 uppercase font-mono border-t border-green-900/30 pt-2 font-bold">
                <span class="flex items-center gap-2"><span class="w-2 h-2 bg-[#00FF41]"></span>NOMINAL</span>
                <span class="flex items-center gap-2"><span class="w-2 h-2 bg-[#FFB000]"></span>WARNING</span>
                <span class="flex items-center gap-2"><span class="w-2 h-2 bg-[#FF0000]"></span>CRITICAL</span>
            </div>
        </div>

        <!-- TELEMETRY LOG -->
        <div class="h-32 bg-black/90 p-3 overflow-y-auto text-xs font-mono leading-tight border-b border-green-800 custom-scroll">
            @for (log of telemetryLogs(); track $index) {
                <div class="truncate mb-1" 
                     [class.text-green-400]="!log.message.includes('WARN')"
                     [class.text-amber-400]="log.message.includes('WARN')"
                     [class.text-cyan-400]="log.message.includes('ACTION')">
                    <span class="opacity-50">[{{ log.timestamp | date:'HH:mm:ss' }}]</span> {{ log.message }}
                </div>
            }
        </div>

        <!-- TABS -->
        <div class="flex border-b border-green-800 bg-black text-xs font-bold">
            <button (click)="activeTab.set('SIMULATION')" 
                    [class]="activeTab() === 'SIMULATION' ? 'bg-green-900 text-green-300' : 'text-green-700 hover:text-green-500'"
                    class="flex-1 py-2 border-r border-green-900">SIMULATION</button>
            <button (click)="activeTab.set('CHAOS')" 
                    [class]="activeTab() === 'CHAOS' ? 'bg-green-900 text-green-300' : 'text-green-700 hover:text-green-500'"
                    class="flex-1 py-2 border-r border-green-900">CHAOS / HARDWARE</button>
            <button (click)="activeTab.set('TUNING')" 
                    [class]="activeTab() === 'TUNING' ? 'bg-green-900 text-green-300' : 'text-green-700 hover:text-green-500'"
                    class="flex-1 py-2">TUNING / GAMING</button>
        </div>

        <!-- CONTENT AREA -->
        <div class="p-4 h-[40vh] overflow-y-auto custom-scroll bg-black/80">

            <!-- TAB 1: SIMULATION CONTROLS -->
            @if (activeTab() === 'SIMULATION') {
                <div class="space-y-5">
                     <!-- Time Dilation -->
                     <div class="control-group">
                        <label>Time Dilation ({{ facility.simSpeed() }}x)</label>
                        <div class="flex items-center gap-3">
                             <input type="range" min="0.1" max="1000" step="0.1" 
                                    [ngModel]="facility.simSpeed()" 
                                    (ngModelChange)="facility.setSimSpeed($event)"
                                    class="term-range">
                             <button (click)="facility.setSimSpeed(1)" class="term-btn-xs">RESET</button>
                        </div>
                     </div>

                     <!-- Playback -->
                     <div class="flex gap-2">
                         <button (click)="facility.togglePause()" 
                                 [class]="facility.simPaused() ? 'bg-green-600 text-black' : 'bg-black text-green-500 border-green-500'"
                                 class="term-btn flex-1 border py-3 text-sm">
                            {{ facility.simPaused() ? '▶ RESUME' : '⏸ PAUSE' }}
                         </button>
                     </div>

                     <!-- Clock Travel -->
                     <div class="control-group">
                        <label>Time Travel (Global Clock)</label>
                        <input type="datetime-local" 
                               (change)="updateSimDate($event)"
                               class="w-full bg-green-900/20 border border-green-700 text-green-300 text-sm p-2 rounded font-mono outline-none">
                     </div>

                     <!-- AI Model -->
                     <div class="control-group">
                        <label>AI Brain Model</label>
                        <div class="flex gap-2">
                            <button (click)="aiService.toggleProvider('GEMINI')" 
                                    [class]="aiService.activeProvider() === 'GEMINI' ? 'bg-green-700 text-white' : 'bg-black text-green-700 border-green-900'"
                                    class="term-btn flex-1 border">GEMINI 2.5</button>
                            <button (click)="aiService.toggleProvider('OLLAMA')" 
                                    [class]="aiService.activeProvider() === 'OLLAMA' ? 'bg-green-700 text-white' : 'bg-black text-green-700 border-green-900'"
                                    class="term-btn flex-1 border">OLLAMA (LOCAL)</button>
                        </div>
                        @if (aiService.activeProvider() === 'OLLAMA') {
                           <input type="text" [ngModel]="ollama.ollamaHost()" (ngModelChange)="ollama.setHost($event)"
                                  class="w-full bg-green-900/20 border border-green-800 text-green-500 text-xs p-2 mt-2 rounded" 
                                  placeholder="Ollama Host URL">
                        }
                     </div>

                     <!-- Stress Test -->
                     <div class="border-t border-green-900 pt-4">
                         <button (click)="runStressTest()" class="term-btn w-full border-red-900 text-red-400 hover:bg-red-900/20 py-3">
                             ⚠ RUN DIAGNOSTIC CYCLE (STRESS TEST)
                         </button>
                     </div>
                </div>
            }

            <!-- TAB 2: CHAOS & HARDWARE -->
            @if (activeTab() === 'CHAOS') {
                <div class="space-y-5">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-green-500 font-bold text-sm uppercase">Chaos Engine</span>
                        <label class="flex items-center gap-2 cursor-pointer">
                            <span class="text-xs text-green-700 font-bold">{{ chaos.enabled() ? 'ARMED' : 'DISARMED' }}</span>
                            <input type="checkbox" [ngModel]="chaos.enabled()" (ngModelChange)="chaos.enabled.set($event)" class="w-5 h-5 accent-red-500">
                        </label>
                    </div>

                    @if (chaos.enabled()) {
                        <div class="grid grid-cols-2 gap-3">
                            <button (click)="chaos.triggerHeatWave()" class="term-btn border-red-500 text-red-400 py-3">🔥 HEAT WAVE</button>
                            <button (click)="chaos.triggerFlood()" class="term-btn border-blue-500 text-blue-400 py-3">💧 FLOOD</button>
                            <button (click)="chaos.triggerBlackout()" class="term-btn border-zinc-500 text-zinc-400 py-3">⚡ BLACKOUT</button>
                            <button (click)="chaos.resetAll()" class="term-btn border-green-500 text-green-400 py-3">RESET</button>
                        </div>

                        <div class="space-y-4 mt-2">
                            <div class="control-group">
                                <label>Sensor Drift ({{ chaos.sensorDrift() }}%)</label>
                                <input type="range" min="0" max="50" [ngModel]="chaos.sensorDrift()" (ngModelChange)="chaos.sensorDrift.set($event)" class="term-range">
                            </div>
                            <div class="control-group">
                                <label>Network Lag ({{ chaos.networkLag() }}ms)</label>
                                <input type="range" min="0" max="5000" step="100" [ngModel]="chaos.networkLag()" (ngModelChange)="chaos.networkLag.set($event)" class="term-range">
                            </div>
                            <label class="flex items-center gap-3 text-xs text-green-400 font-bold">
                                <input type="checkbox" [ngModel]="chaos.valveStuckOpen()" (ngModelChange)="chaos.valveStuckOpen.set($event)" class="w-4 h-4 accent-red-500">
                                VALVE STUCK OPEN
                            </label>
                        </div>
                    }

                    <div class="border-t border-green-900 pt-4 mt-4">
                        <span class="text-green-500 font-bold text-sm uppercase mb-3 block">Theme Injection</span>
                        <div class="grid grid-cols-3 gap-2">
                            <button (click)="setTheme('NOMINAL')" class="term-btn-xs py-2">NOMINAL</button>
                            <button (click)="setTheme('FROST')" class="term-btn-xs text-cyan-300 py-2">FROST</button>
                            <button (click)="setTheme('HEAT_WAVE')" class="term-btn-xs text-red-400 py-2">HEAT</button>
                        </div>
                    </div>
                </div>
            }

            <!-- TAB 3: TUNING & GAMING -->
            @if (activeTab() === 'TUNING') {
                <div class="space-y-5">
                    
                    <div class="control-group">
                        <label>VPD Tolerance (Flower Target)</label>
                        <div class="flex gap-3">
                            <div class="flex-1">
                                <span class="text-[10px] text-green-700 block mb-1">LOW ({{ gamification.vpdTargetLowFlower() }})</span>
                                <input type="range" min="0.5" max="2.0" step="0.1" 
                                       [ngModel]="gamification.vpdTargetLowFlower()" 
                                       (ngModelChange)="gamification.vpdTargetLowFlower.set($event)" class="term-range">
                            </div>
                            <div class="flex-1">
                                <span class="text-[10px] text-green-700 block mb-1">HIGH ({{ gamification.vpdTargetHighFlower() }})</span>
                                <input type="range" min="0.5" max="3.0" step="0.1" 
                                       [ngModel]="gamification.vpdTargetHighFlower()" 
                                       (ngModelChange)="gamification.vpdTargetHighFlower.set($event)" class="term-range">
                            </div>
                        </div>
                    </div>

                    <div class="control-group">
                        <label>VWC Target Range</label>
                        <div class="flex gap-3">
                             <div class="flex-1">
                                <span class="text-[10px] text-green-700 block mb-1">MIN ({{ gamification.vwcMin() }}%)</span>
                                <input type="range" min="0" max="50" step="1" 
                                       [ngModel]="gamification.vwcMin()" 
                                       (ngModelChange)="gamification.vwcMin.set($event)" class="term-range">
                            </div>
                             <div class="flex-1">
                                <span class="text-[10px] text-green-700 block mb-1">MAX ({{ gamification.vwcMax() }}%)</span>
                                <input type="range" min="50" max="100" step="1" 
                                       [ngModel]="gamification.vwcMax()" 
                                       (ngModelChange)="gamification.vwcMax.set($event)" class="term-range">
                            </div>
                        </div>
                    </div>
                    
                    <div class="border-t border-green-900 pt-4">
                        <span class="text-green-500 font-bold text-sm uppercase mb-3 block">Manual Spoofing (Target: {{ targetRoom() }})</span>
                        
                        <div class="flex mb-3 gap-2">
                            <button (click)="targetRoom.set('A')" [class]="targetRoom() === 'A' ? 'bg-green-700 text-black' : 'text-green-700 border border-green-900'" class="flex-1 text-xs py-2 font-bold transition-colors">ROOM A</button>
                            <button (click)="targetRoom.set('B')" [class]="targetRoom() === 'B' ? 'bg-green-700 text-black' : 'text-green-700 border border-green-900'" class="flex-1 text-xs py-2 font-bold transition-colors">ROOM B</button>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-4">
                             <div class="control-group">
                                 <label>Force Ambient (°F)</label>
                                 <input type="range" min="32" max="120" 
                                        [ngModel]="currentSpoof()?.temp || currentRoom().temp" 
                                        (ngModelChange)="updateSpoof('temp', $event)" class="term-range">
                             </div>
                             <div class="control-group">
                                 <label>Force Canopy (°F)</label>
                                 <input type="range" min="32" max="120" 
                                        [ngModel]="currentSpoof()?.canopyTemp || currentRoom().canopyTemp" 
                                        (ngModelChange)="updateSpoof('canopyTemp', $event)" class="term-range">
                             </div>
                             <div class="control-group">
                                 <label>Force Humidity (%)</label>
                                 <input type="range" min="20" max="90" 
                                        [ngModel]="currentSpoof()?.rh || currentRoom().rh" 
                                        (ngModelChange)="updateSpoof('rh', $event)" class="term-range">
                             </div>
                             <div class="control-group">
                                 <label>Force CO2 (ppm)</label>
                                 <input type="range" min="400" max="2000" step="10" 
                                        [ngModel]="currentSpoof()?.co2 || currentRoom().co2" 
                                        (ngModelChange)="updateSpoof('co2', $event)" class="term-range">
                             </div>
                             <div class="control-group col-span-2">
                                 <label>Force VWC (%)</label>
                                 <input type="range" min="0" max="100" 
                                        [ngModel]="currentSpoof()?.vwc || currentRoom().vwc" 
                                        (ngModelChange)="updateSpoof('vwc', $event)" class="term-range">
                             </div>
                        </div>
                        <button (click)="clearSpoof()" class="term-btn w-full mt-3 border-green-700 text-green-500 py-2">RELEASE OVERRIDES</button>
                    </div>

                    <div class="border-t border-green-900 pt-4">
                        <span class="text-green-500 font-bold text-xs uppercase mb-2 block">Rank Injection</span>
                        <div class="flex gap-2">
                            <button (click)="gamification.grantManualBadge('S', targetRoom())" class="term-btn flex-1 border-yellow-600 text-yellow-400 py-2">S</button>
                            <button (click)="gamification.grantManualBadge('A', targetRoom())" class="term-btn flex-1 border-emerald-600 text-emerald-400 py-2">A</button>
                            <button (click)="gamification.grantManualBadge('B', targetRoom())" class="term-btn flex-1 border-blue-600 text-blue-400 py-2">B</button>
                            <button (click)="gamification.grantManualBadge('C', targetRoom())" class="term-btn flex-1 border-zinc-600 text-zinc-400 py-2">C</button>
                            <button (click)="gamification.grantManualBadge('F', targetRoom())" class="term-btn flex-1 border-red-600 text-red-400 py-2">F</button>
                        </div>
                        <button (click)="triggerSitrep()" class="term-btn w-full mt-3 border-green-600 text-green-400 py-2">AI SITREP</button>
                    </div>
                </div>
            }

        </div>
        
        <!-- Footer Status -->
        <div class="p-2 border-t border-green-500 bg-green-900/20 text-xs text-green-600 font-mono text-center flex justify-between px-6 font-bold">
            <span>SYS_TICK: {{ facility.simDate() | date:'HH:mm:ss' }}</span>
            <span>TARGET: {{ targetRoom() }}</span>
        </div>

      </div>
    } @else {
      <!-- New Trigger Button -->
      <button (click)="isVisible.set(true)" 
              class="fixed bottom-4 left-4 z-[9000] w-12 h-12 bg-black/90 border-2 border-green-500 rounded-full text-green-500 flex items-center justify-center hover:bg-green-900/50 hover:scale-110 shadow-[0_0_15px_rgba(0,255,0,0.3)] transition-all backdrop-blur-md group"
              title="Open Command Console (~)">
         <span class="material-icons text-xl group-hover:rotate-12 transition-transform">terminal</span>
      </button>
    }
  `,
  styles: [`
    .term-btn {
        @apply bg-black border text-xs font-bold py-1 px-2 rounded hover:bg-green-900/30 transition-all uppercase;
    }
    .term-btn-xs {
        @apply bg-black border border-green-800 text-green-600 text-xs font-bold px-2 rounded hover:bg-green-900/30;
    }
    .term-range {
        @apply w-full h-2 bg-green-900 rounded-lg appearance-none cursor-pointer accent-green-500 block my-1;
    }
    .control-group {
        @apply mb-1;
    }
    .control-group label {
        @apply text-xs text-green-500 font-bold uppercase block mb-1;
    }
    .custom-scroll::-webkit-scrollbar { width: 6px; }
    .custom-scroll::-webkit-scrollbar-track { background: #001100; }
    .custom-scroll::-webkit-scrollbar-thumb { background: #004400; border: 1px solid #00ff00; }
    
    .scanner-bar-red {
        animation: scanner-fast 0.8s ease-in-out infinite alternate;
    }
    @keyframes scanner-fast {
        0% { left: 0%; }
        100% { left: 85%; } 
    }

    .scanner-bar-tranquil {
        animation: tranquil-wave 5s ease-in-out infinite alternate;
    }
    @keyframes tranquil-wave {
        0% { left: -20%; }
        100% { left: 110%; }
    }
  `]
})
export class DevTerminalComponent {
  theme = inject(ThemeService);
  facility = inject(FacilityService);
  gamification = inject(GamificationService);
  logService = inject(LogService);
  aiService = inject(AiConsultantService);
  chaos = inject(ChaosService);
  ollama = inject(OllamaService);

  isVisible = signal(false);
  activeTab = signal<'SIMULATION' | 'CHAOS' | 'TUNING'>('SIMULATION');
  targetRoom = signal<'A' | 'B'>('A');
  
  // Drag State
  position = { x: 50, y: 50 };
  private startPos = { x: 0, y: 0 };
  private isDragging = false;

  // Diode Indices (0-15)
  diodeIndices = Array.from({length: 16}, (_, i) => i);

  // --- Strict Nominal Checks ---
  checkRoomNominal(r: RoomState): boolean {
      // 1. Hardware/Chaos Check (Handled by isCritical)
      if (this.isChaosActive()) return false;
      
      // 2. Temp Check (Green: 72-82)
      if (r.temp < 72 || r.temp > 82) return false;

      // 3. VWC Check (Green: 40-60)
      if (r.vwc < 40 || r.vwc > 60) return false;

      // 4. VPD Check (Green: 0.8-1.6)
      if (r.vpd < 0.8 || r.vpd > 1.6) return false;
      
      // 5. CO2 Check (Green: 1000-1200)
      if (r.co2 < 1000 || r.co2 > 1200) return false;

      return true;
  }

  // --- Helper for Chaos/Hardware Failure State ---
  isChaosActive(): boolean {
      const c = this.chaos;
      // If chaos is enabled AND any destructive flag is set
      return c.enabled() && (
          c.heatWaveActive() || 
          c.floodActive() || 
          c.blackoutActive() || 
          c.sensorFailure() || 
          c.valveStuckOpen() || 
          c.sensorDrift() > 0 || 
          c.networkLag() > 0
      );
  }

  isCriticalA = computed(() => this.isChaosActive() || this.facility.roomA().sensorStatus !== 'OK');
  isCriticalB = computed(() => this.isChaosActive() || this.facility.roomB().sensorStatus !== 'OK');

  isNominalA = computed(() => this.checkRoomNominal(this.facility.roomA()));
  isNominalB = computed(() => this.checkRoomNominal(this.facility.roomB()));
  
  diodeColorsA = computed(() => this.calculateDiodeColors(this.facility.roomA()));
  diodeColorsB = computed(() => this.calculateDiodeColors(this.facility.roomB()));

  telemetryLogs = computed(() => this.logService.logs().slice(0, 50));
  
  currentRoom = computed(() => this.targetRoom() === 'A' ? this.facility.roomA() : this.facility.roomB());
  
  currentSpoof = computed(() => {
     const overrides = this.facility.sensorOverrides();
     return overrides[this.targetRoom()] || null;
  });

  constructor() {}

  @HostListener('window:keydown', ['$event'])
  toggle(event: KeyboardEvent) {
    if (event.key === '~' || event.key === '`') {
      this.isVisible.update(v => !v);
    }
  }

  // --- Severity Scale Logic (Diagnostic Mode) ---
  calculateDiodeColors(room: RoomState): string[] {
      const colors = new Array(16).fill('bg-green-950'); 
      
      // BLOCK 1: TEMP (0-3)
      // Green: 72-82 | Amber: 68-72 or 82-85 | Red: <68 or >85
      let tColor = 'bg-[#00FF41] shadow-[0_0_8px_#00FF41]';
      if (room.temp < 68 || room.temp > 85) tColor = 'bg-[#FF0000] shadow-[0_0_8px_#FF0000] animate-pulse';
      else if (room.temp < 72 || room.temp > 82) tColor = 'bg-[#FFB000] shadow-[0_0_8px_#FFB000]';
      for(let i=0; i<4; i++) colors[i] = tColor;

      // BLOCK 2: VWC (4-7)
      // Green: 40-60 | Amber: 35-40 or 60-70 | Red: <35 or >70
      let vColor = 'bg-[#00FF41] shadow-[0_0_8px_#00FF41]';
      if (room.vwc < 35 || room.vwc > 70) vColor = 'bg-[#FF0000] shadow-[0_0_8px_#FF0000] animate-pulse';
      else if (room.vwc < 40 || room.vwc > 60) vColor = 'bg-[#FFB000] shadow-[0_0_8px_#FFB000]';
      for(let i=4; i<8; i++) colors[i] = vColor;

      // BLOCK 3: VPD (8-11)
      // Green: 0.8-1.6 | Amber: 0.5-0.8 or 1.6-1.8 | Red: <0.5 or >1.8
      let vpdColor = 'bg-[#00FF41] shadow-[0_0_8px_#00FF41]';
      if (room.vpd < 0.5 || room.vpd > 1.8) vpdColor = 'bg-[#FF0000] shadow-[0_0_8px_#FF0000] animate-pulse';
      else if (room.vpd < 0.8 || room.vpd > 1.6) vpdColor = 'bg-[#FFB000] shadow-[0_0_8px_#FFB000]';
      for(let i=8; i<12; i++) colors[i] = vpdColor;

      // BLOCK 4: CO2 (12-15) - NEW LOGIC
      // Green: 1000-1200 | Amber: 800-1000 or 1200-1500 | Red: <800 or >1500
      let co2Color = 'bg-[#00FF41] shadow-[0_0_8px_#00FF41]';
      if (room.co2 < 800 || room.co2 > 1500) {
          co2Color = 'bg-[#FF0000] shadow-[0_0_8px_#FF0000] animate-pulse';
      } else if (room.co2 < 1000 || room.co2 > 1200) {
          co2Color = 'bg-[#FFB000] shadow-[0_0_8px_#FFB000]';
      }
      for(let i=12; i<16; i++) colors[i] = co2Color;
      
      return colors;
  }
  
  getVitalityColor(v: number) {
      if (v >= 90) return 'text-green-400';
      if (v >= 70) return 'text-blue-400';
      if (v >= 50) return 'text-amber-500';
      return 'text-red-500';
  }

  // --- Drag Implementation ---
  startDrag(event: MouseEvent) {
    this.isDragging = true;
    this.startPos = { 
        x: event.clientX - this.position.x, 
        y: event.clientY - this.position.y 
    };
  }

  @HostListener('document:mousemove', ['$event'])
  onDrag(event: MouseEvent) {
    if (!this.isDragging) return;
    this.position = {
        x: event.clientX - this.startPos.x,
        y: event.clientY - this.startPos.y
    };
  }

  @HostListener('document:mouseup')
  stopDrag() {
    this.isDragging = false;
  }

  // --- Actions ---
  setTheme(t: ThemeMode | null) {
      if (t === 'FROST') this.updateSpoof('temp', 50);
      else if (t === 'HEAT_WAVE') this.updateSpoof('temp', 104);
      else if (t === 'NOMINAL') this.clearSpoof();
      this.theme.overrideTheme.set(t);
  }

  updateSpoof(metric: 'vwc' | 'vpd' | 'temp' | 'rh' | 'co2' | 'canopyTemp', value: any) {
      this.facility.setSensorOverride(this.targetRoom(), { [metric]: parseFloat(value) });
  }

  clearSpoof() {
      this.facility.setSensorOverride(this.targetRoom(), null);
      this.theme.overrideTheme.set(null);
  }

  triggerSitrep() {
      this.logService.logAction(`[${this.targetRoom()}] SITREP REQUEST.`);
      this.aiService.analyzeRoom(this.currentRoom(), this.facility.timeOfDayMin(), 'DRILL_SERGEANT')
        .then(res => this.facility.updateNewsFeed(`[SITREP]: ${res.headline}`));
  }

  updateSimDate(event: any) {
      if(event.target.value) this.facility.setSimulationDate(new Date(event.target.value));
  }

  runStressTest() {
      this.facility.runStressTest();
  }
}
