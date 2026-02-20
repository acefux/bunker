
import { Component, ElementRef, input, effect, ViewChild } from '@angular/core';

declare var d3: any;

@Component({
  selector: 'app-phase-chart',
  standalone: true,
  template: `
    <div class="w-full h-full rounded-lg bg-gray-900 p-2 border border-gray-700">
      <div #chartContainer class="w-full h-40"></div>
    </div>
  `
})
export class PhaseChartComponent {
  data = input.required<{ time: number; vwc: number; phase: number; valve: number }[]>();
  @ViewChild('chartContainer') private chartContainer!: ElementRef;

  constructor() {
    effect(() => {
      if (this.data().length && this.chartContainer) {
        this.drawChart();
      }
    });
  }

  private drawChart() {
    const element = this.chartContainer.nativeElement;
    d3.select(element).selectAll('*').remove();

    const margin = { top: 10, right: 10, bottom: 20, left: 30 };
    const width = element.clientWidth - margin.left - margin.right;
    const height = element.clientHeight - margin.top - margin.bottom;

    const svg = d3.select(element)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const data = this.data();

    // Scales
    const x = d3.scaleLinear()
      .domain(d3.extent(data, (d: any) => d.time))
      .range([0, width]);

    const yVwc = d3.scaleLinear()
      .domain([0, 100])
      .range([height, 0]);

    // Area for Phase (Background)
    const areaPhase = d3.area()
      .x((d: any) => x(d.time))
      .y0(height)
      .y1((d: any) => {
         // Map phase 1,2,3 to visual height blocks for context
         if(d.phase === 1) return height * 0.8; // P1 low
         if(d.phase === 2) return height * 0.5; // P2 med
         if(d.phase === 3) return height * 0.2; // P3 high (dryback zone)
         return height;
      })
      .curve(d3.curveStepAfter);

    // Line for VWC
    const lineVwc = d3.line()
      .x((d: any) => x(d.time))
      .y((d: any) => yVwc(d.vwc))
      .curve(d3.curveMonotoneX);

    // Add Phase Background
    svg.append('path')
      .datum(data)
      .attr('fill', '#1f2937') // base
      .attr('d', areaPhase)
      .attr('opacity', 0.3);

    // Add VWC Line
    svg.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', 2)
      .attr('d', lineVwc);

    // Add Valve Activations (Spikes/Points)
    svg.selectAll('.valve-point')
      .data(data.filter((d: any) => d.valve === 1))
      .enter()
      .append('circle')
      .attr('cx', (d: any) => x(d.time))
      .attr('cy', (d: any) => yVwc(d.vwc))
      .attr('r', 2)
      .attr('fill', '#10b981'); // Emerald green for valve active

    // Axes
    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat((d: number) => `${Math.floor(d/60)}h`))
      .attr('color', '#6b7280');

    svg.append('g')
      .call(d3.axisLeft(yVwc).ticks(3))
      .attr('color', '#6b7280');
  }
}
