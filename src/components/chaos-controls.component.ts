
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChaosService } from '../services/chaos.service';

@Component({
  selector: 'app-chaos-controls',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="border-t-2 border-red-500/30 pt-4 mt-4">
        <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
                <span class="material-icons text-red-400">warning</span>
                <h3 class="text-red-400 font-black uppercase tracking-widest text-sm">Chaos Controls</h3>
            </div>
            <label class="flex items-center cursor-pointer">
                <span class="text-[10px] font-bold mr-2">{{ chaos.enabled() ? 'ENABLED' : 'DISABLED' }}</span>
                <div class="relative">
                    <input type="checkbox" [ngModel]="chaos.enabled()" (ngModelChange)="chaos.enabled.set($event)" class="sr-only">
                    <div class="block w-10 h-5 rounded-full" [class]="chaos.enabled() ? 'bg-red-600' : 'bg-zinc-700'"></div>
                    <div class="dot absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition-transform" [class.translate-x-5]="chaos.enabled()"></div>
                </div>
            </label>
        </div>
        
        @if (chaos.enabled()) {
            <div class="space-y-4 p-3 bg-red-900/10 border border-red-500/20 rounded animate-in fade-in duration-300">
                
                <!-- Sliders and Toggles -->
                <div class="grid grid-cols-2 gap-4">
                    <div class="flex items-center justify-between col-span-2">
                        <label class="text-xs text-zinc-300">Sensor Failure (VWC=0)</label>
                        <input type="checkbox" [ngModel]="chaos.sensorFailure()" (ngModelChange)="chaos.sensorFailure.set($event)" class="toggle-input">
                    </div>
                     <div class="flex items-center justify-between col-span-2">
                        <label class="text-xs text-zinc-300">Valve Stuck Open</label>
                        <input type="checkbox" [ngModel]="chaos.valveStuckOpen()" (ngModelChange)="chaos.valveStuckOpen.set($event)" class="toggle-input">
                    </div>
                </div>

                <div>
                    <label class="text-[10px] text-zinc-400 uppercase font-bold mb-1 flex justify-between">
                        <span>Sensor Drift</span>
                        <span class="text-red-300">{{ chaos.sensorDrift() }}%</span>
                    </label>
                    <input type="range" min="0" max="50" step="1" 
                           [ngModel]="chaos.sensorDrift()" (ngModelChange)="chaos.sensorDrift.set($event)"
                           class="w-full chaos-slider">
                </div>
                <div>
                    <label class="text-[10px] text-zinc-400 uppercase font-bold mb-1 flex justify-between">
                        <span>Network Lag</span>
                        <span class="text-red-300">{{ chaos.networkLag() }}ms</span>
                    </label>
                    <input type="range" min="0" max="5000" step="100" 
                           [ngModel]="chaos.networkLag()" (ngModelChange)="chaos.networkLag.set($event)"
                           class="w-full chaos-slider">
                </div>

                <!-- Scenarios -->
                <div class="pt-3 border-t border-red-500/20">
                    <label class="text-[10px] text-zinc-400 uppercase font-bold mb-2 block">Instant Scenarios</label>
                    <div class="grid grid-cols-3 gap-2">
                        <button (click)="chaos.triggerHeatWave()" class="chaos-btn">Heat Wave</button>
                        <button (click)="chaos.triggerFlood()" class="chaos-btn">Flood</button>
                        <button (click)="chaos.triggerBlackout()" class="chaos-btn">Blackout</button>
                    </div>
                    <button (click)="chaos.resetAll()" class="w-full text-[10px] text-zinc-500 underline mt-2">RESET ALL CHAOS</button>
                </div>

            </div>
        }
    </div>
  `,
  styles: [`
    .toggle-input {
      accent-color: #ef4444;
      width: 1.25rem;
      height: 1.25rem;
    }
    .chaos-slider {
      accent-color: #ef4444;
      height: 0.25rem;
      background-color: #3f3f46;
      border-radius: 9999px;
      -webkit-appearance: none;
      appearance: none;
      cursor: pointer;
    }
    .chaos-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 1rem;
        height: 1rem;
        background: #fca5a5;
        border-radius: 9999px;
    }
    .chaos-btn {
        padding: 4px;
        font-size: 10px;
        font-weight: bold;
        background-color: #450a0a;
        border: 1px solid #7f1d1d;
        color: #fca5a5;
        border-radius: 3px;
    }
    .chaos-btn:hover {
        background-color: #7f1d1d;
        color: white;
    }
  `]
})
export class ChaosControlsComponent {
  chaos = inject(ChaosService);
}
