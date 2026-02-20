
import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FacilityService } from '../services/facility.service';
import { AiConsultantService } from '../services/ai-consultant.service';
import { OllamaService } from '../services/ollama.service';
import { ChaosControlsComponent } from './chaos-controls.component';

@Component({
  selector: 'app-simulation-controls',
  standalone: true,
  imports: [CommonModule, FormsModule, ChaosControlsComponent],
  template: `
    <div class="fixed bottom-4 right-4 z-[100] flex flex-col items-end pointer-events-none">
       
       <!-- Toggle Button -->
       <button (click)="togglePanel()" 
               class="pointer-events-auto w-12 h-12 rounded-full bg-indigo-600 text-white shadow-[0_0_20px_#4f46e5] flex items-center justify-center hover:scale-110 transition-transform mb-2 border-2 border-indigo-400">
          <span class="material-icons">{{ isOpen ? 'close' : 'tune' }}</span>
       </button>

       <!-- Control Panel -->
       <div *ngIf="isOpen" 
            class="pointer-events-auto bg-black/90 backdrop-blur-md border-2 border-indigo-500/50 p-4 rounded-lg w-80 shadow-2xl animate-in slide-in-from-bottom-5 max-h-[calc(100vh-100px)] overflow-y-auto custom-scroll">
          
          <div class="flex items-center gap-2 mb-4 border-b border-indigo-900 pb-2">
             <span class="material-icons text-indigo-400">science</span>
             <h3 class="text-indigo-400 font-black uppercase tracking-widest text-sm">Simulation Settings</h3>
          </div>

          <!-- AI Model Selector -->
          <div class="mb-4 bg-zinc-900/50 p-2 rounded border border-zinc-700">
             <label class="text-[10px] text-zinc-400 uppercase font-bold mb-2 block">AI Brain Model</label>
             <div class="flex bg-zinc-950 p-1 rounded border border-zinc-800">
                <button (click)="aiService.toggleProvider('GEMINI')" 
                        [class]="aiService.activeProvider() === 'GEMINI' ? 'bg-indigo-600 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'"
                        class="flex-1 py-1 text-[10px] font-bold rounded transition-colors">
                    GEMINI 2.5
                </button>
                <button (click)="aiService.toggleProvider('OLLAMA')" 
                        [class]="aiService.activeProvider() === 'OLLAMA' ? 'bg-indigo-600 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'"
                        class="flex-1 py-1 text-[10px] font-bold rounded transition-colors">
                    OLLAMA
                </button>
             </div>
          </div>

          <!-- Time Controls -->
          <div class="mb-4">
             <label class="text-[10px] text-zinc-400 uppercase font-bold mb-1 flex justify-between">
                <span>Time Dilation</span>
                <span class="text-indigo-300">{{ facility.simSpeed() }}x</span>
             </label>
             <div class="flex items-center gap-2">
                 <span class="text-[9px] text-zinc-600">0.1x</span>
                 <!-- Range: 0.1 (Slow) to 1000 (Very Fast) -->
                 <input type="range" min="0.1" max="1000" step="0.1" 
                        [ngModel]="facility.simSpeed()" 
                        (ngModelChange)="facility.setSimSpeed($event)"
                        class="flex-grow accent-indigo-500 h-1 bg-zinc-800 rounded appearance-none cursor-pointer">
                 <span class="text-[9px] text-zinc-600">Max</span>
             </div>
             
             <div class="flex justify-between mt-2">
                 <button (click)="facility.togglePause()" 
                         [class]="'px-4 py-1 rounded text-xs font-bold border ' + (facility.simPaused() ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-zinc-800 border-zinc-600 text-zinc-400')">
                    {{ facility.simPaused() ? 'RESUME' : 'PAUSE' }}
                 </button>
                 <button (click)="facility.setSimSpeed(1)" class="text-[10px] text-zinc-500 underline">RESET REALTIME</button>
             </div>
          </div>

          <!-- GLOBAL CLOCK (Fixed) -->
          <div class="mb-4 border-t border-indigo-900 pt-2">
              <label class="text-[10px] text-zinc-400 uppercase font-bold mb-1 block">Simulation Clock (Read-Only)</label>
              <div class="bg-zinc-950 border border-zinc-800 p-2 rounded text-indigo-300 font-mono text-xs mb-2">
                  {{ liveSimDate() }}
              </div>

              <label class="text-[10px] text-zinc-400 uppercase font-bold mb-1 block">Time Travel (Set Target)</label>
              <input type="datetime-local" 
                     (change)="updateSimDate($event)"
                     class="w-full bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 p-2 rounded font-mono focus:border-indigo-500 outline-none">
              <p class="text-[9px] text-zinc-500 mt-1">Changing this moves the entire facility timeline.</p>
          </div>

           <!-- AI Config -->
           @if (aiService.activeProvider() === 'OLLAMA') {
               <div class="mb-4 border-t border-indigo-900 pt-2 animate-in fade-in">
                  <label class="text-[10px] text-zinc-400 uppercase font-bold mb-1 block">Ollama API Host</label>
                  <input type="text" 
                         [ngModel]="ollama.ollamaHost()"
                         (ngModelChange)="ollama.setHost($event)"
                         placeholder="http://localhost:11434"
                         class="w-full bg-zinc-950 border border-zinc-700 text-xs text-zinc-300 p-1 rounded font-mono">
                  <p class="text-[9px] text-zinc-500 mt-1">If using Preview/Cloud, set to your ngrok tunnel URL.</p>
               </div>
           }

          <!-- Stress Test -->
          <div class="mb-4 border-t border-indigo-900 pt-2">
             <div class="flex items-center gap-2 mb-2">
                <span class="material-icons text-red-400 text-sm">bug_report</span>
                <label class="text-[10px] text-zinc-400 uppercase font-bold">System Stress Test</label>
             </div>
             
             @if (!isTesting()) {
                <button (click)="runStressTest()" class="w-full bg-red-900/30 hover:bg-red-900/50 text-red-200 border border-red-800 text-xs font-bold py-2 rounded transition-colors">
                  RUN DIAGNOSTIC CYCLE
                </button>
             } @else {
                <div class="w-full bg-zinc-800 text-zinc-400 text-xs font-bold py-2 rounded text-center animate-pulse border border-zinc-700">
                  RUNNING SIMULATION...
                </div>
             }

             @if (facility.stressTestReport(); as report) {
                <div class="mt-2 p-2 bg-black border border-zinc-800 rounded">
                    <div class="flex justify-between items-center mb-1">
                        <span class="text-[9px] text-emerald-500 font-bold uppercase">Test Complete</span>
                        <span class="text-[9px] text-zinc-500">{{ report.durationSeconds }}s</span>
                    </div>
                    <div class="text-[9px] text-zinc-400 font-mono space-y-1">
                        <div>Health: <span [class]="report.plantHealth === 'SURVIVED' ? 'text-emerald-400' : 'text-red-400'">{{ report.plantHealth }}</span></div>
                        <div>Valve Cycles: {{ report.totalValveCycles }}</div>
                        <div>Safety Actions: {{ report.safetyInterventions.success }}</div>
                    </div>
                </div>
             }
          </div>

          <!-- Chaos Engineering Module -->
          <app-chaos-controls />

       </div>
    </div>
  `,
  styles: [`
    .custom-scroll {
      scrollbar-width: thin;
      scrollbar-color: #52525b #18181b;
    }
  `]
})
export class SimulationControlsComponent {
  facility = inject(FacilityService);
  aiService = inject(AiConsultantService);
  ollama = inject(OllamaService);
  isOpen = false;
  isTesting = signal(false);

  // Live Display (includes seconds)
  liveSimDate = computed(() => {
      const d = new Date(this.facility.simDate());
      return d.toLocaleString('en-US', { 
          year: 'numeric', month: '2-digit', day: '2-digit', 
          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false 
      });
  });

  updateSimDate(event: any) {
      const val = event.target.value;
      if (!val) return;
      const newDate = new Date(val);
      this.facility.setSimulationDate(newDate);
  }

  togglePanel() {
    this.isOpen = !this.isOpen;
  }

  runStressTest() {
    this.isTesting.set(true);
    this.facility.stressTestReport.set(null);
    this.facility.runStressTest().then(() => {
      this.isTesting.set(false);
    });
  }
}
