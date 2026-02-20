
import { Component, input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Milestone, StrainProfile } from '../models';

interface MilestoneMarker extends Milestone {
  leftPct: number;
  alignment: 'left' | 'center' | 'right';
  isFlip?: boolean;
}

interface SteeringBlock {
  leftPct: number;
  widthPct: number;
  label: string;
  pattern: string;
}

@Component({
  selector: 'app-calendar-widget',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="w-full bg-zinc-900 border border-zinc-800 rounded p-2 mt-2">
      <div class="flex justify-between items-center mb-2">
         
         <div class="flex items-center gap-2">
             <span class="text-[10px] text-zinc-500 font-mono-ind uppercase font-bold">Total Lifecycle</span>
             <!-- Strain Selector if multiple -->
             @if (strains().length > 1) {
                 <select [ngModel]="selectedStrainIndex()" (ngModelChange)="selectedStrainIndex.set($event)"
                         class="bg-zinc-800 border border-zinc-700 text-[10px] text-zinc-300 rounded px-1 py-0.5 outline-none">
                     @for (s of strains(); track $index) {
                         <option [value]="$index">{{ s.name }}</option>
                     }
                 </select>
             } @else {
                 <span class="text-[10px] text-zinc-400 font-mono-ind">{{ currentStrain().name }}</span>
             }
         </div>

         <!-- Enhanced Progress & Next Event Indicator -->
         <div class="flex flex-col items-end">
            <span class="text-xs text-white font-mono-ind">
               VEG: {{ currentStrain().vegDays }}d | FLOWER: {{ currentStrain().flowerDays }}d
            </span>
            @if (nextEvent(); as next) {
               <span class="text-[10px] text-emerald-400 font-bold uppercase animate-pulse">
                 NEXT: {{ next.title }} ({{ next.daysRemaining }}d)
               </span>
            } @else {
               <span class="text-[10px] text-zinc-600 font-bold uppercase">HARVEST SOON</span>
            }
         </div>
      </div>
      
      <!-- Timeline Track (Split View) -->
      <div class="relative w-full h-8 bg-zinc-800 rounded overflow-visible flex items-center group/track border border-zinc-700 mt-4 mb-6">
         
         <!-- 1. VEG Phase Background -->
         <div class="h-full bg-emerald-900/30 border-r border-emerald-900/50 relative overflow-hidden" 
              [style.width.%]="vegPct()">
              <div class="absolute bottom-0.5 left-1 text-[8px] font-bold text-emerald-600">VEG</div>
         </div>

         <!-- 2. FLOWER Phase Background -->
         <div class="h-full bg-indigo-900/30 relative overflow-hidden" 
              [style.width.%]="flowerPct()">
              <div class="absolute bottom-0.5 right-1 text-[8px] font-bold text-indigo-600">FLOWER</div>
         </div>

         <!-- NEW: Steering Duration Blocks (Overlaid) -->
         @for (block of steeringBlocks(); track block.label) {
            <div class="absolute bottom-0 h-[40%] border-l border-white/20 z-10 pointer-events-none"
                 [style.left.%]="block.leftPct"
                 [style.width.%]="block.widthPct"
                 [style.background]="block.pattern">
                 <div class="px-1 text-[7px] font-bold text-white/40 uppercase truncate w-full pt-1 hidden sm:block">
                    {{ block.label }}
                 </div>
            </div>
         }

         <!-- Current Day Marker (Absolute Position) -->
         <div class="absolute top-[-4px] bottom-[-4px] w-0.5 bg-white z-20 shadow-[0_0_10px_white] transition-all duration-500 pointer-events-none"
              [style.left.%]="lifecycleProgressPercent()">
              <div class="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white rounded-full"></div>
         </div>

         <!-- Milestones Markers -->
         @for (m of milestoneMarkers(); track m.id || m.title) {
            <div class="absolute top-1 bottom-1 w-0.5 z-30 cursor-help transition-all group/marker"
                 [class]="m.phase === 'VEG' ? 'bg-emerald-500/60 hover:bg-emerald-400' : 'bg-indigo-500/60 hover:bg-indigo-400'"
                 [style.left.%]="m.leftPct">
                 
                 <!-- Marker Head -->
                 <div class="absolute -top-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full transition-transform group-hover/marker:scale-150"
                      [class]="m.phase === 'VEG' ? 'bg-emerald-500' : 'bg-indigo-500'"></div>

                 <!-- Tooltip -->
                 <div class="opacity-0 group-hover/marker:opacity-100 transition-opacity absolute bottom-full mb-3 w-40 bg-zinc-950/95 backdrop-blur-sm border border-zinc-700 p-2 rounded shadow-2xl pointer-events-none z-50 flex flex-col gap-1"
                      [class.left-0]="m.alignment === 'left'"
                      [class.right-0]="m.alignment === 'right'"
                      [class.left-1/2]="m.alignment === 'center'"
                      [class.-translate-x-1/2]="m.alignment === 'center'"
                      [class.-right-full]="m.alignment === 'right'" 
                      style="min-width: 140px;">
                    
                    <div class="flex items-center justify-between border-b border-zinc-800 pb-1">
                        <span class="text-[9px] font-bold uppercase" [class]="m.phase === 'VEG' ? 'text-emerald-400' : 'text-indigo-400'">
                           {{ m.title }}
                        </span>
                        <span class="text-[8px] text-zinc-500 font-mono">D{{ m.day }}</span>
                    </div>
                    <div class="text-[9px] text-zinc-300 leading-tight">{{ m.description }}</div>
                    @if(m.isFlip) {
                        <div class="text-[8px] text-indigo-300 font-bold bg-indigo-900/30 px-1 rounded mt-1 text-center">PHASE CHANGE</div>
                    }
                 </div>
            </div>
         }
      </div>

      <!-- Active Alerts (Today) -->
      @if (activeMilestones().length > 0) {
        <div class="mt-2 space-y-1">
            @for (alert of activeMilestones(); track alert.milestone.title) {
                <div class="p-2 bg-emerald-900/20 border border-emerald-900/50 rounded flex items-center gap-2 animate-pulse">
                    <span class="material-icons text-emerald-500 text-sm">event</span>
                    <div>
                        <span class="block text-[10px] font-bold text-emerald-500 uppercase">
                            {{ alert.strainName }}: {{ alert.milestone.title }}
                        </span>
                        <span class="block text-[9px] text-zinc-400">{{ alert.milestone.description }}</span>
                    </div>
                </div>
            }
        </div>
      }
    </div>
  `
})
export class CalendarWidgetComponent {
  totalDaysAlive = input.required<number>(); 
  phase = input<'IDLE' | 'VEG' | 'FLOWER'>('FLOWER'); 
  strains = input.required<StrainProfile[]>();
  activeMilestones = input.required<{ strainName: string, milestone: Milestone }[]>();
  
  selectedStrainIndex = signal<number>(0);

  currentStrain = computed(() => {
      const list = this.strains();
      if (!list || list.length === 0) {
          return {
              id: 'LOADING',
              name: 'Loading...',
              type: 'HYBRID',
              flowerDays: 60,
              vegDays: 14,
              stretch: 'MED',
              feedSensitivity: 'MED',
              milestones: []
          } as StrainProfile;
      }
      return list[this.selectedStrainIndex()] || list[0];
  });

  // Total Duration = Veg + Flower
  totalDuration = computed(() => (this.currentStrain().vegDays || 14) + (this.currentStrain().flowerDays || 60));

  // Width Percentages for background sections
  vegPct = computed(() => {
      const veg = this.currentStrain().vegDays || 14;
      return (veg / this.totalDuration()) * 100;
  });

  flowerPct = computed(() => 100 - this.vegPct());

  // Calculate absolute progress percentage (0-100) of the total lifecycle
  lifecycleProgressPercent = computed(() => {
      const daysAlive = this.totalDaysAlive();
      const total = this.totalDuration();
      const pct = (total > 0) ? (daysAlive / total) * 100 : 0;
      return Math.min(100, Math.max(0, pct));
  });

  // NEW: Calculate duration blocks for Crop Steering Phases (Type = FEED)
  steeringBlocks = computed<SteeringBlock[]>(() => {
    const s = this.currentStrain();
    const total = this.totalDuration();
    if (total === 0) return [];

    // Filter for FEED type milestones and calculate their absolute days
    const events = s.milestones
        .filter(m => m.type === 'FEED')
        .map(m => ({
            ...m,
            absDay: m.phase === 'VEG' ? m.day : (s.vegDays || 14) + m.day
        }))
        .sort((a, b) => a.absDay - b.absDay);

    const blocks: SteeringBlock[] = [];

    for (let i = 0; i < events.length; i++) {
        const current = events[i];
        const next = events[i + 1];

        // The block runs until the next FEED event or the end of the total lifecycle
        const endDay = next ? next.absDay : total;
        const duration = endDay - current.absDay;

        if (duration > 0) {
            blocks.push({
                leftPct: (current.absDay / total) * 100,
                widthPct: (duration / total) * 100,
                label: current.title,
                pattern: this.getSteeringPattern(current.title)
            });
        }
    }
    return blocks;
  });

  // Helper to generate hatched patterns based on phase keywords
  private getSteeringPattern(title: string): string {
    const t = title.toLowerCase();
    
    // Generative (Drybacks/Stress) -> Amber/Red Hashing
    if (t.includes('generative')) {
        return 'repeating-linear-gradient(45deg, rgba(245, 158, 11, 0.2) 0px, rgba(245, 158, 11, 0.2) 2px, transparent 2px, transparent 6px)';
    }
    // Vegetative (Bulking) -> Emerald/Green Hashing
    if (t.includes('vegetative')) {
        return 'repeating-linear-gradient(45deg, rgba(16, 185, 129, 0.2) 0px, rgba(16, 185, 129, 0.2) 2px, transparent 2px, transparent 6px)';
    }
    // Flush (Clean) -> Cyan/Blue Hashing
    if (t.includes('flush')) {
        return 'repeating-linear-gradient(45deg, rgba(6, 182, 212, 0.2) 0px, rgba(6, 182, 212, 0.2) 2px, transparent 2px, transparent 6px)';
    }
    // Default (e.g., Initial Flip) -> Subtle White Hashing
    return 'repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.1) 0px, rgba(255, 255, 255, 0.1) 2px, transparent 2px, transparent 6px)';
  }

  // Robust marker mapping function
  milestoneMarkers = computed<MilestoneMarker[]>(() => {
    const s = this.currentStrain();
    const total = this.totalDuration();
    if (total === 0) return [];
    
    // 1. Map existing Strain Milestones
    const markers: MilestoneMarker[] = s.milestones.map(m => {
        let absDay = m.phase === 'VEG' ? m.day : (s.vegDays || 14) + m.day;
        const pct = (absDay / total) * 100;
        
        let alignment: 'left' | 'center' | 'right' = 'center';
        if (pct < 15) alignment = 'left';
        else if (pct > 85) alignment = 'right';

        return {
            ...m,
            leftPct: pct,
            alignment,
            isFlip: m.title.toLowerCase().includes('flip') || (m.day === 1 && m.phase === 'FLOWER')
        };
    });
    
    return markers;
  });

  // Next event relative to NOW
  nextEvent = computed(() => {
      const day = this.totalDaysAlive(); 
      const strain = this.currentStrain();
      if(!strain || !strain.milestones) return null;
      const vegDuration = strain.vegDays || 14;

      // Calculate remaining days for each milestone
      const upcoming = strain.milestones.map(m => {
          let absoluteMilestoneDay = 0;
          if (m.phase === 'VEG') absoluteMilestoneDay = m.day;
          else absoluteMilestoneDay = vegDuration + m.day;

          const daysRemaining = absoluteMilestoneDay - day;
          
          return { ...m, daysRemaining };
      }).filter(m => m.daysRemaining > 0).sort((a,b) => a.daysRemaining - b.daysRemaining);

      return upcoming.length > 0 ? upcoming[0] : null;
  });
}
