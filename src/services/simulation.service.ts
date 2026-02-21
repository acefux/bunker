
import { Injectable, inject, computed } from '@angular/core';
import { FacilityService } from './facility.service';

@Injectable({
  providedIn: 'root'
})
export class SimulationService {
  private facility = inject(FacilityService);

  // Proxy Signals
  roomA = computed(() => this.facility.roomA());
  roomB = computed(() => this.facility.roomB());
  reservoirLevel = computed(() => this.facility.reservoirLevel());
  config = computed(() => this.facility.simGlobalConfig());

  // Proxy Methods
  updateConfig(newConfig: any) {
    this.facility.updateGlobalConfig(newConfig);
  }

  resetSimulation() {
    // Re-init worker via facility if possible, or just reset chaos/config
    // For now, let's just reset chaos
    this.facility.triggerChaos('pumpFailure', false);
    this.facility.updateGlobalConfig({ growthStageDay: 1 });
  }

  overrideHardware(deviceId: string, state: boolean) {
    this.facility.overrideHardware(deviceId, state);
  }

  setReservoirLevel(level: number) {
    this.facility.setReservoirLevel(level);
  }

  triggerIrrigation(room: 'A' | 'B', phase: 'P1' | 'P2' | 'P3') {
    this.facility.triggerIrrigation(room, phase);
  }

  triggerChaos(type: string, value: boolean) {
    this.facility.triggerChaos(type, value);
  }

  setTime(timestamp: number) {
    this.facility.setSimulationDate(new Date(timestamp));
  }
}
