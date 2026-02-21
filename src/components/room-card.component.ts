
import { Component, input, output, computed, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RoomState, Milestone, StrainProfile } from '../models';
import { FacilityService } from '../services/facility.service';
import { GamificationService } from '../services/gamification.service';
import { SoundService } from '../services/sound.service';
import { AppModeService } from '../services/app-mode.service';
import { SimulationService } from '../services/simulation.service';
import { HistoryChartComponent } from './history-chart.component';
import { CalendarWidgetComponent } from './calendar-widget.component';
import { StrainService } from '../services/strain.service';

@Component({
  selector: 'app-room-card',
  standalone: true,
  imports: [CommonModule, FormsModule, HistoryChartComponent, CalendarWidgetComponent],
  template: `
    <div class="h-full flex flex-col bg-zinc-950 border-2 border-zinc-800 rounded-sm shadow-2xl relative overflow-hidden group">
      
      <!-- Colored Header Strip -->
      <div [class]="statusColor() + ' h-2 w-full absolute top-0 left-0 z-10'"></div>
      
      <!-- SIGNAL INJECTION WARNING OVERLAY -->
      @if (isOverridden() || appMode.isSim()) {
        <div class="absolute top-2 left-1/2 -translate-x-1/2 z-50 bg-amber-900/90 text-amber-400 text-[10px] font-black font-mono px-3 py-1 rounded-b border border-amber-500 animate-pulse uppercase tracking-widest shadow-lg">
           {{ appMode.isSim() ? '⚠ SIMULATION DATA' : '⚠️ SIGNAL INJECTION ACTIVE' }}
        </div>
      }

      <!-- Industrial Header -->
      <div class="p-4 bg-zinc-900 border-b-2 border-zinc-800 flex justify-between items-start mt-1 shrink-0">
        <div class="flex items-center gap-3">
            <div [class]="'w-3 h-3 rounded-full ' + (displayRoom().valveOpen ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]' : 'bg-zinc-700')"></div>
            <div>
                <h2 class="text-2xl font-black text-zinc-100 font-industrial tracking-tighter uppercase leading-none">{{ displayRoom().name }}</h2>
                <div class="flex gap-2 text-[10px] font-mono-ind text-zinc-500 mt-1 items-center">
                    <span>ID: {{ displayRoom().id }}</span>
                    <span>|</span>
                    <span [class]="displayRoom().isDay ? 'text-amber-400' : 'text-indigo-400'">{{ displayRoom().isDay ? 'DAY MODE' : 'NIGHT MODE' }}</span>
                    <span>|</span>
                    <span class="flex items-center gap-1">
                       <span class="w-1.5 h-1.5 bg-green-500 rounded-full animate-ping"></span>
                       LIVE SIM
                    </span>
                </div>
            </div>
        </div>
        
        <!-- VITALITY SCORE & RANK -->
        <div class="flex items-center gap-4">
            <div class="text-right">
                <span class="text-[9px] font-bold text-zinc-500 uppercase block">Vitality</span>
                <div class="w-24 h-2 bg-zinc-800 rounded overflow-hidden">
                    <div class="h-full transition-all duration-500" 
                         [style.width.%]="vitality()"
                         [class]="vitalityColor()"></div>
                </div>
            </div>
            
            <div class="flex items-center justify-center w-10 h-10 bg-zinc-800 border-2 rounded font-black text-xl font-industrial shadow-lg"
                 [class]="rankColor()">
                {{ rank() }}
            </div>
        </div>
      </div>

      <!-- Calendar Widget Area -->
      <div class="px-4 pb-2 bg-zinc-900 border-b border-zinc-800 shrink-0">
         <!-- NEW: Chronology Header -->
         <div class="flex justify-between items-end mb-2 pt-2">
            <div>
                <span class="text-[9px] font-bold text-zinc-500 uppercase block">Lifecycle Status</span>
                <span class="text-xs font-mono-ind text-zinc-300">
                    {{ displayRoom().currentLifecyclePhase }} | DAY {{ displayRoom().dayOfCycle }}
                </span>
            </div>
            
            <div class="flex gap-4">
                <!-- Current Sim Date -->
                <div class="text-right">
                    <span class="text-[9px] font-bold text-zinc-500 uppercase block">Current Date</span>
                    <span class="text-xs font-mono-ind text-indigo-300">
                        {{ facility.simDate() | date:'shortDate' }}
                    </span>
                </div>

                <!-- Target Finish Date -->
                <div class="text-right">
                    <span class="text-[9px] font-bold text-zinc-500 uppercase block">Est. Finish</span>
                    <span class="text-xs font-mono-ind text-emerald-400">
                        {{ getFinishDate() | date:'shortDate' }}
                    </span>
                </div>

                <!-- Editable Start Date -->
                <div class="text-right">
                    <span class="text-[9px] font-bold text-zinc-500 uppercase block">Start Date (Planted)</span>
                    <input 
                        type="date" 
                        [ngModel]="getStartDate() | date:'yyyy-MM-dd'" 
                        (ngModelChange)="updateStartDate($event)"
                        class="bg-zinc-800 border border-zinc-700 text-xs font-mono-ind text-zinc-300 rounded px-1 py-0.5 outline-none focus:border-indigo-500 w-24">
                </div>
            </div>
         </div>

         <app-calendar-widget 
            [totalDaysAlive]="totalDaysAlive()" 
            [phase]="displayRoom().currentLifecyclePhase"
            [strains]="displayRoom().strains"
            [activeMilestones]="displayRoom().activeMilestones" />
      </div>

      <!-- Tab Navigation -->
      <div class="flex border-b-2 border-zinc-800 bg-zinc-900/50 shrink-0 overflow-x-auto">
         <button (click)="setActiveTab('monitor')" [class]="tabClass('monitor')">MONITOR</button>
         <button (click)="setActiveTab('charts')" [class]="tabClass('charts')">CHARTS</button>
         <button (click)="setActiveTab('irrigation')" [class]="tabClass('irrigation')">IRRIGATION</button>
         <button (click)="setActiveTab('genetics')" [class]="tabClass('genetics')">GENETICS</button>
         <button (click)="setActiveTab('climate')" [class]="tabClass('climate')">CLIMATE</button>
         <button (click)="setActiveTab('lighting')" [class]="tabClass('lighting')">LIGHTS</button>
      </div>

      <!-- SCROLLABLE CONTENT AREA -->
      <div class="flex-grow overflow-y-auto bg-zinc-950 p-4 custom-scroll relative">
      
        <!-- TAB: MONITOR -->
        @if (activeTab() === 'monitor') {
            <div class="grid grid-cols-2 gap-4 animate-in fade-in duration-200">
                <!-- Aggregated VWC -->
                <div class="col-span-2 bg-zinc-900/50 border border-zinc-800 p-4 rounded-sm flex justify-between items-center relative overflow-hidden group"
                     [class.border-red-500]="displayRoom().mainPumpFailure && !displayRoom().pin18Bypass"
                     [class.animate-pulse]="displayRoom().mainPumpFailure && !displayRoom().pin18Bypass"
                     [class.shake]="displayRoom().mainPumpFailure && !displayRoom().pin18Bypass"
                     title="Substrate Volumetric Water Content. Keep between 40-60%. Drops faster when hot!">
                    
                    @if (displayRoom().mainPumpFailure) {
                        <div class="absolute inset-0 bg-red-900/20 z-0 pointer-events-none"></div>
                        <div class="absolute top-0 left-0 w-full bg-red-600 text-black text-[10px] font-black text-center animate-pulse z-20">
                            CRITICAL FAILURE: MAIN PUMP LOCKOUT
                        </div>
                    }

                    <div class="absolute right-2 top-2 text-[10px] text-zinc-600 font-mono-ind text-right z-10">
                        {{ displayRoom().sensors.length }} SENSORS ACTIVE<br>
                        @if (displayRoom().sensorStatus === 'DRIFTING') {
                            <span class="text-amber-500 font-bold animate-pulse">NOISY SIGNAL</span>
                        }
                    </div>
                    <div class="z-10">
                        <span class="text-xs font-mono-ind text-zinc-500 uppercase block">Substrate VWC (Avg)</span>
                        @if (displayRoom().sensorStatus === 'ERROR') {
                            <span class="text-4xl font-black font-industrial text-red-500">ERROR</span>
                        } @else {
                            <span class="text-4xl font-black font-industrial text-cyan-400">{{ displayRoom().vwc }}<span class="text-lg text-zinc-600">%</span></span>
                        }
                    </div>
                    <div class="text-right z-10 flex flex-col items-end gap-2">
                        <div>
                            <span class="text-xs font-mono-ind text-zinc-500 block">SHOTS FIRED TODAY</span>
                            <span class="text-xl font-bold text-zinc-300">{{ displayRoom().shotsFiredToday }} / {{ displayRoom().config.p1Shots }}</span>
                        </div>
                        
                        <!-- PIN 18 BYPASS BUTTON (Only visible during failure) -->
                        @if (displayRoom().mainPumpFailure) {
                            <button (click)="togglePin18()" 
                                    [class]="displayRoom().pin18Bypass ? 'bg-emerald-600 text-white border-emerald-400' : 'bg-red-600 text-white border-red-400 animate-bounce'"
                                    class="text-[9px] font-black px-2 py-1 rounded border-2 uppercase shadow-lg hover:scale-105 transition-transform">
                                {{ displayRoom().pin18Bypass ? 'BYPASS ACTIVE (PIN 18)' : 'ENGAGE PIN 18 BYPASS' }}
                            </button>
                        }
                    </div>
                </div>

                <!-- HVAC Telemetry Panel -->
                <div class="col-span-2 bg-zinc-900/50 border border-zinc-800 p-3 rounded-sm flex items-center justify-between relative overflow-hidden group">
                     <!-- Subtle background pulse if active -->
                     <div [class]="'absolute inset-0 opacity-10 transition-colors duration-500 ' + hvacBgColor()"></div>

                     <div class="flex items-center gap-4 relative z-10">
                        <div [class]="'w-12 h-12 rounded flex items-center justify-center border-2 shadow-lg transition-all duration-300 ' + hvacStatusColor()">
                           <span class="material-icons text-2xl">{{ hvacStatusIcon() }}</span>
                        </div>
                        <div>
                            <span class="text-[10px] text-zinc-500 font-mono-ind uppercase block tracking-wider">Climate Control System</span>
                            <div class="flex items-center gap-2">
                                <span class="text-lg font-black text-zinc-200 font-mono-ind tracking-tighter uppercase">{{ displayRoom().hvac.diagnostic }}</span>
                                @if(displayRoom().hvac.mode === 'LOCKED_OUT') {
                                    <span class="px-1.5 py-0.5 bg-red-900/50 border border-red-500 text-[9px] text-red-200 rounded font-bold animate-pulse">
                                        {{ displayRoom().hvac.lockoutRemainingMin }}m WAIT
                                    </span>
                                }
                            </div>
                        </div>
                    </div>

                    <div class="flex flex-col gap-1 items-end relative z-10">
                         <div class="flex gap-1">
                            <span [class]="relayBadgeClass(displayRoom().hvac.coolRelay, 'cool')">AC COMPRESSOR</span>
                            <span [class]="relayBadgeClass(displayRoom().hvac.heatRelay, 'heat')">HEATER BANK</span>
                        </div>
                        <span class="text-[9px] text-zinc-600 font-mono-ind uppercase mt-1">
                            Last Cycle: {{ formatTime(displayRoom().hvac.lastCycleOffTimeMin) }}
                        </span>
                        <!-- NEW: Damper Position (Sim Mode Only) -->
                         @if (appMode.isSim()) {
                            <span class="text-[10px] text-amber-500 font-mono-ind uppercase mt-1 font-bold animate-pulse">
                                DAMPER POS: {{ getSimDamperPos() }}%
                            </span>
                         }
                    </div>
                </div>

                <!-- Environmental Grid -->
                <div class="bg-zinc-900/50 border border-zinc-800 p-2 rounded-sm">
                    <span class="text-[10px] font-mono-ind text-zinc-500 uppercase block">Ambient Temp</span>
                     @if (displayRoom().sensorStatus === 'ERROR') {
                        <span class="text-xl font-bold text-red-500">ERR</span>
                     } @else {
                        <span class="text-xl font-bold text-zinc-200">{{ displayRoom().temp }}°F</span>
                     }
                </div>
                <div class="bg-zinc-900/50 border border-zinc-800 p-2 rounded-sm">
                    <span class="text-[10px] font-mono-ind text-zinc-500 uppercase block">Canopy Temp</span>
                     @if (displayRoom().sensorStatus === 'ERROR') {
                        <span class="text-xl font-bold text-red-500">ERR</span>
                     } @else {
                        <span class="text-xl font-bold text-orange-300">{{ displayRoom().canopyTemp }}°F</span>
                     }
                </div>
                <div class="bg-zinc-900/50 border border-zinc-800 p-2 rounded-sm">
                    <span class="text-[10px] font-mono-ind text-zinc-500 uppercase block">RH / VPD</span>
                     @if (displayRoom().sensorStatus === 'ERROR') {
                        <span class="text-xl font-bold text-red-500">ERR</span>
                     } @else {
                        <div class="flex items-baseline gap-2">
                            <span class="text-xl font-bold text-zinc-200">{{ displayRoom().rh }}%</span>
                            <span class="text-xs font-bold text-emerald-400">{{ displayRoom().vpd }} kPa</span>
                        </div>
                     }
                </div>
                <div class="bg-zinc-900/50 border border-zinc-800 p-2 rounded-sm">
                    <span class="text-[10px] font-mono-ind text-zinc-500 uppercase block">CO2 (PPM)</span>
                    @if (displayRoom().sensorStatus === 'ERROR') {
                        <span class="text-xl font-bold text-red-500">ERR</span>
                     } @else {
                        <span class="text-xl font-bold text-zinc-200">{{ displayRoom().co2 }}</span>
                     }
                </div>
                
                <!-- Next Shot Timer with improved spacing -->
                <div class="col-span-2 bg-zinc-900/50 border border-zinc-800 p-2 rounded-sm flex items-center justify-between mb-4">
                     <span class="text-[10px] font-mono-ind text-zinc-500 uppercase font-bold">Next Irrigation Event</span>
                     <div class="text-lg font-black text-zinc-200 font-mono-ind">
                        T-MINUS {{ displayRoom().nextShotMin }} <span class="text-[10px] font-normal text-zinc-500">MIN</span>
                     </div>
                </div>
            </div>
        }

        <!-- TAB: CHARTS (Moved from Monitor) -->
        @if (activeTab() === 'charts') {
             <div class="space-y-4 animate-in fade-in duration-200 h-full flex flex-col">
                <div class="flex-1 min-h-[250px] bg-zinc-900/50 border border-zinc-800 p-2 rounded-sm">
                    <app-history-chart [data]="displayRoom().history" type="irrigation" />
                </div>
                <div class="flex-1 min-h-[250px] bg-zinc-900/50 border border-zinc-800 p-2 rounded-sm">
                    <app-history-chart [data]="displayRoom().history" type="climate" />
                </div>
            </div>
        }

        <!-- TAB: GENETICS & SOP EDITOR -->
        @if (activeTab() === 'genetics') {
            <div class="animate-in fade-in duration-200 font-mono-ind space-y-4">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-xs font-bold text-zinc-400 uppercase">Active Genetics</span>
                    <button (click)="showAddStrainUI.set(true)" class="bg-emerald-700 hover:bg-emerald-600 text-white text-[10px] font-bold px-3 py-1 rounded transition-colors">+ ADD PLANT</button>
                </div>
                
                <div class="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
                    @for (s of displayRoom().strains; track s.id) {
                        <div (click)="loadStrainForEdit($index)"
                                [class]="'p-3 rounded border text-left transition-all relative group cursor-pointer ' + (selectedStrainIndex() === $index ? 'bg-indigo-900/20 border-indigo-500' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600')">
                            <div class="text-[10px] font-bold text-zinc-300 truncate pr-6">{{ s.name }}</div>
                            <div class="text-[9px] text-zinc-500 mt-1">{{ s.type }} | {{ s.flowerDays }} Days</div>
                            
                            <!-- Remove Button -->
                            <button type="button" 
                                    (click)="$event.preventDefault(); $event.stopPropagation(); requestRemoveStrain($index)" 
                                    class="absolute top-1 right-1 bg-zinc-900 hover:bg-red-900 text-zinc-500 hover:text-red-200 border border-zinc-700 hover:border-red-500 rounded px-1.5 py-0.5 text-[9px] font-bold transition-all z-20 cursor-pointer">
                                REMOVE
                            </button>
                        </div>
                    }
                    @if (displayRoom().strains.length === 0) {
                        <div class="col-span-2 p-4 text-center border border-zinc-800 border-dashed rounded text-zinc-600 text-[10px]">
                            Room is currently empty (Fallow).<br>Add a plant to begin simulation.
                        </div>
                    }
                </div>

                @if (showAddStrainUI()) {
                    <div class="border border-emerald-800 bg-zinc-900/90 p-4 rounded-lg shadow-2xl relative animate-in fade-in slide-in-from-top-2 mb-4">
                        <button (click)="showAddStrainUI.set(false)" class="absolute top-2 right-2 text-zinc-500 hover:text-white">✕</button>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                             <div>
                                <h4 class="text-emerald-500 font-bold text-xs uppercase mb-3 border-b border-emerald-900 pb-1">Select Library Profile</h4>
                                <div class="space-y-2 max-h-40 overflow-y-auto custom-scroll pr-2">
                                    @for (strain of availableStrainsToAdd(); track strain.id) {
                                        <button (click)="addStrain(strain.id)" class="w-full text-left p-2 bg-zinc-950 border border-zinc-800 hover:border-emerald-500 hover:text-emerald-400 rounded flex justify-between group transition-all">
                                            <span class="text-xs font-bold">{{ strain.name }}</span>
                                            <span class="text-[9px] text-zinc-600 group-hover:text-emerald-600">{{ strain.type }}</span>
                                        </button>
                                    }
                                </div>
                             </div>
                             <div class="border-l border-zinc-800 pl-4">
                                <h4 class="text-indigo-400 font-bold text-xs uppercase mb-3 border-b border-indigo-900 pb-1">Create Custom Strain</h4>
                                <div class="space-y-2">
                                    <input [(ngModel)]="newStrain.name" placeholder="Strain Name" class="ind-input">
                                    <div class="flex gap-2">
                                        <select [(ngModel)]="newStrain.type" class="ind-input w-1/2">
                                            <option value="HYBRID">HYBRID</option>
                                            <option value="SATIVA">SATIVA</option>
                                            <option value="INDICA">INDICA</option>
                                        </select>
                                        <input type="number" [(ngModel)]="newStrain.flowerDays" placeholder="Days" class="ind-input w-1/2">
                                    </div>
                                    <button (click)="createAndAddStrain()" [disabled]="!newStrain.name" class="w-full bg-indigo-700 hover:bg-indigo-600 text-white text-[10px] font-bold py-2 rounded transition-colors mt-2 disabled:opacity-50">CREATE & ADD</button>
                                </div>
                             </div>
                        </div>
                    </div>
                }

                @if (editingStrain(); as strain) {
                    <div class="border border-zinc-800 bg-zinc-900/50 p-4 rounded relative animate-in fade-in">
                        <div class="flex justify-between items-center mb-4 border-b border-indigo-900 pb-2">
                            <h3 class="text-sm font-bold text-indigo-400 uppercase flex items-center gap-2">
                                <span class="material-icons text-sm">edit_note</span> Editing: {{ strain.name }}
                            </h3>
                            <div class="flex gap-2">
                                <button (click)="discardChanges()" class="text-[10px] px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300">DISCARD</button>
                                <button (click)="saveStrain()" class="text-[10px] px-3 py-1 bg-indigo-600 hover:bg-indigo-500 rounded text-white font-bold shadow-[0_0_10px_rgba(79,70,229,0.3)]">SAVE CHANGES</button>
                            </div>
                        </div>
                        <div class="grid grid-cols-3 gap-3 mb-4">
                            <div class="form-group"><label class="text-[9px] text-zinc-500 uppercase font-bold">Strain Name</label><input [(ngModel)]="strain.name" class="ind-input"></div>
                            <!-- NEW: Veg Days Input -->
                            <div class="form-group"><label class="text-[9px] text-zinc-500 uppercase font-bold">Veg Days</label><input type="number" [(ngModel)]="strain.vegDays" class="ind-input"></div>
                            <div class="form-group"><label class="text-[9px] text-zinc-500 uppercase font-bold">Flower Days</label><input type="number" [(ngModel)]="strain.flowerDays" class="ind-input"></div>
                        </div>
                        
                        <!-- Compact SOP / Milestones Editor -->
                         <div class="mt-4 border-t border-zinc-800 pt-3">
                            <div class="flex justify-between items-center mb-2">
                                <h4 class="text-[10px] font-bold text-zinc-400 uppercase">SOP Calendar Events</h4>
                                <button (click)="addMilestone()" class="text-[9px] bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-2 py-1 rounded text-zinc-300">+ ADD EVENT</button>
                            </div>
                            
                            <!-- Header Row -->
                            <div class="grid grid-cols-12 gap-2 px-2 mb-1 text-[8px] font-bold text-zinc-500 uppercase">
                                <div class="col-span-3 text-center">Timing</div>
                                <div class="col-span-3">Title</div>
                                <div class="col-span-2">Type</div>
                                <div class="col-span-3">Note</div>
                                <div class="col-span-1"></div>
                            </div>

                            <div class="space-y-1 max-h-60 overflow-y-auto custom-scroll pr-1">
                                @for (m of strain.milestones; track $index) {
                                    <div class="grid grid-cols-12 gap-2 bg-zinc-950 p-1.5 rounded border border-zinc-800 items-center hover:border-zinc-600 transition-colors">
                                        <!-- NEW: Phase Selector + Day -->
                                        <div class="col-span-3 flex gap-1">
                                            <select [(ngModel)]="m.phase" class="ind-input h-6 text-[9px] p-0 w-1/2" title="Phase">
                                                <option value="VEG">VEG</option>
                                                <option value="FLOWER">FLWR</option>
                                            </select>
                                            <input type="number" [(ngModel)]="m.day" class="ind-input text-center h-6 w-1/2" title="Day">
                                        </div>

                                        <div class="col-span-3">
                                            <input [(ngModel)]="m.title" class="ind-input h-6" title="Title">
                                        </div>
                                        <div class="col-span-2">
                                            <select [(ngModel)]="m.type" class="ind-input h-6 text-[9px] p-0" title="Type">
                                                <option value="FEED">FEED</option>
                                                <option value="PRUNE">PRUNE</option>
                                                <option value="TOP">TOP</option>
                                                <option value="DEFOL">DEFOL</option>
                                                <option value="TRANSPLANT">TRANSPLANT</option>
                                                <option value="HARVEST">HARVEST</option>
                                            </select>
                                        </div>
                                        <div class="col-span-3">
                                            <input [(ngModel)]="m.description" class="ind-input h-6" title="Note">
                                        </div>
                                        <div class="col-span-1 flex justify-center">
                                            <button (click)="removeMilestone($index)" class="text-zinc-600 hover:text-red-500 font-bold px-1 py-0.5 rounded hover:bg-zinc-800 transition-colors">✕</button>
                                        </div>
                                    </div>
                                }
                                @if (strain.milestones.length === 0) {
                                    <div class="text-center text-[10px] text-zinc-600 py-4 italic border border-dashed border-zinc-800 rounded">No scheduled events.</div>
                                }
                            </div>
                         </div>
                    </div>
                }
            </div>
        }

        <!-- TAB: IRRIGATION CONFIG -->
        @if (activeTab() === 'irrigation') {
            <div class="space-y-4 animate-in fade-in duration-200 font-mono-ind">
                <div class="border-l-2 border-emerald-600 pl-3">
                    <h3 class="text-sm font-bold text-emerald-500 uppercase mb-2">Athena Phase Logic</h3>
                    <div class="grid grid-cols-2 gap-3">
                         <div class="form-group"><label class="text-[10px] text-zinc-500 uppercase">P0 Dormancy (Min)</label><input type="number" [ngModel]="displayRoom().config.p0Duration" (ngModelChange)="updateConfig('p0Duration', $event)" class="ind-input"></div>
                         <div class="form-group"><label class="text-[10px] text-zinc-500 uppercase">Shot Size (Sec)</label><input type="number" [ngModel]="displayRoom().config.shotDuration" (ngModelChange)="updateConfig('shotDuration', $event)" class="ind-input"></div>
                    </div>
                </div>
                <div class="border-l-2 border-cyan-600 pl-3">
                    <h3 class="text-sm font-bold text-cyan-500 uppercase mb-2">P1 (Ramp) Config</h3>
                     <div class="grid grid-cols-2 gap-3">
                         <div class="form-group"><label class="text-[10px] text-zinc-500 uppercase">Duration (Min)</label><input type="number" [ngModel]="displayRoom().config.p1Duration" (ngModelChange)="updateConfig('p1Duration', $event)" class="ind-input"></div>
                         <div class="form-group"><label class="text-[10px] text-zinc-500 uppercase">Interval (Min)</label><input type="number" [ngModel]="displayRoom().config.p1Interval" (ngModelChange)="updateConfig('p1Interval', $event)" class="ind-input"></div>
                         <div class="form-group col-span-2"><label class="text-[10px] text-zinc-500 uppercase">P1 Shots (Count)</label><input type="number" [ngModel]="displayRoom().config.p1Shots" (ngModelChange)="updateConfig('p1Shots', $event)" class="ind-input"></div>
                    </div>
                </div>
                <div class="border-l-2 border-amber-600 pl-3">
                    <h3 class="text-sm font-bold text-amber-500 uppercase mb-2">P2 (Maint) Config</h3>
                     <div class="grid grid-cols-2 gap-3">
                         <div class="form-group"><label class="text-[10px] text-zinc-500 uppercase">Interval (Min)</label><input type="number" [ngModel]="displayRoom().config.p2Interval" (ngModelChange)="updateConfig('p2Interval', $event)" class="ind-input"></div>
                         <div class="form-group"><label class="text-[10px] text-zinc-500 uppercase">Cutoff (Min)</label><input type="number" [ngModel]="displayRoom().config.p2Cutoff" (ngModelChange)="updateConfig('p2Cutoff', $event)" class="ind-input"></div>
                    </div>
                </div>
            </div>
        }

        <!-- TAB: CLIMATE CONFIG -->
        @if (activeTab() === 'climate') {
             <div class="space-y-4 animate-in fade-in duration-200 font-mono-ind">
                
                <!-- NEW: Schedule Information (Read Only) -->
                <div class="bg-zinc-900 border border-zinc-800 p-3 rounded-sm relative">
                    <span class="material-icons absolute top-2 right-2 text-zinc-600 text-sm">sync</span>
                    <h3 class="text-xs font-bold text-zinc-400 uppercase mb-3 border-b border-zinc-800 pb-1">HVAC Sync Status</h3>
                    <p class="text-[10px] text-zinc-500">HVAC shift schedule is locked to Photoperiod (Lighting).</p>
                    <div class="flex justify-between mt-2">
                        <span class="text-[10px] text-amber-500 font-bold">DAY: {{ formatTime(displayRoom().config.lightsOnHour * 60) }}</span>
                        <span class="text-[10px] text-indigo-400 font-bold">NIGHT: {{ formatTime((displayRoom().config.lightsOnHour + displayRoom().config.dayLength) * 60) }}</span>
                    </div>
                </div>

                <div class="bg-zinc-900 border border-zinc-800 p-3 rounded-sm relative">
                    <span class="material-icons absolute top-2 right-2 text-amber-500 text-sm">wb_sunny</span>
                    <h3 class="text-xs font-bold text-zinc-400 uppercase mb-3 border-b border-zinc-800 pb-1">Day Setpoints</h3>
                    <div class="grid grid-cols-2 gap-3">
                         <div class="form-group"><label class="text-[10px] text-zinc-500 uppercase">Temp Low (°F)</label><input type="number" [ngModel]="displayRoom().config.dayTempLow" (ngModelChange)="updateConfig('dayTempLow', $event)" class="ind-input"></div>
                         <div class="form-group"><label class="text-[10px] text-zinc-500 uppercase">Temp High (°F)</label><input type="number" [ngModel]="displayRoom().config.dayTempHigh" (ngModelChange)="updateConfig('dayTempHigh', $event)" class="ind-input"></div>
                         <div class="form-group col-span-2"><label class="text-[10px] text-zinc-500 uppercase">Target RH (%)</label><input type="number" [ngModel]="displayRoom().config.dayRhTarget" (ngModelChange)="updateConfig('dayRhTarget', $event)" class="ind-input"></div>
                    </div>
                </div>
                <div class="bg-zinc-900 border border-zinc-800 p-3 rounded-sm relative">
                    <span class="material-icons absolute top-2 right-2 text-indigo-500 text-sm">nights_stay</span>
                    <h3 class="text-xs font-bold text-zinc-400 uppercase mb-3 border-b border-zinc-800 pb-1">Night Setpoints</h3>
                    <div class="grid grid-cols-2 gap-3">
                         <div class="form-group"><label class="text-[10px] text-zinc-500 uppercase">Temp Low (°F)</label><input type="number" [ngModel]="displayRoom().config.nightTempLow" (ngModelChange)="updateConfig('nightTempLow', $event)" class="ind-input"></div>
                         <div class="form-group"><label class="text-[10px] text-zinc-500 uppercase">Temp High (°F)</label><input type="number" [ngModel]="displayRoom().config.nightTempHigh" (ngModelChange)="updateConfig('nightTempHigh', $event)" class="ind-input"></div>
                         <div class="form-group col-span-2"><label class="text-[10px] text-zinc-500 uppercase">Target RH (%)</label><input type="number" [ngModel]="displayRoom().config.nightRhTarget" (ngModelChange)="updateConfig('nightRhTarget', $event)" class="ind-input"></div>
                    </div>
                </div>
            </div>
        }

        <!-- TAB: LIGHTING -->
        @if (activeTab() === 'lighting') {
            <div class="space-y-4 animate-in fade-in duration-200 font-mono-ind">
                <div class="bg-zinc-900 border border-zinc-800 p-4 rounded-sm flex flex-col items-center justify-center gap-4">
                     <div [class]="'w-16 h-16 rounded-full border-4 flex items-center justify-center transition-all duration-500 ' + (displayRoom().lightsOn ? 'border-amber-400 bg-amber-400/20 shadow-[0_0_30px_#fbbf24]' : 'border-zinc-700 bg-zinc-800')">
                        <span class="material-icons text-3xl" [class]="displayRoom().lightsOn ? 'text-amber-400' : 'text-zinc-600'">light_mode</span>
                     </div>
                     <div class="text-center">
                        <h3 class="text-lg font-bold text-zinc-200 uppercase">Main Grow Lights</h3>
                        <span class="text-xs text-zinc-500">{{ displayRoom().lightsOn ? 'OUTPUT: ' + displayRoom().config.lightIntensity + '%' : 'OUTPUT: 0%' }}</span>
                     </div>
                     <button (click)="toggleLights.emit()" class="w-full py-3 bg-zinc-800 border border-zinc-600 hover:bg-zinc-700 text-zinc-200 font-bold uppercase rounded-sm">Toggle Manual Override</button>
                </div>

                <div class="grid grid-cols-2 gap-3">
                     <div class="form-group">
                        <label class="text-[10px] text-zinc-500 uppercase">On Hour (24h)</label>
                        <input type="number" [ngModel]="displayRoom().config.lightsOnHour" (ngModelChange)="updateConfig('lightsOnHour', $event)" class="ind-input">
                     </div>
                     <div class="form-group">
                        <label class="text-[10px] text-zinc-500 uppercase">Duration (Hrs)</label>
                        <input type="number" [ngModel]="displayRoom().config.dayLength" (ngModelChange)="updateConfig('dayLength', $event)" class="ind-input">
                     </div>
                </div>
                
                <!-- NEW CONTROLS -->
                <div class="border-t border-zinc-800 pt-3">
                    <label class="text-[10px] text-zinc-500 uppercase block mb-1">Light Intensity ({{ displayRoom().config.lightIntensity }}%)</label>
                    <input type="range" min="0" max="100" step="10" 
                           [ngModel]="displayRoom().config.lightIntensity" 
                           (ngModelChange)="updateConfig('lightIntensity', $event)" 
                           class="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-amber-500">
                </div>

                <div>
                    <label class="text-[10px] text-zinc-500 uppercase block mb-1">Ramp Up/Down (Minutes)</label>
                    <input type="number" 
                           [ngModel]="displayRoom().config.lightRampDuration" 
                           (ngModelChange)="updateConfig('lightRampDuration', $event)" 
                           class="ind-input">
                </div>
            </div>
        }

      </div>

      <!-- Footer / Action Bar -->
      <div class="p-3 bg-zinc-900 border-t-2 border-zinc-800 flex gap-2 shrink-0">
         <button (click)="confirmToggle()" [disabled]="disabled()" [class]="valveBtnClass()">
             {{ displayRoom().valveOpen ? 'STOP / CANCEL' : 'MANUAL SHOT (' + (displayRoom().config.shotDuration || 30) + 's)' }}
         </button>
      </div>
      
        @if(showConfirmation) {
            <div class="absolute inset-0 bg-zinc-950/95 flex flex-col items-center justify-center p-6 z-50 animate-in fade-in duration-100">
                <div class="border-2 border-red-600 p-6 bg-zinc-900 w-full text-center shadow-[0_0_20px_rgba(220,38,38,0.3)]">
                    <p class="text-red-500 font-black text-xl mb-4 font-industrial uppercase tracking-widest">⚠️ Override Confirm</p>
                    <div class="grid grid-cols-2 gap-4 w-full">
                        <button (click)="cancelConfirm()" class="py-3 bg-zinc-800 text-zinc-400 font-bold border border-zinc-600 hover:bg-zinc-700">CANCEL</button>
                        <button (click)="executeToggle()" class="py-3 bg-red-600 text-white font-bold hover:bg-red-500 border border-red-400">EXECUTE</button>
                    </div>
                </div>
            </div>
        }
    </div>
  `,
  styles: [`
    .ind-input {
      width: 100%;
      background: #09090b;
      border: 1px solid #3f3f46;
      color: #e4e4e7;
      padding: 4px 8px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      border-radius: 2px;
    }
    .ind-input:focus {
      border-color: #3b82f6;
      outline: none;
      background: #18181b;
    }
    .custom-scroll::-webkit-scrollbar { width: 4px; }
    .custom-scroll::-webkit-scrollbar-track { background: #18181b; }
    .custom-scroll::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 2px; }
  `]
})
export class RoomCardComponent {
  room = input.required<RoomState>();
  vitality = input.required<number>(); // 0-100
  disabled = input<boolean>(false);
  isOverridden = input<boolean>(false); // New Input for Visual Warning
  toggle = output<void>();
  toggleLights = output<void>();
  
  facility = inject(FacilityService);
  private strainService = inject(StrainService);
  private gamification = inject(GamificationService);
  private sound = inject(SoundService);
  appMode = inject(AppModeService);
  private simService = inject(SimulationService);

  activeTab = signal<'monitor' | 'charts' | 'irrigation' | 'climate' | 'lighting' | 'genetics'>('monitor');
  selectedStrainIndex = signal<number>(0);
  editingStrain = signal<StrainProfile | null>(null);

  showConfirmation = false;
  showAddStrainUI = signal(false);
  allStrains = this.strainService.STRAINS;

  newStrain: Partial<StrainProfile> = {
      name: '',
      type: 'HYBRID',
      vegDays: 14,
      flowerDays: 63
  };

  // --- DATA MULTIPLEXING ---
  displayRoom = computed(() => {
    // FacilityService now handles all merging of worker data into the main room signal.
    // We no longer need to manually multiplex between simService and room().
    return this.room();
  });

  rank = computed(() => this.gamification.getRankForScore(this.vitality()));

  // --- NEW: Computed for Total Days Alive ---
  totalDaysAlive = computed(() => {
    const room = this.displayRoom();
    if (!room.vegStartDate) return 0;
    const now = this.facility.simDate();
    // Use same unified math as worker
    return Math.floor((now - room.vegStartDate) / (24 * 3600 * 1000));
  });

  availableStrainsToAdd = computed(() => {
    const currentStrainIds = this.displayRoom().strains.map(s => s.id);
    return this.allStrains.filter(s => !currentStrainIds.includes(s.id));
  });

  constructor() {
     effect(() => {
        const room = this.displayRoom();
        const idx = this.selectedStrainIndex();
        if (room.strains.length > 0 && idx >= room.strains.length) {
            this.selectedStrainIndex.set(0);
            this.loadStrainForEdit(0);
        } else if (room.strains.length > 0 && this.activeTab() === 'genetics' && !this.editingStrain()) {
            this.loadStrainForEdit(idx);
        } else if (room.strains.length === 0) {
            this.editingStrain.set(null);
        }
     }, { allowSignalWrites: true });
  }

  // --- COMPUTED VISUALS ---
  statusColor = computed(() => {
    switch(this.displayRoom().phase) {
      case 'P1': return 'bg-emerald-500';
      case 'P2': return 'bg-cyan-500';
      case 'P3': return 'bg-amber-500';
      case 'NIGHT': return 'bg-indigo-900';
      default: return 'bg-zinc-700';
    }
  });

  statusTextColor = computed(() => {
    switch(this.displayRoom().phase) {
      case 'P1': return 'text-emerald-500 border-emerald-900';
      case 'P2': return 'text-cyan-500 border-cyan-900';
      case 'P3': return 'text-amber-500 border-amber-900';
      case 'NIGHT': return 'text-indigo-400 border-indigo-900';
      default: return 'text-zinc-500';
    }
  });

  vitalityColor() {
      const v = this.vitality();
      if (v >= 90) return 'bg-emerald-500 shadow-[0_0_10px_#10b981]';
      if (v >= 70) return 'bg-blue-500';
      if (v >= 50) return 'bg-amber-500';
      return 'bg-red-500 animate-pulse';
  }

  rankColor() {
      const r = this.rank();
      if (r === 'S') return 'text-amber-300 border-amber-500 shadow-[0_0_15px_#fcd34d]';
      if (r === 'A') return 'text-emerald-400 border-emerald-600';
      if (r === 'B') return 'text-blue-400 border-blue-600';
      if (r === 'C') return 'text-zinc-400 border-zinc-600';
      return 'text-red-500 border-red-600 animate-pulse';
  }

  // HVAC Visuals
  hvacStatusColor = computed(() => {
    const hvac = this.displayRoom().hvac;
    if (hvac.mode === 'LOCKED_OUT') return 'bg-red-900/50 text-red-500 border-red-600 animate-pulse';
    if (hvac.coolRelay) return 'bg-cyan-500 text-black border-cyan-400 shadow-[0_0_15px_#22d3ee]';
    if (hvac.heatRelay) return 'bg-orange-500 text-black border-orange-400 shadow-[0_0_15px_#f97316]';
    return 'bg-zinc-800 text-zinc-500 border-zinc-700';
  });

  hvacBgColor = computed(() => {
    const hvac = this.displayRoom().hvac;
    if (hvac.mode === 'LOCKED_OUT') return 'bg-red-900';
    if (hvac.coolRelay) return 'bg-cyan-600';
    if (hvac.heatRelay) return 'bg-orange-600';
    return 'bg-transparent';
  });

  hvacStatusIcon = computed(() => {
    const hvac = this.displayRoom().hvac;
    if (hvac.mode === 'LOCKED_OUT') return 'lock_clock';
    if (hvac.coolRelay) return 'ac_unit';
    if (hvac.heatRelay) return 'local_fire_department';
    return 'hvac';
  });

  setActiveTab(tab: any) {
      this.activeTab.set(tab);
      if (tab === 'genetics' && this.displayRoom().strains.length > 0) {
          this.loadStrainForEdit(this.selectedStrainIndex());
      }
  }

  loadStrainForEdit(index: number) {
      if (index < 0 || index >= this.displayRoom().strains.length) return;
      this.selectedStrainIndex.set(index);
      const strain = this.displayRoom().strains[index];
      if (strain) {
        this.editingStrain.set(JSON.parse(JSON.stringify(strain)));
      }
  }

  saveStrain() {
      const strain = this.editingStrain();
      if(!strain) return;
      this.facility.updateRoomStrain(this.displayRoom().id, this.selectedStrainIndex(), strain);
  }

  discardChanges() {
      this.loadStrainForEdit(this.selectedStrainIndex());
  }

  addMilestone() {
     const strain = this.editingStrain();
     if (!strain) return;
     
     const currentPhase = this.displayRoom().currentLifecyclePhase;
     const safePhase = currentPhase === 'IDLE' ? 'VEG' : currentPhase as 'VEG' | 'FLOWER';

     const newM: Milestone = { 
         day: this.displayRoom().dayOfCycle + 1, 
         phase: safePhase,
         title: 'New SOP Event', 
         description: 'Action item', 
         type: 'FEED' 
     };
     strain.milestones.push(newM);
     strain.milestones.sort((a, b) => a.day - b.day);
     this.editingStrain.set({...strain});
  }

  removeMilestone(index: number) {
      const strain = this.editingStrain();
      if (!strain) return;
      strain.milestones.splice(index, 1);
      this.editingStrain.set({...strain});
  }

  addStrain(strainId: string) {
    this.facility.addStrain(this.displayRoom().id, strainId);
    this.showAddStrainUI.set(false);
  }

  createAndAddStrain() {
      if (!this.newStrain.name) return;
      const strain: StrainProfile = {
          id: 'CUSTOM_' + Date.now(),
          name: this.newStrain.name,
          type: this.newStrain.type as any,
          vegDays: this.newStrain.vegDays || 14,
          flowerDays: this.newStrain.flowerDays || 60,
          stretch: 'MED',
          feedSensitivity: 'MED',
          milestones: [] 
      };
      this.facility.addCustomStrain(this.displayRoom().id, strain);
      this.newStrain = { name: '', type: 'HYBRID', flowerDays: 63, vegDays: 14 };
      this.showAddStrainUI.set(false);
  }

  requestRemoveStrain(index: number) {
      if (confirm('Are you sure you want to remove this plant profile from the room?')) {
          this.facility.removeStrain(this.displayRoom().id, index);
      }
  }

  togglePin18() {
      this.facility.togglePin18(this.displayRoom().id);
  }

  getStartDate() {
      // Fix: Strictly return vegStartDate as per instruction
      return this.displayRoom().vegStartDate;
  }

  // --- NEW: Calculate Finish Date based on longest strain ---
  getFinishDate() {
      const start = this.getStartDate();
      if (!start) return null;
      
      const strains = this.displayRoom().strains;
      if (strains.length === 0) return null;

      // Find the longest cycle duration (Veg + Flower)
      const maxTotalDays = Math.max(...strains.map(s => (s.vegDays || 14) + s.flowerDays));
      
      return start + (maxTotalDays * 24 * 60 * 60 * 1000);
  }

  updateStartDate(dateStr: string) {
      if (!dateStr) return;
      
      // Parse YYYY-MM-DD to Local Midnight timestamp
      const parts = dateStr.split('-');
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
      const day = parseInt(parts[2], 10);
      
      const newDate = new Date(year, month, day);
      this.facility.setStartDate(this.displayRoom().id, newDate.getTime());
  }

  tabClass(tab: string) {
    const base = "flex-none px-4 py-3 text-[10px] font-bold font-industrial uppercase tracking-wider transition-colors border-r border-zinc-800 ";
    if (this.activeTab() === tab) {
        return base + "bg-zinc-800 text-zinc-100 border-b-2 border-b-blue-500";
    }
    return base + "bg-zinc-900 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300";
  }

  relayBadgeClass(isActive: boolean, type: 'cool' | 'heat') {
      const base = "text-[9px] px-2 py-0.5 rounded font-bold border ";
      if (!isActive) return base + "bg-zinc-950 text-zinc-700 border-zinc-800 opacity-50";
      
      if (type === 'cool') return base + "bg-cyan-900/40 text-cyan-400 border-cyan-500/50 animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.3)]";
      return base + "bg-orange-900/40 text-orange-400 border-orange-500/50 animate-pulse shadow-[0_0_8px_rgba(249,115,22,0.3)]";
  }

  valveBtnClass = computed(() => {
    const base = "w-full py-3 font-bold font-industrial uppercase tracking-widest text-sm transition-all border rounded-sm ";
    if (this.disabled()) return base + "bg-zinc-800 text-zinc-600 border-zinc-700 cursor-not-allowed";
    return this.displayRoom().valveOpen
        ? base + "bg-red-900/20 text-red-500 border-red-900 hover:bg-red-900/40"
        : base + "bg-emerald-900/20 text-emerald-500 border-emerald-900 hover:bg-emerald-900/40";
  });

  updateConfig(key: string, value: any) {
    this.facility.updateConfig(this.displayRoom().id, { [key]: parseFloat(value) });
  }

  confirmToggle() {
    if (this.disabled()) return;
    this.showConfirmation = true;
  }
  
  executeToggle() {
    this.showConfirmation = false;
    this.sound.playValveOpen(); // AUDIO FX
    this.toggle.emit();
  }
  
  cancelConfirm() { this.showConfirmation = false; }

  formatTime(minutes: number): string {
    if (minutes < 0) return '--:--';
    const h = Math.floor(minutes / 60) % 24;
    const m = Math.floor(minutes % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  getSimDamperPos() {
    return this.displayRoom().damperPos;
  }
}
