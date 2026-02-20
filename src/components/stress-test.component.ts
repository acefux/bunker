
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FacilityService } from '../services/facility.service';

@Component({
  selector: 'app-stress-test',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bg-zinc-900 rounded-xl border border-zinc-700 p-4 shadow-lg mt-4">
      <div class="flex items-center gap-3 mb-3">
        <span class="material-icons text-red-400 text-xl">bug_report</span>
        <h3 class="text-lg font-bold text-red-400">WARP-SPEED STRESS TEST</h3>
      </div>

      <p class="text-xs text-zinc-400 mb-4">
        Run a full 65-day flower cycle simulation at maximum CPU speed. The engine will inject random faults to test system resilience and safety protocols.
      </p>

      @if (!isTesting()) {
        <button (click)="runTest()" class="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded border border-red-400/50">
          START FULL DEBUG CYCLE
        </button>
      } @else {
        <div class="w-full bg-zinc-800 text-zinc-300 font-bold py-3 rounded text-center animate-pulse">
          TEST RUNNING...
        </div>
      }

      @if (facility.stressTestReport(); as report) {
        <div class="mt-4 p-3 bg-zinc-950 border border-zinc-700 rounded animate-in fade-in duration-300">
            <h4 class="text-xs font-bold text-emerald-500 uppercase mb-2">Crash Report: Test Complete</h4>
            <pre class="text-xs font-mono-ind text-zinc-300 bg-black p-2 rounded custom-scroll overflow-x-auto">{{ reportJson() }}</pre>
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
export class StressTestComponent {
  facility = inject(FacilityService);
  isTesting = signal(false);
  reportJson = signal('');

  runTest() {
    this.isTesting.set(true);
    this.facility.stressTestReport.set(null);
    this.facility.runStressTest().then(() => {
      this.isTesting.set(false);
      const report = this.facility.stressTestReport();
      if(report) {
          this.reportJson.set(JSON.stringify(report, null, 2));
      }
    });
  }
}
