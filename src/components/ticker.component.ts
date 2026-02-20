import { Component, inject } from '@angular/core';
import { FacilityService } from '../services/facility.service';

@Component({
  selector: 'app-ticker',
  standalone: true,
  template: `
    <div class="bg-black border-b-2 border-emerald-600 overflow-hidden relative h-10 flex items-center shadow-lg w-full">
      <div class="ticker-wrap w-full">
        <div class="ticker-move text-emerald-400 font-mono-ind text-sm font-bold uppercase tracking-wider whitespace-nowrap drop-shadow-md">
           <span class="mr-24">{{ facility.latestNews() }}</span>
           <span class="mr-24">{{ facility.latestNews() }}</span>
           <span class="mr-24">{{ facility.latestNews() }}</span>
           <span class="mr-24">{{ facility.latestNews() }}</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .ticker-wrap {
      overflow: hidden;
      white-space: nowrap;
    }
    .ticker-move {
      display: inline-block;
      animation: ticker 25s linear infinite;
    }
    @keyframes ticker {
      0% { transform: translate3d(100%, 0, 0); }
      100% { transform: translate3d(-100%, 0, 0); }
    }
  `]
})
export class TickerComponent {
  facility = inject(FacilityService);
}