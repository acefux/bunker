
import { Injectable, signal } from '@angular/core';
import { RoomState } from '../models';

@Injectable({
  providedIn: 'root'
})
export class ChaosService {
  enabled = signal(false);
  
  // Controls
  sensorDrift = signal(0); // 0-50%
  sensorFailure = signal(false);
  valveStuckOpen = signal(false);
  networkLag = signal(0); // 0-5000ms

  // Scenarios
  heatWaveActive = signal(false);
  floodActive = signal(false);
  blackoutActive = signal(false);

  resetAll() {
    this.sensorDrift.set(0);
    this.sensorFailure.set(false);
    this.valveStuckOpen.set(false);
    this.networkLag.set(0);
    this.heatWaveActive.set(false);
    this.floodActive.set(false);
    this.blackoutActive.set(false);
  }

  // --- Scenarios ---
  triggerHeatWave() {
    this.resetAll();
    this.heatWaveActive.set(true);
  }

  triggerFlood() {
    this.resetAll();
    this.floodActive.set(true);
  }

  triggerBlackout() {
    this.resetAll();
    this.blackoutActive.set(true);
  }

  // --- Data Interceptor ---
  applyChaos(room: RoomState): RoomState {
    if (!this.enabled()) {
      // Ensure status is OK if chaos is disabled
      if (room.sensorStatus !== 'OK') {
        return { ...room, sensorStatus: 'OK' };
      }
      return room;
    }

    let corruptedRoom = { ...room };
    corruptedRoom.sensorStatus = 'OK'; // Default to OK unless changed

    // Scenario: Blackout (highest priority)
    if (this.blackoutActive()) {
      corruptedRoom.vwc = 0;
      corruptedRoom.temp = 0;
      corruptedRoom.rh = 0;
      corruptedRoom.ec = 0;
      corruptedRoom.vpd = 0;
      corruptedRoom.sensorStatus = 'ERROR';
      return corruptedRoom;
    }

    // Scenario: Flood
    if (this.floodActive()) {
      corruptedRoom.vwc = 100;
    }

    // Individual Controls
    if (this.sensorDrift() > 0) {
      const driftAmount = this.sensorDrift() / 100;
      const noise = (Math.random() - 0.5) * 2 * driftAmount;
      corruptedRoom.vwc = corruptedRoom.vwc * (1 + noise);
      corruptedRoom.vwc = Math.max(0, Math.min(100, corruptedRoom.vwc)); // Clamp
      corruptedRoom.sensorStatus = 'DRIFTING';
    }

    if (this.sensorFailure()) {
      corruptedRoom.vwc = 0;
      corruptedRoom.sensorStatus = 'ERROR';
    }

    return corruptedRoom;
  }
}
