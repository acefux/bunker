
import { Component, ElementRef, input, effect, ViewChild, AfterViewInit, OnDestroy, untracked, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

declare var d3: any;

@Component({
  selector: 'app-history-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="w-full h-full flex flex-col relative group">
      <!-- Legend / Header -->
      <div class="flex justify-between items-center px-1 mb-1 shrink-0">
         <span class="text-[9px] text-zinc-500 font-mono-ind font-bold tracking-wider">{{ type() === 'irrigation' ? 'SUBSTRATE VWC & P-EVENTS' : 'CLIMATE (TEMP/RH/VPD/CO2)' }}</span>
         <div class="flex gap-2">
            @if(type() === 'irrigation') {
                <span class="flex items-center gap-1 text-[9px] text-zinc-600"><span class="w-1.5 h-1.5 rounded-full bg-cyan-400"></span> VWC</span>
                <span class="flex items-center gap-1 text-[9px] text-zinc-600"><span class="w-1.5 h-1.5 rounded-full bg-fuchsia-500"></span> EC</span>
                <span class="flex items-center gap-1 text-[9px] text-zinc-600"><span class="w-1.5 h-1.5 rounded-full bg-zinc-600"></span> NIGHT</span>
                <span class="flex items-center gap-1 text-[9px] text-zinc-600"><span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span> P0</span>
                <span class="flex items-center gap-1 text-[9px] text-zinc-600"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> P1</span>
                <span class="flex items-center gap-1 text-[9px] text-zinc-600"><span class="w-1.5 h-1.5 rounded-full bg-cyan-500"></span> P2</span>
                <span class="flex items-center gap-1 text-[9px] text-zinc-600"><span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span> P3</span>
            } @else {
                <span class="flex items-center gap-1 text-[9px] text-zinc-600"><span class="w-1.5 h-1.5 rounded-full bg-blue-500"></span> TEMP</span>
                <span class="flex items-center gap-1 text-[9px] text-zinc-600"><span class="w-1.5 h-1.5 rounded-full bg-violet-500"></span> RH</span>
                <span class="flex items-center gap-1 text-[9px] text-zinc-600"><span class="w-1.5 h-1.5 rounded-full bg-cyan-300"></span> VPD</span>
                <span class="flex items-center gap-1 text-[9px] text-zinc-600"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> CO2</span>
            }
         </div>
      </div>

      <!-- Chart Container -->
      <div #chartContainer class="flex-grow w-full min-h-0 bg-zinc-900/30 rounded border border-zinc-800 relative overflow-hidden">
          @if (!hasData()) {
              <div class="absolute inset-0 flex items-center justify-center text-zinc-700 text-xs font-mono-ind">
                  WAITING FOR DATA...
              </div>
          }
      </div>
    </div>
  `
})
export class HistoryChartComponent implements AfterViewInit, OnDestroy {
  data = input.required<{ time: number; vwc: number; temp: number; rh: number; vpd: number; ec: number; co2: number; phase: number; valve: number }[]>();
  type = input<'irrigation' | 'climate'>('irrigation');
  
  @ViewChild('chartContainer') private chartContainer!: ElementRef;
  private resizeObserver: ResizeObserver | undefined;
  
  hasData = computed(() => this.data() && this.data().length > 0);

  constructor() {
    effect(() => {
      // Subscribe to data changes
      const d = this.data();
      untracked(() => {
         if (d.length > 0) this.drawChart();
      });
    });
  }

  ngAfterViewInit() {
    if (typeof ResizeObserver !== 'undefined' && this.chartContainer) {
        this.resizeObserver = new ResizeObserver(() => {
             requestAnimationFrame(() => this.drawChart());
        });
        this.resizeObserver.observe(this.chartContainer.nativeElement);
    }
    // Initial draw attempt
    setTimeout(() => this.drawChart(), 100);
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect();
  }

  private drawChart() {
    if (typeof d3 === 'undefined') {
        console.warn('D3 not loaded yet');
        return;
    }
    if (!this.chartContainer) return;
    
    const element = this.chartContainer.nativeElement;
    const data = this.data();

    if (!data || data.length === 0) return;
    if (element.clientWidth === 0 || element.clientHeight === 0) return;

    try {
        // Clear previous
        d3.select(element).selectAll('*').remove();

        // Margins: Increased Right margin for triple axis support in climate mode
        const margin = { 
            top: 10, 
            right: this.type() === 'climate' ? 60 : 30, 
            bottom: 20, 
            left: 35 
        };
        const width = element.clientWidth - margin.left - margin.right;
        const height = element.clientHeight - margin.top - margin.bottom;

        const svg = d3.select(element)
            .append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom)
            .append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        // Common X Scale
        const x = d3.scaleLinear()
            .domain([0, data.length - 1])
            .range([0, width]);

        // Helper: Format Time (mins -> HH:MM)
        const formatTime = (d: number) => {
             const point = data[Math.floor(d)];
             if (!point) return '';
             const m = point.time;
             const hh = Math.floor(m / 60);
             const mm = Math.floor(m % 60);
             return `${hh.toString().padStart(2,'0')}:${mm.toString().padStart(2,'0')}`;
        };

        const xAxis = d3.axisBottom(x)
            .ticks(5)
            .tickFormat((i: any) => formatTime(i))
            .tickSize(height)
            .tickPadding(8);

        // Draw Grid Lines
        const gX = svg.append('g').attr('class', 'grid-x').call(xAxis);
        gX.selectAll('line').attr('stroke', '#27272a').attr('stroke-dasharray', '2,2');
        gX.select('.domain').remove();
        gX.selectAll('text').attr('fill', '#71717a').style('font-family', 'monospace').style('font-size', '9px');

        // --- DEFINE GRADIENTS ---
        const defs = svg.append("defs");
        
        // VWC Gradient
        const gradVwc = defs.append("linearGradient").attr("id", "vwc-gradient").attr("x1", "0").attr("y1", "0").attr("x2", "0").attr("y2", "1");
        gradVwc.append("stop").attr("offset", "0%").attr("stop-color", "#22d3ee").attr("stop-opacity", 0.4);
        gradVwc.append("stop").attr("offset", "100%").attr("stop-color", "#22d3ee").attr("stop-opacity", 0);

        // Temp Gradient
        const gradTemp = defs.append("linearGradient").attr("id", "temp-gradient").attr("x1", "0").attr("y1", "0").attr("x2", "0").attr("y2", "1");
        gradTemp.append("stop").attr("offset", "0%").attr("stop-color", "#3b82f6").attr("stop-opacity", 0.3);
        gradTemp.append("stop").attr("offset", "100%").attr("stop-color", "#3b82f6").attr("stop-opacity", 0);

        // RH Gradient
        const gradRh = defs.append("linearGradient").attr("id", "rh-gradient").attr("x1", "0").attr("y1", "0").attr("x2", "0").attr("y2", "1");
        gradRh.append("stop").attr("offset", "0%").attr("stop-color", "#8b5cf6").attr("stop-opacity", 0.3);
        gradRh.append("stop").attr("offset", "100%").attr("stop-color", "#8b5cf6").attr("stop-opacity", 0);

        // VPD Gradient
        const gradVpd = defs.append("linearGradient").attr("id", "vpd-gradient").attr("x1", "0").attr("y1", "0").attr("x2", "0").attr("y2", "1");
        gradVpd.append("stop").attr("offset", "0%").attr("stop-color", "#67e8f9").attr("stop-opacity", 0.4);
        gradVpd.append("stop").attr("offset", "100%").attr("stop-color", "#67e8f9").attr("stop-opacity", 0);
        
        // CO2 Gradient
        const gradCo2 = defs.append("linearGradient").attr("id", "co2-gradient").attr("x1", "0").attr("y1", "0").attr("x2", "0").attr("y2", "1");
        gradCo2.append("stop").attr("offset", "0%").attr("stop-color", "#10b981").attr("stop-opacity", 0.2);
        gradCo2.append("stop").attr("offset", "100%").attr("stop-color", "#10b981").attr("stop-opacity", 0);


        if (this.type() === 'irrigation') {
             // --- IRRIGATION LOGIC ---
            const vwcExtent = d3.extent(data, (d: any) => d.vwc);
            const padding = (vwcExtent[1] - vwcExtent[0]) * 0.1 || 5;
            const yMin = Math.max(0, vwcExtent[0] - padding);
            const yMax = Math.min(100, vwcExtent[1] + padding);
            
            const y = d3.scaleLinear().domain([yMin, yMax]).nice().range([height, 0]);

            // EC Scale (Right Axis)
            const ecExtent = d3.extent(data, (d: any) => d.ec);
            const ecPadding = (ecExtent[1] - ecExtent[0]) * 0.2 || 0.5;
            const yEc = d3.scaleLinear().domain([Math.max(0, ecExtent[0] - ecPadding), ecExtent[1] + ecPadding]).nice().range([height, 0]);

            // Draw Target Zone (40-45%)
            const targetY1 = y(40);
            const targetY2 = y(45);
            
            svg.append("rect")
               .attr("x", 0)
               .attr("y", targetY2)
               .attr("width", width)
               .attr("height", Math.abs(targetY1 - targetY2))
               .attr("fill", "url(#vwc-gradient)") // Reuse gradient for now or make a new one
               .attr("fill-opacity", 0.1)
               .attr("stroke", "#22d3ee")
               .attr("stroke-width", 1)
               .attr("stroke-dasharray", "4,4")
               .attr("class", "target-zone animate-pulse");

            // VWC Area
            const area = d3.area()
                .x((d: any, i: number) => x(i))
                .y0(height)
                .y1((d: any) => y(d.vwc))
                .curve(d3.curveMonotoneX);
            
            svg.append("path").datum(data).attr("fill", "url(#vwc-gradient)").attr("d", area);

            // VWC Line
            const line = d3.line()
                .x((d: any, i: number) => x(i))
                .y((d: any) => y(d.vwc))
                .curve(d3.curveMonotoneX);
            
            svg.append("path").datum(data).attr("fill", "none").attr("stroke", "#22d3ee").attr("stroke-width", 2).attr("d", line);

            // EC Line (Purple)
            const lineEc = d3.line()
                .x((d: any, i: number) => x(i))
                .y((d: any) => yEc(d.ec))
                .curve(d3.curveMonotoneX);

            svg.append("path").datum(data)
                .attr("fill", "none")
                .attr("stroke", "#d946ef") // Fuchsia 500
                .attr("stroke-width", 2)
                .attr("stroke-dasharray", "2,2") // Dashed to distinguish
                .attr("d", lineEc);

            // Phase Colors & Bars
            const getPhaseColor = (p: number) => {
                switch(p) {
                    case 0: return '#52525b'; // Zinc 600 (Night)
                    case 1: return '#fbbf24'; // Amber 400 (P0)
                    case 2: return '#10b981'; // Emerald 500 (P1)
                    case 3: return '#06b6d4'; // Cyan 500 (P2)
                    case 4: return '#f43f5e'; // Rose 500 (P3)
                    default: return '#52525b';
                }
            };

            // Draw Phase Track (Bottom Bar) - FIX: Use data binding on RECT elements correctly
            const trackHeight = 6;
            const barWidth = Math.max(1, (width / data.length)) + 0.5;

            // FIX: Explicitly append rectangles for each data point
            svg.selectAll('.phase-bar')
                .data(data)
                .enter()
                .append('rect')
                .attr('class', 'phase-bar')
                .attr('x', (d: any, i: number) => x(i))
                .attr('y', height - trackHeight)
                .attr('width', barWidth)
                .attr('height', trackHeight)
                .attr('fill', (d: any) => getPhaseColor(d.phase))
                .attr('opacity', 0.8)
                .attr('shape-rendering', 'crispEdges'); // Sharp lines for adjacent blocks

            // Valve Marks (Overlay)
            svg.selectAll('.valve-mark')
                .data(data.filter((d: any) => d.valve === 1))
                .enter().append('rect')
                .attr('x', (d: any) => x(data.indexOf(d)))
                .attr('y', 0).attr('width', 3).attr('height', height - trackHeight)
                .attr('fill', (d: any) => getPhaseColor(d.phase)).attr('opacity', 0.6);

            const yAxis = d3.axisLeft(y).ticks(4);
            svg.append('g').call(yAxis).attr('color', '#52525b').style('font-family', 'monospace').style('font-size', '9px').select('.domain').remove();

            // EC Axis (Right)
            const yAxisEc = d3.axisRight(yEc).ticks(4);
            svg.append('g')
               .attr('transform', `translate(${width}, 0)`)
               .call(yAxisEc)
               .attr('color', '#d946ef')
               .style('font-family', 'monospace')
               .style('font-size', '9px')
               .select('.domain').remove();

        } else {
            // --- CLIMATE WAVE GRAPH (Tri-Axis) ---
            
            // 1. Scales - PARAMETRIC AUTO-SCALING WITH PADDING
            
            // TEMP (Left Axis - Blue)
            const tExtent = d3.extent(data, (d: any) => d.temp);
            const padT = (tExtent[1] - tExtent[0]) * 0.2 || 5;
            const yTemp = d3.scaleLinear().domain([tExtent[0] - padT, tExtent[1] + padT]).nice().range([height, 0]);

            // VPD (Right Axis Inner - Cyan)
            const vExtent = d3.extent(data, (d: any) => d.vpd);
            const padV = (vExtent[1] - vExtent[0]) * 0.2 || 0.2;
            const yVpd = d3.scaleLinear().domain([Math.max(0, vExtent[0] - padV), vExtent[1] + padV]).nice().range([height, 0]);

            // CO2 (Right Axis Outer - Emerald)
            const cExtent = d3.extent(data, (d: any) => d.co2);
            const padC = (cExtent[1] - cExtent[0]) * 0.2 || 100;
            const yCo2 = d3.scaleLinear().domain([Math.max(0, cExtent[0] - padC), cExtent[1] + padC]).nice().range([height, 0]);

            // RH (Hidden Scale - Violet) - Scaled to fill height comfortably for visual trend
            const rExtent = d3.extent(data, (d: any) => d.rh);
            const padR = (rExtent[1] - rExtent[0]) * 0.2 || 10;
            const yRh = d3.scaleLinear().domain([rExtent[0] - padR, rExtent[1] + padR]).nice().range([height, 0]);


            // 2. Draw Areas (Order matters: Back to Front)
            const makeArea = (scale: any, key: string) => d3.area().x((d: any, i: number) => x(i)).y0(height).y1((d: any) => scale(d[key])).curve(d3.curveMonotoneX);
            const makeLine = (scale: any, key: string) => d3.line().x((d: any, i: number) => x(i)).y((d: any) => scale(d[key])).curve(d3.curveMonotoneX);

            // Layer 1: CO2 (Back)
            svg.append("path").datum(data).attr("fill", "url(#co2-gradient)").attr("d", makeArea(yCo2, 'co2'));
            svg.append("path").datum(data).attr("fill", "none").attr("stroke", "#10b981").attr("stroke-width", 1.5).attr("opacity", 0.6).attr("d", makeLine(yCo2, 'co2'));

            // Layer 2: RH (Middle)
            svg.append("path").datum(data).attr("fill", "url(#rh-gradient)").attr("d", makeArea(yRh, 'rh'));
            svg.append("path").datum(data).attr("fill", "none").attr("stroke", "#8b5cf6").attr("stroke-width", 1.5).attr("opacity", 0.7).attr("d", makeLine(yRh, 'rh'));

            // Layer 3: Temp (Front-ish)
            svg.append("path").datum(data).attr("fill", "url(#temp-gradient)").attr("d", makeArea(yTemp, 'temp'));
            svg.append("path").datum(data).attr("fill", "none").attr("stroke", "#3b82f6").attr("stroke-width", 2).attr("d", makeLine(yTemp, 'temp'));

            // Layer 4: VPD (Front / Critical)
            svg.append("path").datum(data).attr("fill", "url(#vpd-gradient)").attr("d", makeArea(yVpd, 'vpd'));
            svg.append("path").datum(data).attr("fill", "none").attr("stroke", "#67e8f9").attr("stroke-width", 2).attr("stroke-dasharray", "4,2").attr("d", makeLine(yVpd, 'vpd'));


            // 3. Draw Axes
            
            // Left: Temp
            svg.append('g').call(d3.axisLeft(yTemp).ticks(4))
               .attr('color', '#3b82f6')
               .style('font-family', 'monospace').style('font-size', '9px').select('.domain').remove();

            // Right Inner: VPD
            svg.append('g').attr('transform', `translate(${width}, 0)`).call(d3.axisRight(yVpd).ticks(4))
               .attr('color', '#22d3ee')
               .style('font-family', 'monospace').style('font-size', '9px').select('.domain').remove();

            // Right Outer: CO2
             svg.append('g').attr('transform', `translate(${width + 30}, 0)`).call(d3.axisRight(yCo2).ticks(3))
               .attr('color', '#10b981')
               .style('font-family', 'monospace').style('font-size', '9px').select('.domain').remove();
        }

    } catch (e) {
        console.error("Chart render fail:", e);
    }
  }
}
