
import { Injectable, signal, computed, inject, effect, Injector } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AiConsultantService } from './ai-consultant.service';
import { StrainService } from './strain.service';
import { LogService } from './log.service';
import { ChaosService } from './chaos.service';
import { SoundService } from './sound.service';
import { GamificationService } from './gamification.service';
import { RoomState, RoomConfig, AiAction, SensorData, AiPersona, StressTestReport, StrainProfile, HvacState } from '../models';

import { AppModeService } from './app-mode.service';

// --- IMMUTABLE HARDWARE MAP ---
const HA_ENTITY_MAP: Record<string, Record<string, string>> = {
  'A': {
    'dayTempHigh': 'number.b1_daytime_high_cool_to',
    'dayTempLow': 'number.b1_daytime_low_heat_to',
    'nightTempHigh': 'number.b1_nighttime_high_cool_to',
    'nightTempLow': 'number.b1_nighttime_low_heat_to',
    'p1Shots': 'number.room_a_p1_shots',
    'shotDuration': 'number.room_a_shot_duration'
  },
  'B': {
    'dayTempHigh': 'number.b2_daytime_high_cool_to',
    'dayTempLow': 'number.b2_daytime_low_heat_to',
    'nightTempHigh': 'number.b2_nighttime_high_cool_to',
    'nightTempLow': 'number.b2_nighttime_low_heat_to',
    'p1Shots': 'number.room_b_p1_shots',
    'shotDuration': 'number.room_b_shot_duration'
  }
};

type SpoofMetrics = { vwc?: number, vpd?: number, temp?: number, rh?: number, co2?: number, canopyTemp?: number, reservoirLevel?: number };

@Injectable({
  providedIn: 'root'
})
export class FacilityService {
  private http = inject(HttpClient);
  private aiService = inject(AiConsultantService);
  private strainService = inject(StrainService);
  private logService = inject(LogService);
  private chaosService = inject(ChaosService);
  private appMode = inject(AppModeService);
  private soundService = inject(SoundService);
  private injector = inject(Injector);
  private worker?: Worker;

  private get gamificationService() {
      return this.injector.get(GamificationService);
  }

  // Simulation Control
  simSpeed = signal<number>(1); 
  simPaused = signal<boolean>(false);
  simMode = signal<'WORKER' | 'FALLBACK'>('WORKER');
  simDate = signal<number>(Date.now()); // New: Global Clock
  
  // Global Simulation Config (Plant Count, Ambient, etc)
  simGlobalConfig = signal<any>({
      plantCount: 100,
      growthStageDay: 21,
      strainMultiplier: 1.0,
      ambientProfile: 'CASTLEGAR_SUMMER',
      tickSpeedMs: 1000
  });
  reservoirLevel = signal<number>(85);

  workerResponding = signal<boolean>(false);
  
  timeOfDayMin = signal<number>(6 * 60); 
  bypassActive = signal<boolean>(false);
  mainPumpActive = signal<boolean>(false);
  
  selectedPersona = signal<AiPersona>('PROFESSIONAL');
  latestNews = signal<string>("SYSTEM BOOTING...");
  stressTestReport = signal<StressTestReport | null>(null);
  private stressTestCompletion: ((value: void | PromiseLike<void>) => void) | null = null;

  // Manual Overrides (Spoofing) - Dictionary for multi-room support
  sensorOverrides = signal<Record<string, SpoofMetrics>>({});

  roomA = signal<RoomState>(this.createInitialRoom('A', 'FLOWER ROOM A', 10, 'FLOWER'));
  roomB = signal<RoomState>(this.createInitialRoom('B', 'FLOWER ROOM B', 10, 'FLOWER'));
  roomVeg = signal<RoomState>(this.createInitialRoom('V', 'VEG / NURSERY', 4, 'VEG'));

  // UPDATED: Pump Interlock Logic for Single-Zone Testing
  isPumpInterlocked = computed(() => {
    // If Bypass Mode is active (Recirculation), we ALLOW pump operation (disable interlock)
    if (this.bypassActive()) return false;
    
    // Otherwise, require at least one valve to be OPEN to prevent Deadheading
    return !this.roomA().valveOpen && !this.roomB().valveOpen;
  });

  private lastWorkerHeartbeat = 0;
  private fallbackInterval: any;
  private fallbackTimeAccumulator = 0;

  constructor() {
    this.initWorker();

    setInterval(() => {
        const timeSinceLastHeartbeat = Date.now() - this.lastWorkerHeartbeat;
        this.workerResponding.set(timeSinceLastHeartbeat < 500 && this.simMode() === 'WORKER' && !this.simPaused());

        if (timeSinceLastHeartbeat > 3000 && this.simMode() === 'WORKER') {
            if (this.worker) {
                console.warn("Worker heartbeat lost. Switching to Main Thread Fallback.");
                this.logService.logCritical("SIMULATION WORKER UNRESPONSIVE. ENGAGING FALLBACK.");
            }
            this.startFallbackSimulation();
        }
    }, 200);

    effect(() => {
      const chaosState = {
        enabled: this.chaosService.enabled(),
        sensorDrift: this.chaosService.sensorDrift(),
        sensorFailure: this.chaosService.sensorFailure(),
        valveStuckOpen: this.chaosService.valveStuckOpen(),
        networkLag: this.chaosService.networkLag(),
        heatWaveActive: this.chaosService.heatWaveActive(),
        floodActive: this.chaosService.floodActive(),
        blackoutActive: this.chaosService.blackoutActive(),
      };
      
      if (this.simMode() === 'WORKER') {
        this.worker?.postMessage({ type: 'SET_CHAOS', payload: chaosState });
      }
    });

    this.startAutoAnalysis();
  }

  private initWorker() {
    if (typeof Worker !== 'undefined') {
      try {
        let workerUrl: URL;
        try {
            if (typeof import.meta !== 'undefined' && import.meta.url) {
                workerUrl = new URL('../simulation.worker.ts', import.meta.url);
            } else {
                throw new Error('import.meta.url is undefined');
            }
        } catch (e) {
            console.warn('Worker init: Standard resolution failed, attempting root-relative path.');
            const baseUrl = typeof document !== 'undefined' ? document.baseURI : (self.location?.origin || '');
            workerUrl = new URL('src/simulation.worker.ts', baseUrl);
        }

        this.worker = new Worker(workerUrl, { type: 'module' });

        this.worker.onmessage = ({ data }) => {
          this.lastWorkerHeartbeat = Date.now();
          
          if(this.simMode() === 'FALLBACK') {
              this.simMode.set('WORKER'); // Recovered
              this.stopFallbackSimulation();
              this.latestNews.set("WORKER CONNECTION RESTORED.");
          }

          switch(data.type) {
            case 'STATE_UPDATE':
              this.handleStateUpdate(data.payload);
              break;
            case 'LOG':
              this.logService.log(data.payload.level, data.payload.message);
              break;
            case 'NEWS':
              this.updateNewsFeed(data.payload);
              break;
            case 'STRESS_TEST_REPORT':
              this.stressTestReport.set(data.payload);
              this.stressTestCompletion?.();
              this.stressTestCompletion = null;
              break;
          }
        };

        this.worker.onerror = (err) => {
          console.error("Worker Error Event:", err);
          this.startFallbackSimulation();
        };

        const strains = {
          flower: [
            this.strainService.getProfile('ATHENA_OG'),
            this.strainService.getProfile('MAC_1'),
            this.strainService.getProfile('HAZE_XL'),
          ],
          veg: this.strainService.getVegProfile()
        };
        
        this.worker.postMessage({ type: 'INIT', payload: { strains } });
      
      } catch (e) {
        console.error("Worker Init Exception:", e);
        this.logService.logCritical("WORKER INIT FAILED. USING MAIN THREAD FALLBACK.");
        this.startFallbackSimulation();
      }
    } else {
      this.startFallbackSimulation();
    }
  }

  // --- PERSISTENCE ---
  saveState() {
      const state = {
          roomA: this.roomA(),
          roomB: this.roomB(),
          simDate: this.simDate(),
          ranks: this.gamificationService.ranks()
      };
      if (typeof localStorage !== 'undefined') {
          localStorage.setItem('bunker_save_state', JSON.stringify(state));
          this.logService.logAction("GAME STATE SAVED.");
          this.soundService.playAchievement();
      }
  }

  loadState() {
      if (typeof localStorage !== 'undefined') {
          const raw = localStorage.getItem('bunker_save_state');
          if (raw) {
              const state = JSON.parse(raw);
              
              // 1. Update UI Signals immediately
              this.roomA.set(state.roomA);
              this.roomB.set(state.roomB);
              this.simDate.set(state.simDate);
              if (state.ranks) this.gamificationService.ranks.set(state.ranks);

              // 2. Sync Worker (CRITICAL: Prevents worker from overwriting loaded state with old physics state)
              if (this.simMode() === 'WORKER') {
                  this.worker?.postMessage({ 
                      type: 'SET_FULL_STATE', 
                      payload: {
                          roomA: state.roomA,
                          roomB: state.roomB,
                          config: this.simGlobalConfig(), // Or save/load global config too
                          reservoirLevel: state.roomA.reservoirLevel, // Assuming shared or synced
                          virtualTimestamp: state.simDate
                      }
                  });
              }
              
              this.logService.logAction("GAME STATE LOADED.");
              this.soundService.playBootSequence();
          }
      }
  }

  togglePin18(roomId: string) {
      if (this.simMode() === 'WORKER') {
          this.worker?.postMessage({ type: 'TOGGLE_PIN_18', payload: { roomId, state: true } }); // Latch ON
          this.logService.logCritical(`[${roomId}] PIN 18 MANUAL BYPASS ENGAGED.`);
          this.soundService.playValveOpen();
          
          // Check Mission
          this.gamificationService.registerAction('PIN_18_BYPASS', roomId);
      }
  }

  // --- WORKER PROXY METHODS (For SimulationService) ---
  
  overrideHardware(deviceId: string, state: boolean) {
      if (this.simMode() === 'WORKER') {
          this.worker?.postMessage({ type: 'OVERRIDE_HARDWARE', payload: { deviceId, state } });
      }
  }

  setReservoirLevel(level: number) {
      if (this.simMode() === 'WORKER') {
          this.worker?.postMessage({ type: 'SET_RESERVOIR', payload: { level } });
      }
  }

  triggerIrrigation(room: 'A' | 'B', phase: 'P1' | 'P2' | 'P3') {
      if (this.simMode() === 'WORKER') {
          this.worker?.postMessage({ type: 'TRIGGER_IRRIGATION', payload: { room, phase } });
      }
  }

  triggerChaos(type: string, value: boolean) {
      if (this.simMode() === 'WORKER') {
          this.worker?.postMessage({ type: 'SET_CHAOS', payload: { [type]: value } });
      }
  }

  updateGlobalConfig(config: any) {
      if (this.simMode() === 'WORKER') {
          this.worker?.postMessage({ type: 'UPDATE_CONFIG', payload: config });
      }
  }

  // --- SPOOFING / INTERCEPTION ---
  private handleStateUpdate(payload: any) {
      // 1. Update Time (The Multiplexer)
      if (payload.virtualTimestamp) {
          this.simDate.set(payload.virtualTimestamp);
          
          // Derive time of day from sim date
          const date = new Date(payload.virtualTimestamp);
          const minutes = date.getHours() * 60 + date.getMinutes();
          this.timeOfDayMin.set(minutes);
      } else {
          console.warn('FacilityService: No virtualTimestamp in payload', payload);
      }

      // 2. Update Global Config & Reservoir
      if (payload.config) {
          this.simGlobalConfig.set(payload.config);
          // Sync local speed signal
          if (payload.config.tickSpeedMs) {
             // Convert ms to speed multiplier (approx) if needed, or just rely on config
          }
      }
      if (payload.reservoirLevel !== undefined) {
          this.reservoirLevel.set(payload.reservoirLevel);
      }

      // 3. Merge Room Data (Don't Overwrite!)
      this.updateRoomFromWorker(this.roomA, payload.roomA);
      this.updateRoomFromWorker(this.roomB, payload.roomB);
      
      // Veg room is currently fallback-only or static in this version
      // this.roomVeg.set(rV); 
  }

  private updateRoomFromWorker(roomSignal: any, workerData: any) {
      roomSignal.update((current: RoomState) => {
          // Merge worker data (physics) with current data (config, strains, history)
          // Map Worker 'pumpActive' -> App 'valveOpen'
          const valveOpen = workerData.pumpActive || false;
          
          const merged = { 
              ...current, 
              ...workerData,
              valveOpen 
          };
          
          // Apply Overrides
          const overrides = this.sensorOverrides()[current.id];
          const finalState = this.applyOverrideToRoom(merged, overrides);

          // History Generation (Virtual Time Based)
          const lastHistoryTime = current.history.length > 0 ? current.history[current.history.length - 1].time : -1;
          const currentSimTime = this.timeOfDayMin();
          
          // Calculate Phase for Chart Colors
          const phaseStr = this.calculatePhase(finalState.config, currentSimTime);
          finalState.phase = phaseStr; // Update state for UI display too

          // Calculate Day of Cycle (Virtual Time)
          if (finalState.vegStartDate) {
              const diffMs = this.simDate() - finalState.vegStartDate;
              const day = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
              finalState.dayOfCycle = Math.max(1, day);
          } else {
              // Initialize vegStartDate if missing (reverse engineer from config day)
              // This ensures we have an anchor point for the simulation
              const currentDay = finalState.dayOfCycle || 1;
              const startDate = this.simDate() - ((currentDay - 1) * 24 * 60 * 60 * 1000);
              finalState.vegStartDate = startDate;
          }

          // Handle day rollover for history (simple check)
          const timeDiff = Math.abs(currentSimTime - lastHistoryTime);
          
          if (timeDiff >= 5 || current.history.length === 0) {
             const newPoint = {
                 time: currentSimTime,
                 vwc: finalState.vwc,
                 temp: finalState.temp,
                 rh: finalState.rh,
                 vpd: finalState.vpd,
                 ec: finalState.ec || 3.0,
                 co2: finalState.co2,
                 phase: this.mapPhaseToNumber(phaseStr),
                 valve: valveOpen ? 1 : 0
             };
             
             // Append and slice
             const newHistory = [...current.history, newPoint].slice(-288); // Keep last 24h (5min intervals)
             finalState.history = newHistory;
          }

          return finalState;
      });
  }

  private calculatePhase(cfg: RoomConfig, currentMin: number): 'P0' | 'P1' | 'P2' | 'P3' | 'NIGHT' | 'FLOOD' | 'DRAIN' {
      const startM = cfg.lightsOnHour * 60;
      const dayM = cfg.dayLength * 60;
      const rel = (currentMin - startM + 1440) % 1440;
      const isDay = rel < dayM;

      if (!isDay) return 'NIGHT';

      const p0End = cfg.p0Duration;
      const p1End = p0End + cfg.p1Duration;
      const p2End = dayM - cfg.p2Cutoff;

      if (rel < p0End) return 'P0';
      if (rel < p1End) return 'P1';
      if (rel < p2End) return 'P2';
      return 'P3';
  }

  setSensorOverride(roomId: string, metrics: SpoofMetrics | null) {
      // 1. Update the overrides map (Persistent)
      this.sensorOverrides.update(current => {
          if (metrics === null) {
              const newState = { ...current };
              delete newState[roomId];
              return newState;
          } else {
              return { 
                  ...current, 
                  [roomId]: { ...(current[roomId] || {}), ...metrics } 
              };
          }
      });

      // 2. Send Overrides to Worker so Physics Engine can REACT (e.g. Higher Temp = Faster Dryback)
      if (this.simMode() === 'WORKER') {
          this.worker?.postMessage({ 
              type: 'SET_ENV_OVERRIDES', 
              payload: { roomId, overrides: metrics || {} } 
          });
      }

      // 3. Force immediate update so the UI reacts instantly (Responsiveness)
      const currentOverrides = this.sensorOverrides()[roomId];
      if (roomId === 'A') {
          this.roomA.update(r => this.applyOverrideToRoom(r, currentOverrides));
      } else if (roomId === 'B') {
          this.roomB.update(r => this.applyOverrideToRoom(r, currentOverrides));
      }
  }

  private applyOverrideToRoom(room: RoomState, ov?: SpoofMetrics): RoomState {
      if (!ov) return room;
      
      const newVwc = ov.vwc !== undefined ? ov.vwc : room.vwc;
      const newTemp = ov.temp !== undefined ? ov.temp : room.temp;
      const newRh = ov.rh !== undefined ? ov.rh : room.rh;
      const newCo2 = ov.co2 !== undefined ? ov.co2 : room.co2;
      const newCanopy = ov.canopyTemp !== undefined ? ov.canopyTemp : room.canopyTemp;
      const newRes = ov.reservoirLevel !== undefined ? ov.reservoirLevel : room.reservoirLevel;
      
      // Recalculate VPD if environmental factors are overridden
      let newVpd = room.vpd;
      if (ov.temp !== undefined || ov.rh !== undefined) {
          newVpd = this.calculateVPD(newTemp, newRh);
      }
      if (ov.vpd !== undefined) newVpd = ov.vpd;

      // ALSO Update individual sensor array to match aggregate
      let newSensors = room.sensors;
      if (ov.vwc !== undefined || ov.temp !== undefined) {
          newSensors = room.sensors.map(s => ({
              ...s,
              vwc: ov.vwc !== undefined ? ov.vwc : s.vwc,
              temp: ov.temp !== undefined ? ov.temp : s.temp
          }));
      }

      return { 
          ...room, 
          vwc: newVwc, 
          vpd: newVpd, 
          temp: newTemp,
          rh: newRh,
          co2: newCo2,
          canopyTemp: newCanopy,
          reservoirLevel: newRes,
          sensors: newSensors
      };
  }

  // --- FALLBACK SIMULATION (Main Thread) ---
  private startFallbackSimulation() {
      if (this.simMode() === 'FALLBACK') return;
      this.simMode.set('FALLBACK');
      this.latestNews.set("RUNNING IN FALLBACK MODE (MAIN THREAD).");
      
      this.stopFallbackSimulation(); 
      this.fallbackInterval = setInterval(() => {
          if (this.simPaused()) return;
          
          // Calculate time step based on tickSpeedMs
          // Target: 1 Sim Minute per tickSpeedMs
          // Loop runs every 100ms
          // Minutes to add = 100 / tickSpeedMs
          const tickSpeed = this.simGlobalConfig().tickSpeedMs || 1000;
          const minutesToAdd = 100 / tickSpeed;
          
          this.fallbackTimeAccumulator += minutesToAdd;
          
          if (this.fallbackTimeAccumulator >= 1) {
              const wholeMinutes = Math.floor(this.fallbackTimeAccumulator);
              this.fallbackTimeAccumulator -= wholeMinutes;
              this.timeOfDayMin.update(t => (t + wholeMinutes) % 1440);
              this.simDate.update(d => d + (wholeMinutes * 60000));

              this.updateFallbackRoom(this.roomA, wholeMinutes);
              this.updateFallbackRoom(this.roomB, wholeMinutes);
              this.roomVeg.update(r => ({...r, temp: 75 + Math.random()}));
          } else {
             // Jitter for visual liveness if slow
             if (tickSpeed > 500) {
                 this.jitterSensors(this.roomA);
                 this.jitterSensors(this.roomB);
             }
          }
      }, 100); 
  }

  private stopFallbackSimulation() {
      if (this.fallbackInterval) clearInterval(this.fallbackInterval);
  }

  private jitterSensors(roomSignal: any) {
     roomSignal.update((r: RoomState) => {
         const updatedSensors = r.sensors.map(s => ({
             ...s,
             vwc: Math.max(0, Math.min(100, s.vwc + (Math.random() - 0.5) * 0.02))
         }));
         const avg = updatedSensors.reduce((a,b) => a + b.vwc, 0) / updatedSensors.length;
         return { ...r, sensors: updatedSensors, vwc: parseFloat(avg.toFixed(1)) };
     });
  }

  private updateFallbackRoom(roomSignal: any, timeStep: number) {
      roomSignal.update((r: RoomState) => {
          let vwcChange = -0.02 * timeStep; 
          const cfg = r.config;
          const startM = cfg.lightsOnHour * 60;
          const dayM = cfg.dayLength * 60;
          const currentMin = this.timeOfDayMin();
          const rel = (currentMin - startM + 1440) % 1440;
          const isDay = rel < dayM;

          let phase: RoomState['phase'] = 'NIGHT';
          let nextShot = 0;
          let shotsFiredToday = r.shotsFiredToday;
          let shouldIrrigate = false;

          // --- SAFETY: Ultrasonic Reservoir Interlock ---
          // If reservoir is below 5%, prevent all irrigation
          const hasWater = r.reservoirLevel > 5;

          if (!isDay) {
               phase = 'NIGHT';
               nextShot = (1440 - rel) + cfg.p0Duration;
          } else {
               const p0End = cfg.p0Duration;
               const p1End = p0End + cfg.p1Duration;
               const p2End = dayM - cfg.p2Cutoff;

               if (rel < p0End) {
                   phase = 'P0';
                   nextShot = p0End - rel;
                   if (rel < 10) shotsFiredToday = 0;
               } else if (rel < p1End) {
                   phase = 'P1';
                   const p1Rel = rel - p0End;
                   nextShot = cfg.p1Interval - (p1Rel % cfg.p1Interval);
                   
                   const justTriggered = (p1Rel % cfg.p1Interval) < timeStep;
                   if (justTriggered && shotsFiredToday < cfg.p1Shots) {
                       shouldIrrigate = true;
                       shotsFiredToday++;
                       this.logService.logAction(`[FALLBACK ${r.id}] P1 SHOT FIRED`);
                   }

               } else if (rel < p2End) {
                   phase = 'P2';
                   const p2Rel = rel - p1End;
                   nextShot = cfg.p2Interval - (p2Rel % cfg.p2Interval);
                   const justTriggered = (p2Rel % cfg.p2Interval) < timeStep;
                   if (justTriggered) {
                       shouldIrrigate = true;
                       this.logService.logAction(`[FALLBACK ${r.id}] P2 MAINTENANCE SHOT`);
                   }
               } else {
                   phase = 'P3';
                   nextShot = (1440 - rel) + cfg.p0Duration;
               }
          }
          
          let valveOpen = r.valveOpen;
          // Apply Safety: Only open if we have water and not bypassed
          if (shouldIrrigate && !this.bypassActive() && hasWater) {
              valveOpen = true; 
              vwcChange += 0.8; 
          } else if (!hasWater && valveOpen) {
              valveOpen = false; // Forced Close
          }

          // Simulate reservoir drainage
          let resLevel = r.reservoirLevel;
          if (valveOpen) {
              resLevel = Math.max(0, resLevel - (0.5 * timeStep));
          } else {
              // Slow refill simulation? Or just manual. Let's keep it static unless used.
          }

          const updatedSensors = r.sensors.map(s => {
             const jitter = (Math.random() - 0.5) * 0.05;
             return {
                 ...s,
                 vwc: Math.max(0, Math.min(100, s.vwc + vwcChange + jitter)),
                 temp: r.temp
             };
          });
          const avgVwc = updatedSensors.reduce((a,b) => a + b.vwc, 0) / updatedSensors.length;
          const newTemp = r.temp + (Math.random() - 0.5) * 0.1;
          const canopyTemp = isDay ? newTemp + 2 : newTemp - 1;

          // Recalculate VPD using utility
          const currentVpd = this.calculateVPD(newTemp, r.rh);
          
          // Simulate CO2
          let co2 = r.co2;
          if (isDay) co2 -= (2 * timeStep); // Consumption
          else co2 += (0.5 * timeStep); // Accumulation
          // Injector logic in fallback (simple)
          if (co2 < r.config.co2Target) co2 += (5 * timeStep);
          co2 = Math.max(400, Math.min(2000, co2));

          let newHistory = r.history || []; 
          if (this.timeOfDayMin() % 5 === 0) {
             newHistory = [...newHistory, {
                time: this.timeOfDayMin(),
                vwc: avgVwc,
                temp: newTemp,
                rh: r.rh,
                vpd: currentVpd,
                ec: r.ec,
                co2: co2,
                phase: this.mapPhaseToNumber(phase), // CORRECT PHASE MAPPING FOR CHART COLORS
                valve: valveOpen ? 1 : 0
             }].slice(-288);
          }
          
          const cleanState: RoomState = {
              ...r,
              isDay,
              phase, 
              nextShotMin: Math.round(nextShot),
              shotsFiredToday, 
              vwc: parseFloat(avgVwc.toFixed(1)),
              temp: parseFloat(newTemp.toFixed(1)),
              canopyTemp: parseFloat(canopyTemp.toFixed(1)),
              rh: parseFloat((r.rh + (Math.random() - 0.5) * 0.1).toFixed(1)),
              co2: Math.round(co2),
              reservoirLevel: parseFloat(resLevel.toFixed(1)),
              vpd: currentVpd,
              valveOpen,
              lightsOn: isDay,
              sensors: updatedSensors,
              history: newHistory,
              hvac: r.hvac 
          };

          return this.chaosService.applyChaos(cleanState);
      });
  }

  // --- UTILITY: VPD CALCULATION ---
  private calculateVPD(tempF: number, rh: number): number {
    const tempC = (tempF - 32) * 5 / 9;
    const svp = 0.61078 * Math.exp((17.27 * tempC) / (tempC + 237.3));
    const vpd = svp * (1 - rh / 100);
    return parseFloat(vpd.toFixed(2));
  }

  private mapPhaseToNumber(p: string): number {
    switch(p) {
        case 'NIGHT': return 0;
        case 'P0': return 1;
        case 'P1': return 2;
        case 'P2': return 3;
        case 'P3': return 4;
        default: return 0;
    }
  }


  // --- PUBLIC API ---

  runStressTest(): Promise<void> {
    if (this.simMode() === 'FALLBACK') {
        this.logService.logWarning("Running Stress Test in Fallback Mode (Simulated).");
        return new Promise((resolve) => {
            setTimeout(() => {
                this.stressTestReport.set({
                    totalSimulatedDays: 60,
                    totalValveCycles: 500,
                    safetyInterventions: { success: 5, fail: 0 },
                    plantHealth: 'SURVIVED',
                    durationSeconds: 2.0,
                    tuningReport: {
                        originalConfigScore: 'B-',
                        autoTunedConfigScore: 'B+',
                        listOfChanges: ['Fallback: Adjusted P1 shots']
                    }
                });
                this.logService.logCritical("FALLBACK STRESS TEST COMPLETE.");
                resolve();
            }, 2000);
        });
    }

    this.worker?.postMessage({ type: 'RUN_STRESS_TEST' });
    this.stressTestReport.set(null);
    return new Promise(resolve => {
        this.stressTestCompletion = resolve;
    });
  }

  applyAiAction(action: AiAction) {
    this.logService.logWarning(`[AI ACTION] User approved: ${action.description}`);
    if (action.type === 'SET_P1_SHOTS') {
        this.updateConfig(action.roomId, { p1Shots: action.value });
    }
  }

  setSimSpeed(speed: number) {
    this.simSpeed.set(speed);
    if (this.simMode() === 'WORKER') {
        this.worker?.postMessage({ type: 'SET_SPEED', payload: speed });
    }
  }

  // NEW: Update global clock in worker
  setSimulationDate(date: Date) {
      if (this.simMode() === 'WORKER') {
          this.worker?.postMessage({ type: 'SET_SIM_DATE', payload: date.getTime() });
      }
  }

  togglePause() {
    this.simPaused.update(v => !v);
    if (this.simMode() === 'WORKER') {
        this.worker?.postMessage({ type: this.simPaused() ? 'PAUSE' : 'RESUME' });
    }
  }

  addStrain(roomId: string, strainId: string) {
    if (this.simMode() === 'WORKER') {
        this.worker?.postMessage({ type: 'ADD_STRAIN', payload: { roomId, strainId } });
    } else {
        const strain = this.strainService.getProfile(strainId);
        const updateFn = (r: RoomState) => ({ ...r, strains: [...r.strains, strain] });
        if (roomId === 'A') this.roomA.update(updateFn);
        else if (roomId === 'B') this.roomB.update(updateFn);
    }
  }

  addCustomStrain(roomId: string, strain: StrainProfile) {
    if (this.simMode() === 'WORKER') {
        this.worker?.postMessage({ type: 'ADD_CUSTOM_STRAIN', payload: { roomId, strain } });
    } else {
        const updateFn = (r: RoomState) => ({ ...r, strains: [...r.strains, strain] });
        if (roomId === 'A') this.roomA.update(updateFn);
        else if (roomId === 'B') this.roomB.update(updateFn);
    }
  }

  removeStrain(roomId: string, strainIndex: number) {
     if (this.simMode() === 'WORKER') {
         this.worker?.postMessage({ type: 'REMOVE_STRAIN', payload: { roomId, strainIndex } });
     } else {
         const updateFn = (r: RoomState) => {
             const s = [...r.strains];
             if (s.length > 0) s.splice(strainIndex, 1);
             return { ...r, strains: s };
         };
         if (roomId === 'A') this.roomA.update(updateFn);
         else if (roomId === 'B') this.roomB.update(updateFn);
     }
  }

  updateRoomStrain(roomId: string, index: number, updatedStrain: any) {
     if (this.simMode() === 'WORKER') {
         this.worker?.postMessage({ type: 'UPDATE_STRAIN', payload: { roomId, index, updatedStrain } });
     } else {
         const updateFn = (r: RoomState) => {
             const s = [...r.strains];
             s[index] = updatedStrain;
             return { ...r, strains: s };
         };
         if (roomId === 'A') this.roomA.update(updateFn);
         else if (roomId === 'B') this.roomB.update(updateFn);
     }
  }

  setDay(roomId: string, day: number) {
    if (this.simMode() === 'WORKER') {
        this.worker?.postMessage({ type: 'SET_DAY', payload: { roomId, day } });
    } else {
        const updateFn = (r: RoomState) => ({ ...r, dayOfCycle: day });
        if (roomId === 'A') this.roomA.update(updateFn);
        else if (roomId === 'B') this.roomB.update(updateFn);
    }
  }

  // NEW: Directly set the absolute start date for planting
  setStartDate(roomId: string, date: number) {
    if (this.simMode() === 'WORKER') {
        this.worker?.postMessage({ type: 'SET_START_DATE', payload: { roomId, date } });
    } else {
        const updateFn = (r: RoomState) => ({ ...r, vegStartDate: date });
        if (roomId === 'A') this.roomA.update(updateFn);
        else if (roomId === 'B') this.roomB.update(updateFn);
    }
  }

  setPersona(persona: AiPersona) {
    this.selectedPersona.set(persona);
    this.updateNewsFeed("AI PERSONALITY RECONFIGURED.");
  }

  updateNewsFeed(news: string) {
    this.latestNews.set(news);
  }

  updateConfig(roomId: string, newConfig: Partial<RoomConfig>) {
    const room = roomId === 'A' ? this.roomA() : roomId === 'B' ? this.roomB() : this.roomVeg();
    const currentConfig = room.config;
    
    if ((newConfig.p1Duration || newConfig.p1Interval) && newConfig.p1Shots === undefined) {
        const d = newConfig.p1Duration ?? currentConfig.p1Duration;
        const i = newConfig.p1Interval ?? currentConfig.p1Interval;
        if (i > 0) {
            newConfig.p1Shots = Math.floor(d / i);
        }
    }

    Object.entries(newConfig).forEach(([key, value]) => {
        this.syncToHomeAssistant(roomId, key, value);
    });

    if (this.simMode() === 'WORKER') {
        this.worker?.postMessage({ type: 'SET_CONFIG', payload: { roomId, newConfig } });
    } else {
        const updateFn = (r: RoomState) => ({ ...r, config: { ...r.config, ...newConfig } });
        if (roomId === 'A') this.roomA.update(updateFn);
        else if (roomId === 'B') this.roomB.update(updateFn);
        else this.roomVeg.update(updateFn);
    }
  }

  private syncToHomeAssistant(roomId: string, configKey: string, value: any) {
      // RULE 1: THE AIR GAP
      if (this.appMode.isSim()) {
          this.logService.logWarning(`[AIR GAP] Blocked HA Sync: ${configKey} -> ${value} (SIM_MODE ACTIVE)`);
          return;
      }

      const entityId = HA_ENTITY_MAP[roomId]?.[configKey];
      if (!entityId) return;
      this.logService.logAction(`[HARDWARE SYNC] POST /api/services/number/set_value -> ${entityId}: ${value}`);
      // Actual HTTP call would go here if we had the endpoint configured
  }

  toggleValve(roomId: string) {
    if (this.bypassActive()) return;
    
    if (this.simMode() === 'WORKER') {
        this.worker?.postMessage({ type: 'MANUAL_TOGGLE_VALVE', payload: { roomId } });
    } else {
        const room = roomId === 'A' ? this.roomA() : roomId === 'B' ? this.roomB() : this.roomVeg();
        
        if (room.valveOpen) {
             // Close immediately
             const updateFn = (r: RoomState) => ({ ...r, valveOpen: false });
             if (roomId === 'A') this.roomA.update(updateFn);
             else if (roomId === 'B') this.roomB.update(updateFn);
             else this.roomVeg.update(updateFn);
             this.logService.logAction(`[${roomId}] Manual Valve CLOSED.`);
        } else {
             // Open for shot duration
             const updateFn = (r: RoomState) => ({ ...r, valveOpen: true });
             if (roomId === 'A') this.roomA.update(updateFn);
             else if (roomId === 'B') this.roomB.update(updateFn);
             else this.roomVeg.update(updateFn);
             
             const duration = room.config.shotDuration || 30;
             this.logService.logAction(`[${roomId}] Manual Valve OPEN (${duration}s).`);
             
             // Simulate duration in fallback mode
             setTimeout(() => {
                 const currentRoom = roomId === 'A' ? this.roomA() : roomId === 'B' ? this.roomB() : this.roomVeg();
                 if (currentRoom.valveOpen) {
                     const closeFn = (r: RoomState) => ({ ...r, valveOpen: false });
                     if (roomId === 'A') this.roomA.update(closeFn);
                     else if (roomId === 'B') this.roomB.update(closeFn);
                     else this.roomVeg.update(closeFn);
                     this.logService.logAction(`[${roomId}] Manual Valve Auto-Close (Timer).`);
                 }
             }, (duration * 1000) / this.simSpeed());
        }
    }
  }

  toggleLights(roomId: string) {
     if (this.simMode() === 'WORKER') {
         this.worker?.postMessage({ type: 'MANUAL_TOGGLE_LIGHTS', payload: { roomId } });
     } else {
         const updateFn = (r: RoomState) => ({ ...r, lightsOn: !r.lightsOn });
         if (roomId === 'A') this.roomA.update(updateFn);
         else if (roomId === 'B') this.roomB.update(updateFn);
     }
  }

  toggleBypass() {
    this.bypassActive.update(v => !v);
    if (this.simMode() === 'WORKER') {
        this.worker?.postMessage({ type: 'SET_BYPASS', payload: this.bypassActive() });
    } else {
        if(this.bypassActive()) {
             [this.roomA, this.roomB, this.roomVeg].forEach(r => r.update(s => ({...s, valveOpen: false})));
        }
    }
    if (this.bypassActive()) this.mainPumpActive.set(false);
  }

  togglePump() {
    if (this.isPumpInterlocked()) return;
    this.mainPumpActive.update(v => !v);
  }
  
  private startAutoAnalysis() {
    setInterval(() => {
      if (this.simPaused() || this.simSpeed() > 10 || this.chaosService.enabled()) return;
      this.aiService.analyzeRoom(this.roomA(), this.timeOfDayMin(), this.selectedPersona()).then(resA => {
          this.updateNewsFeed(`[ROOM A]: ${resA.headline}`);
      }).catch(e => console.error(e));
    }, 300000);
  }

  private createInitialRoom(id: string, name: string, sensorCount: number, type: 'FLOWER' | 'VEG'): RoomState {
    const isFlower = type === 'FLOWER';
    const baseVwc = isFlower ? 45 : 60;
    const sensors: SensorData[] = Array.from({ length: sensorCount }, (_, i) => ({
      id: i + 1, vwc: baseVwc, ec: 3.0, temp: 78
    }));

    const lightsOnHour = id === 'B' ? 18 : 6;

    const config: RoomConfig = {
        lightsOnHour: lightsOnHour, dayLength: 12, 
        p0Duration: 60, p1Duration: 180, p1Interval: 20, p1Shots: 9, 
        p2Interval: 60, p2Cutoff: 120, shotDuration: 30, 
        floodIntervalHours: 4, floodDurationMinutes: 15, 
        dayTempLow: 76, dayTempHigh: 82, nightTempLow: 68, nightTempHigh: 74, 
        dayRhTarget: 60, nightRhTarget: 55, co2Target: 1200,
        lightIntensity: 100, lightRampDuration: 0
    };

    const hvac: HvacState = {
        mode: 'IDLE',
        coolRelay: false,
        heatRelay: false,
        lastCycleOffTimeMin: -200,
        lockoutRemainingMin: 0,
        diagnostic: 'SYSTEM READY'
    };

    let defaultStrain: StrainProfile;
    
    if (this.strainService) {
         if(isFlower) {
             try {
                defaultStrain = this.strainService.getProfile('ATHENA_OG');
             } catch {
                defaultStrain = { id: 'ATHENA_OG', name: 'Athena OG', type: 'HYBRID', vegDays: 14, flowerDays: 63, stretch: 'MED', feedSensitivity: 'MED', milestones: [] };
             }
         } else {
             defaultStrain = this.strainService.getVegProfile();
         }
    } else {
        defaultStrain = {
            id: 'ATHENA_OG',
            name: 'Athena OG (Fallback)',
            type: 'HYBRID',
            vegDays: 14,
            flowerDays: 63,
            stretch: 'MED',
            feedSensitivity: 'MED',
            milestones: []
        };
    }
    
    const history = [];
    for(let i = 0; i < 288; i++) {
        history.push({
            time: i * 5, vwc: baseVwc, temp: 78, rh: 60, vpd: 1.1, ec: 3.0, co2: 400, phase: 0, valve: 0
        });
    }

    // Chronology Init
    const now = Date.now();
    const batchId = `BATCH-${id}-${now.toString().slice(-6)}`;
    const vegStart = isFlower ? (now - (14 * 24 * 3600 * 1000) - (21 * 24 * 3600 * 1000)) : (now - (14 * 24 * 3600 * 1000));
    const flowerStart = isFlower ? (now - (21 * 24 * 3600 * 1000)) : null;

    return {
      id, name, type, 
      strains: [defaultStrain],
      // New Chronology fields
      currentBatchId: batchId,
      currentLifecyclePhase: isFlower ? 'FLOWER' : 'VEG',
      vegStartDate: vegStart,
      flowerStartDate: flowerStart,

      dayOfCycle: isFlower ? 21 : 14, 
      activeMilestones: [], phase: 'P0', isDay: true, nextShotMin: 0, shotsFiredToday: 0, temp: 78, canopyTemp: 78, rh: 60, vwc: baseVwc, co2: 1200, ec: 3.0, vpd: 1.1, valveOpen: false, valveOpenSince: null, lightsOn: true, 
      damperPos: 100,
      coolingStatus: 'IDLE',
      hvac,
      reservoirLevel: 85, // Default start level
      dryback24h: 0, 
      history, 
      sensors, config, sensorStatus: 'OK',
    };
  }
}
