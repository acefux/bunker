
import { Injectable, computed, inject, signal, effect } from '@angular/core';
import { FacilityService } from './facility.service';
import { SoundService } from './sound.service';
import { RoomState } from '../models';

export interface DailyRank {
    date: string;
    grade: 'S' | 'A' | 'B' | 'C' | 'F';
    score: number;
}

@Injectable({
  providedIn: 'root'
})
export class GamificationService {
  private facility = inject(FacilityService);
  private sound = inject(SoundService);

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

  constructor() {
      // Award sound logic could go here based on state changes
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

  private loadRanks(): DailyRank[] {
      if (typeof localStorage === 'undefined') return [];
      const data = localStorage.getItem('bunker_ranks');
      return data ? JSON.parse(data) : [];
  }

  saveRank(grade: 'S'|'A'|'B'|'C'|'F', score: number) {
      const newRank: DailyRank = { date: new Date().toISOString(), grade, score };
      this.ranks.update(r => [newRank, ...r].slice(0, 10)); // Keep last 10
      if (typeof localStorage !== 'undefined') {
          localStorage.setItem('bunker_ranks', JSON.stringify(this.ranks()));
      }
  }
}
