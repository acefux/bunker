
import { Injectable, computed, inject, signal, effect } from '@angular/core';
import { FacilityService } from './facility.service';
import { SoundService } from './sound.service';
import { RoomState } from '../models';

export interface DailyRank {
    date: string;
    grade: 'S' | 'A' | 'B' | 'C' | 'F';
    score: number;
}

import { AppModeService } from './app-mode.service';

@Injectable({
  providedIn: 'root'
})
export class GamificationService {
  private facility = inject(FacilityService);
  private sound = inject(SoundService);
  private appMode = inject(AppModeService);

  // --- TUNABLE THRESHOLDS (Signals) ---
  // VPD Targets
  vpdTargetLowVeg = signal(0.8);
  vpdTargetHighVeg = signal(1.2);
  vpdTargetLowFlower = signal(1.2);
  vpdTargetHighFlower = signal(1.6);

  // VWC Targets
  vwcMin = signal(30);
  vwcMax = signal(60);

  // Manual Overrides for Testing (Per Room)
  overrideVitality = signal<Record<string, number>>({});

  // Scores (0-100)
  roomAVitality = computed(() => {
      const ov = this.overrideVitality()['A'];
      if (ov !== undefined) return ov;
      return this.calculateVitality(this.facility.roomA());
  });

  roomBVitality = computed(() => {
      const ov = this.overrideVitality()['B'];
      if (ov !== undefined) return ov;
      return this.calculateVitality(this.facility.roomB());
  });

  // Ranks
  ranks = signal<DailyRank[]>(this.loadRanks());

  // --- COMBO SYSTEM ---
  comboMultiplier = signal(1.0);
  comboTimer = signal(0);
  isInZone = signal(false);

  // --- MISSIONS ---
  activeMission = signal<{ title: string; description: string; target: string; progress: number; total: number } | null>({
      title: "Dryback Dash",
      description: "Hit 3 Perfect P1 Shots in the Target Zone (40-45% VWC)",
      target: "P1_PERFECT",
      progress: 0,
      total: 3
  });

  triggerCrisisMission() {
      this.activeMission.set({
          title: "CRITICAL FAILURE: PUMP A",
          description: "Main Pump Failure Detected! Engage Pin 18 Bypass Manually!",
          target: "PIN_18_BYPASS",
          progress: 0,
          total: 1
      });
      this.sound.playAlert();
  }

  // --- ACHIEVEMENTS ---
  achievements = signal<string[]>([]);
  
  unlockAchievement(id: string) {
      if (!this.achievements().includes(id)) {
          this.achievements.update(a => [...a, id]);
          this.sound.playAchievement();
          this.facility.updateNewsFeed(`🏆 ACHIEVEMENT UNLOCKED: ${id}`);
      }
  }

  // --- GAME OVER ---
  isGameOver = computed(() => {
      return this.roomAVitality() <= 0 || this.roomBVitality() <= 0;
  });

  constructor() {
      // Combo Tick
      effect((onCleanup) => {
          const timer = setInterval(() => {
              if (this.appMode.isSim() && !this.facility.simPaused()) {
                  this.updateCombo();
                  
                  // Random Crisis Check (Low probability)
                  if (Math.random() < 0.005 && !this.activeMission()) { // 0.5% chance per second
                      // this.triggerCrisisMission(); // Optional: Enable for auto-chaos
                  }
              }
          }, 1000);
          onCleanup(() => clearInterval(timer));
      });
  }

  private updateCombo() {
      const rA = this.facility.roomA();
      const rB = this.facility.roomB();
      
      // Check if both rooms are "Green" (Vitality > 80)
      const vA = this.roomAVitality();
      const vB = this.roomBVitality();
      
      if (vA > 80 && vB > 80) {
          this.isInZone.set(true);
          this.comboTimer.update(t => t + 1);
          
          // Multiplier Logic
          const t = this.comboTimer();
          if (t > 60) this.comboMultiplier.set(1.5);
          if (t > 120) this.comboMultiplier.set(2.0);
          if (t > 300) this.comboMultiplier.set(4.0); // MAX
      } else {
          this.isInZone.set(false);
          this.comboTimer.set(0);
          this.comboMultiplier.set(1.0);
      }
  }

  registerAction(actionType: string, value: any) {
      // Mission Logic
      const mission = this.activeMission();
      if (mission && mission.target === actionType) {
          this.activeMission.update(m => {
              if (!m) return null;
              const newProgress = m.progress + 1;
              if (newProgress >= m.total) {
                  this.sound.playAchievement();
                  this.facility.updateNewsFeed(`🏆 MISSION COMPLETE: ${m.title}`);
                  return null; // Clear mission or load next
              }
              return { ...m, progress: newProgress };
          });
      }
  }

  checkPerfectShot(vwc: number) {
      // Target Zone: 40-45%
      if (vwc >= 40 && vwc <= 45) {
          this.sound.playPerfectHit();
          this.registerAction('P1_PERFECT', 1);
          
          // Check for "First Dryback" achievement
          this.unlockAchievement('FIRST_PERFECT_SHOT');
          
          return true;
      } else {
          this.sound.playError();
          return false;
      }
  }

  checkThermalJuggler(roomB: RoomState) {
      // If Room B is surviving the penalty (Temp < 80) while Room A is cooling
      if (roomB.coolingStatus === 'COOLING' && roomB.damperPos === 10 && roomB.temp < 80) {
          // This is hard to track without state, but let's just give it if they toggle AC manually
          // Actually, we'll call this from the UI when they toggle AC B
      }
  }

  grantManualBadge(grade: 'S'|'A'|'B'|'C'|'F', roomId: string) {
      this.sound.playAchievement();
      const score = grade === 'S' ? 100 : grade === 'A' ? 92 : grade === 'B' ? 85 : grade === 'C' ? 75 : 50;
      
      // 1. Save to History
      this.saveRank(grade, score);

      // 2. Force Visual Update (Override Vitality) for the target room
      this.overrideVitality.update(prev => ({
          ...prev,
          [roomId]: score
      }));

      // Auto-clear override after 5 seconds to return to simulation
      setTimeout(() => {
          this.overrideVitality.update(prev => {
              const next = { ...prev };
              delete next[roomId];
              return next;
          });
      }, 5000);
  }

  private calculateVitality(room: RoomState): number {
      if (room.sensorStatus === 'ERROR') return 0;
      if (room.sensorStatus === 'DRIFTING') return 50;

      // 1. VPD Score (0-100)
      const isFlower = room.currentLifecyclePhase === 'FLOWER';
      const targetLow = isFlower ? this.vpdTargetLowFlower() : this.vpdTargetLowVeg();
      const targetHigh = isFlower ? this.vpdTargetHighFlower() : this.vpdTargetHighVeg();
      
      let vpdScore = 100;
      if (room.vpd < targetLow) vpdScore -= (targetLow - room.vpd) * 100;
      if (room.vpd > targetHigh) vpdScore -= (room.vpd - targetHigh) * 100;
      vpdScore = Math.max(0, Math.min(100, vpdScore));

      // 2. VWC Target Match (0-100)
      const min = this.vwcMin();
      const max = this.vwcMax();
      
      let vwcScore = 100;
      if (room.vwc < min) vwcScore -= (min - room.vwc) * 5;
      if (room.vwc > max) vwcScore -= (room.vwc - max) * 5;
      vwcScore = Math.max(0, Math.min(100, vwcScore));

      // Vitality = (VPD_Score + VWC_Score) / 2
      const total = (vpdScore + vwcScore) / 2;
      return Math.round(total);
  }

  getRankForScore(score: number): 'S' | 'A' | 'B' | 'C' | 'F' {
      if (score >= 98) return 'S';
      if (score >= 90) return 'A';
      if (score >= 80) return 'B';
      if (score >= 70) return 'C';
      return 'F';
  }

  private getStorageKey(): string {
      return this.appMode.isSim() ? 'bunker_ranks_sim' : 'bunker_ranks_live';
  }

  private loadRanks(): DailyRank[] {
      if (typeof localStorage === 'undefined') return [];
      const key = this.getStorageKey();
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : [];
  }

  saveRank(grade: 'S'|'A'|'B'|'C'|'F', score: number) {
      const newRank: DailyRank = { date: new Date().toISOString(), grade, score };
      this.ranks.update(r => [newRank, ...r].slice(0, 10)); // Keep last 10
      if (typeof localStorage !== 'undefined') {
          localStorage.setItem(this.getStorageKey(), JSON.stringify(this.ranks()));
      }
  }
}
