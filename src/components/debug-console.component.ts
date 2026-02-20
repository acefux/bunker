
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LogService } from '../services/log.service';
import { LogLevel } from '../models';

@Component({
  selector: 'app-debug-console',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="fixed bottom-0 left-0 right-0 z-[200] font-mono-ind text-xs pointer-events-none">
       <!-- Toggle Button -->
       <button (click)="isOpen.set(!isOpen())" class="pointer-events-auto absolute bottom-full right-4 bg-zinc-800 text-zinc-300 px-4 py-1 rounded-t-md border-t border-l border-r border-zinc-700 flex gap-2 items-center">
          <span>DEBUG CONSOLE</span>
          <span class="text-[9px] bg-zinc-900 px-1 rounded">{{ logService.logs().length }}</span>
          <span>{{ isOpen() ? '▼' : '▲' }}</span>
       </button>

       @if (isOpen()) {
         <div class="pointer-events-auto h-64 bg-black/90 backdrop-blur-sm border-t-2 border-zinc-700 overflow-y-scroll p-2 flex flex-col-reverse custom-scroll relative group">
            
            <!-- Quick Actions -->
            <div class="absolute top-2 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <button (click)="logService.logInfo('User initiated test log.')" class="bg-zinc-800 text-[9px] px-2 py-1 rounded border border-zinc-600 hover:bg-zinc-700 text-white">
                    + TEST LOG
                </button>
            </div>

            <div class="space-y-1">
               @if (logService.logs().length === 0) {
                   <div class="text-zinc-600 italic p-4 text-center">No logs recorded yet.</div>
               }
               @for (log of logService.logs(); track $index) {
                  <div [class]="levelColor(log.level) + ' border-b border-zinc-900/50 pb-0.5'">
                      <span class="text-zinc-600 mr-2 font-mono">{{ log.timestamp | date:'HH:mm:ss' }}</span>
                      <span class="font-bold mr-2 text-[10px] w-12 inline-block">[{{ log.level }}]</span>
                      <span class="break-all">{{ log.message }}</span>
                  </div>
               }
            </div>
         </div>
       }
    </div>
  `,
  styles: [`
    .custom-scroll {
      scrollbar-width: thin;
      scrollbar-color: #52525b #18181b;
    }
  `]
})
export class DebugConsoleComponent {
  logService = inject(LogService);
  isOpen = signal<boolean>(false); 

  levelColor(level: LogLevel): string {
    switch (level) {
      case 'INFO':
        return 'text-zinc-400';
      case 'ACTION':
        return 'text-cyan-400';
      case 'WARN':
        return 'text-amber-400';
      case 'CRITICAL':
        return 'text-red-500 bg-red-900/10 animate-pulse font-bold';
      default:
        return 'text-zinc-500';
    }
  }
}