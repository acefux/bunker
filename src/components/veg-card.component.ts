
import { Component, input, output, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RoomState } from '../models';
import { FacilityService } from '../services/facility.service';

@Component({
  selector: 'app-veg-card',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="h-full flex flex-col bg-zinc-950 border-2 border-zinc-700 rounded-sm shadow-xl relative overflow-hidden">
      
      <!-- Header -->
      <div class="p-3 bg-zinc-900 border-b border-zinc-800 flex justify-between items-center">
        <div class="flex items-center gap-3">
            <h2 class="text-xl font-black text-zinc-300 font-industrial uppercase">{{ room().name }}</h2>
            <div [class]="'px-2 py-0.5 text-[10px] font-bold rounded ' + (room().valveOpen ? 'bg-blue-900 text-blue-200 animate-pulse' : 'bg-zinc-800 text-zinc-500')">
                {{ room().valveOpen ? 'FLOODING' : 'DRAINING / IDLE' }}
            </div>
        </div>
        <div class="text-zinc-500 text-xs font-mono-ind">
             TEMP: {{ room().temp }}°F
        </div>
      </div>

      <div class="p-4 grid grid-cols-1 md:grid-cols-2 gap-6 items-start bg-zinc-900/30 flex-grow overflow-y-auto custom-scroll">
         
         <!-- Pump Status Visualization -->
         <div class="flex flex-col items-center justify-center gap-4 border border-zinc-800 bg-zinc-950 p-4 rounded min-h-[200px]">
             <div class="relative w-full h-32 bg-zinc-900 rounded border border-zinc-700 overflow-hidden">
                 <!-- Water Level Simulation -->
                 <div class="absolute bottom-0 left-0 w-full bg-blue-600/50 transition-all duration-1000"
                      [style.height]="room().valveOpen ? '90%' : '10%'"></div>
                 
                 <!-- Table Graphics -->
                 <div class="absolute bottom-2 left-2 right-2 h-4 bg-zinc-800 border-t border-zinc-600"></div>
                 <div class="absolute top-4 left-1/2 -translate-x-1/2 text-xs font-mono-ind text-zinc-400 z-10">
                    FLOOD TABLE
                 </div>
             </div>

             <div class="flex gap-4 w-full">
                 <div [class]="'flex-1 p-2 text-center border rounded text-xs font-bold ' + (room().valveOpen ? 'border-emerald-500 bg-emerald-900/20 text-emerald-400' : 'border-zinc-700 bg-zinc-900 text-zinc-600')">
                    PUMP 1
                 </div>
                 <div [class]="'flex-1 p-2 text-center border rounded text-xs font-bold ' + (room().valveOpen ? 'border-emerald-500 bg-emerald-900/20 text-emerald-400' : 'border-zinc-700 bg-zinc-900 text-zinc-600')">
                    PUMP 2
                 </div>
             </div>
         </div>

         <!-- Controls -->
         <div class="space-y-6 font-mono-ind">
            <div>
                <label class="text-[10px] text-zinc-500 uppercase block mb-1">Flood Interval (Hours)</label>
                <div class="flex items-center gap-2">
                    <input type="range" min="1" max="72" step="1" 
                        [ngModel]="room().config.floodIntervalHours" 
                        (ngModelChange)="updateConfig('floodIntervalHours', $event)"
                        class="flex-grow accent-blue-500 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer">
                    <span class="w-12 text-right text-lg font-bold text-blue-400">{{ room().config.floodIntervalHours }}H</span>
                </div>
            </div>

            <div>
                <label class="text-[10px] text-zinc-500 uppercase block mb-1">Flood Duration (Minutes)</label>
                <div class="flex items-center gap-2">
                    <input type="range" min="5" max="60" step="5" 
                        [ngModel]="room().config.floodDurationMinutes" 
                        (ngModelChange)="updateConfig('floodDurationMinutes', $event)"
                        class="flex-grow accent-blue-500 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer">
                    <span class="w-16 text-right text-lg font-bold text-blue-400">{{ room().config.floodDurationMinutes }}m</span>
                </div>
            </div>
            
            <div class="pt-4 border-t border-zinc-800">
                 <label class="text-[10px] text-zinc-500 uppercase block mb-1">Next Flood In</label>
                 <div class="text-3xl font-black text-zinc-200 tracking-tighter">{{ room().nextShotMin }} <span class="text-sm font-normal text-zinc-500">MIN</span></div>
            </div>
         </div>

      </div>
    </div>
  `
})
export class VegCardComponent {
  room = input.required<RoomState>();
  private facility = inject(FacilityService);

  updateConfig(key: string, value: any) {
    this.facility.updateConfig(this.room().id, { [key]: parseFloat(value) });
  }
}
