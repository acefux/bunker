
import { Component, input, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RoomState, AiPersona, ConsultationResult, AiAction } from '../models';
import { FacilityService } from '../services/facility.service';
import { AiConsultantService } from '../services/ai-consultant.service';

@Component({
  selector: 'app-consultant',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bg-gray-800 rounded-xl border border-gray-700 p-4 shadow-lg mt-4">
      <div class="flex flex-col md:flex-row items-start md:items-center justify-between mb-3 gap-3">
        
        <div class="flex items-center gap-3">
            <h3 class="text-lg font-bold flex items-center gap-2 text-indigo-400">
                <span class="text-xl">🤖</span> AI AGRONOMIST REPORT
            </h3>
            
            <!-- Persona Switcher -->
            <div class="flex bg-zinc-900 rounded-lg p-1 border border-zinc-700">
                <button (click)="setPersona('PROFESSIONAL')" [class]="personaClass('PROFESSIONAL')">PRO</button>
                <button (click)="setPersona('FUNNY')" [class]="personaClass('FUNNY')">FUNNY</button>
                <button (click)="setPersona('DRILL_SERGEANT')" [class]="personaClass('DRILL_SERGEANT')">SERGEANT</button>
            </div>
        </div>

        <div class="flex gap-2">
            <button 
                (click)="analyze(roomA())" 
                [disabled]="loading() || aiService.aiStatus() === 'OFFLINE'"
                class="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-indigo-400/30">
                Analyze Room A
            </button>
            <button 
                (click)="analyze(roomB())" 
                [disabled]="loading() || aiService.aiStatus() === 'OFFLINE'"
                class="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-indigo-400/30">
                Analyze Room B
            </button>
        </div>
      </div>

      @if (loading()) {
        <div class="p-8 flex flex-col items-center justify-center text-gray-400 animate-pulse gap-2">
           <span class="material-icons animate-spin text-2xl">sync</span>
           <span class="text-sm">Analyzing telemetry against Athena Ag Pro Line standards...</span>
        </div>
      }

      @if (result(); as res) {
        <div class="flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <!-- Status Header -->
            <div [class]="statusClass(res.status) + ' p-3 rounded-lg border flex items-center gap-3'">
                <span class="text-2xl">{{ statusIcon(res.status) }}</span>
                <div>
                    <span class="text-xs font-bold uppercase opacity-80 block">Facility Status</span>
                    <span class="font-bold tracking-wide">{{ res.status }}</span>
                </div>
            </div>

            <!-- Analysis Body -->
            <div class="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                <p class="text-sm text-gray-300 italic mb-4">"{{ res.analysis }}"</p>
                
                <h4 class="text-xs font-bold text-indigo-400 uppercase mb-2">Recommendations</h4>
                <ul class="space-y-2">
                    @for (rec of res.recommendations; track $index) {
                        <li class="flex items-start gap-2 text-sm text-gray-300">
                            <span class="text-indigo-500 mt-1">➤</span>
                            <span>{{ rec }}</span>
                        </li>
                    }
                </ul>

                <!-- Human-in-the-Loop Action -->
                @if (res.suggestedAction) {
                    <div class="mt-4 p-3 bg-indigo-900/40 border border-indigo-500/50 rounded-lg">
                        <h4 class="text-xs font-bold text-indigo-300 uppercase">AI Recommendation</h4>
                        <p class="text-sm my-2 text-indigo-100">{{ res.suggestedAction.description }}</p>
                        <div class="flex gap-2 mt-3">
                            <button (click)="applyAction(res.suggestedAction)" class="px-4 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded">APPLY FIX</button>
                            <button (click)="ignoreAction()" class="px-4 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs font-bold rounded">IGNORE</button>
                        </div>
                    </div>
                }
            </div>
            
             <div class="mt-1 text-[10px] text-gray-500 text-right">
               Model: {{ aiService.activeProvider() === 'OLLAMA' ? 'ollama/llama3' : 'gemini-2.5-flash' }} | Protocol: Athena Ag Pro Line
            </div>
        </div>
      }
    </div>
  `
})
export class ConsultantComponent {
  roomA = input.required<RoomState>();
  roomB = input.required<RoomState>();
  
  aiService = inject(AiConsultantService);
  private facility = inject(FacilityService);
  
  loading = signal(false);
  result = signal<ConsultationResult | null>(null);

  setPersona(p: AiPersona) {
    this.facility.setPersona(p);
  }

  personaClass(p: AiPersona) {
      const active = this.facility.selectedPersona() === p;
      return `px-2 py-1 text-[10px] rounded font-bold transition-all ${active ? 'bg-indigo-600 text-white' : 'text-zinc-500 hover:text-zinc-300'}`;
  }

  async analyze(room: RoomState) {
    this.loading.set(true);
    this.result.set(null);

    try {
        const data = await this.aiService.analyzeRoom(room, this.facility.timeOfDayMin(), this.facility.selectedPersona());
        this.result.set(data);
        // Also update ticker
        this.facility.updateNewsFeed(`${data.status} ALERT: ${data.headline}`);
    } catch (e) {
        console.error(e);
        const errorResult = await this.aiService.getFallbackError();
        this.result.set(errorResult);
        this.facility.updateNewsFeed(`${errorResult.status} ALERT: ${errorResult.headline}`);

    } finally {
        this.loading.set(false);
    }
  }

  applyAction(action: AiAction) {
    this.facility.applyAiAction(action);
    this.ignoreAction(); // Clear the suggestion after applying
  }

  ignoreAction() {
    this.result.update(res => {
        if (!res) return null;
        return { ...res, suggestedAction: null };
    });
  }

  statusClass(status: string) {
    switch (status) {
        case 'OPTIMAL': return 'bg-emerald-900/30 border-emerald-500/50 text-emerald-100';
        case 'WARNING': return 'bg-amber-900/30 border-amber-500/50 text-amber-100';
        case 'CRITICAL': return 'bg-red-900/30 border-red-500/50 text-red-100';
        default: return 'bg-gray-800 border-gray-700';
    }
  }

  statusIcon(status: string) {
      switch (status) {
          case 'OPTIMAL': return 'check_circle';
          case 'WARNING': return 'warning';
          case 'CRITICAL': return 'error';
          default: return 'info';
      }
  }
}
