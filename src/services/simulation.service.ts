
import { Injectable, inject, signal, effect, computed } from '@angular/core';
import { AppModeService } from './app-mode.service';
import { RoomState, SimulationConfig } from '../simulation.worker'; // Import types from worker file (or move to models)

// Re-defining types here if they aren't exported from worker file in a way that works for imports
// In a real app, these should be in a shared models file.
export interface SimRoomState {
  id: string;
  temp: number;
  rh: number;
  vwc: number;
  co2: number;
  vpd: number;
  lightsOn: boolean;
  damperPos: number;
  coolingStatus: 'IDLE' | 'COOLING' | 'HEATING';
  pumpActive: boolean;
  fanActive: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class SimulationService {
  private appMode = inject(AppModeService);
  private worker: Worker | null = null;

  // --- STATE SIGNALS ---
  roomA = signal<SimRoomState>({ id: 'A', temp: 0, rh: 0, vwc: 0, co2: 0, vpd: 0, lightsOn: false, damperPos: 0, coolingStatus: 'IDLE', pumpActive: false, fanActive: true });
  roomB = signal<SimRoomState>({ id: 'B', temp: 0, rh: 0, vwc: 0, co2: 0, vpd: 0, lightsOn: false, damperPos: 0, coolingStatus: 'IDLE', pumpActive: false, fanActive: true });
  reservoirLevel = signal<number>(100);

  // Configuration State
  config = signal<SimulationConfig>({
    plantCount: 40,
    growthStageDay: 21,
    strainMultiplier: 1.0,
    ambientProfile: 'CASTLEGAR_SUMMER',
    tickSpeedMs: 1000
  });

  constructor() {
    effect(() => {
      if (this.appMode.isSim()) {
        this.startWorker();
      } else {
        this.stopWorker();
      }
    });
  }

  private startWorker() {
    if (this.worker) return;

    console.log('🌱 SIMULATION SERVICE: Starting Worker...');
    
    if (typeof Worker !== 'undefined') {
      this.worker = new Worker(new URL('../simulation.worker', import.meta.url));
      
      this.worker.onmessage = ({ data }) => {
        if (data.type === 'STATE_UPDATE') {
          this.roomA.set(data.payload.roomA);
          this.roomB.set(data.payload.roomB);
          if (data.payload.reservoirLevel !== undefined) {
            this.reservoirLevel.set(data.payload.reservoirLevel);
          }
        }
      };

      this.worker.postMessage({ type: 'INIT' });
      this.updateWorkerConfig();
    }
  }

  private stopWorker() {
    if (!this.worker) return;
    console.log('🛑 SIMULATION SERVICE: Stopping Worker...');
    this.worker.terminate();
    this.worker = null;
  }

  // --- PUBLIC API ---
  updateConfig(newConfig: Partial<SimulationConfig>) {
    this.config.update(current => ({ ...current, ...newConfig }));
    this.updateWorkerConfig();
  }

  private updateWorkerConfig() {
    if (this.worker) {
      this.worker.postMessage({ 
        type: 'UPDATE_CONFIG', 
        payload: this.config() 
      });
    }
  }

  resetSimulation() {
    if (this.worker) {
      this.worker.postMessage({ type: 'INIT' });
    }
  }

  // --- V3.0 MIGRATED CONTROLS ---

  overrideHardware(deviceId: string, state: boolean) {
    this.postMessage({ type: 'OVERRIDE_HARDWARE', payload: { deviceId, state } });
  }

  setReservoirLevel(level: number) {
    this.postMessage({ type: 'SET_RESERVOIR', payload: { level } });
  }

  triggerIrrigation(room: 'A' | 'B', phase: 'P1' | 'P2' | 'P3') {
    this.postMessage({ type: 'TRIGGER_IRRIGATION', payload: { room, phase } });
  }

  setTime(timestamp: number) {
    this.postMessage({ type: 'SET_TIME', payload: { timestamp } });
  }

  private postMessage(msg: any) {
    if (this.worker) {
      this.worker.postMessage(msg);
    }
  }
}
