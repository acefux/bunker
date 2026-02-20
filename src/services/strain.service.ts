
import { Injectable } from '@angular/core';
import { Milestone, StrainProfile } from '../models';

@Injectable({
  providedIn: 'root'
})
export class StrainService {
  
  // Define Standard Operating Procedures (SOP) milestones
  private readonly SOP_VEG: Milestone[] = [
    { id: 'v1', day: 1, phase: 'VEG', title: 'Transplant', type: 'TRANSPLANT', description: 'Transplant clones to 1 gal blocks.' },
    { id: 'v2', day: 14, phase: 'VEG', title: 'Top 1', type: 'TOP', description: 'Top main stem to encourage lateral branching.' },
    { id: 'v3', day: 21, phase: 'VEG', title: 'Clean Up', type: 'PRUNE', description: 'Remove bottom 30% of growth.' }
  ];

  private readonly SOP_FLOWER: Milestone[] = [
    { id: 'f1', day: 1, phase: 'FLOWER', title: 'Flip to 12/12', type: 'FEED', description: 'Switch lights to Generative cues.' },
    { id: 'f2', day: 10, phase: 'FLOWER', title: 'Day 10 Prune', type: 'PRUNE', description: 'Structural pruning. Remove "suckers".' },
    { id: 'f3', day: 21, phase: 'FLOWER', title: 'Day 21 Strip', type: 'DEFOL', description: 'Heavy defoliation. Expose bud sites.' },
    
    // NEW STEERING MILESTONE
    { id: 'f_steer_1', day: 22, phase: 'FLOWER', title: 'Generative Steering', type: 'FEED', description: 'Increase EC, higher drybacks for stretch control.' },

    { id: 'f4', day: 42, phase: 'FLOWER', title: 'Wk 6 Defol', type: 'DEFOL', description: 'Remove fan leaves blocking lower sites.' },
    
    // NEW STEERING MILESTONE
    { id: 'f_steer_2', day: 43, phase: 'FLOWER', title: 'Vegetative Steering', type: 'FEED', description: 'Lower EC, lower drybacks for bulking.' },

    { id: 'f5', day: 56, phase: 'FLOWER', title: 'Flush Start', type: 'FEED', description: 'Begin crop steering flush (fade).' },
    { id: 'f6', day: 63, phase: 'FLOWER', title: 'Harvest', type: 'HARVEST', description: 'Chop and hang.' }
  ];

  readonly STRAINS: StrainProfile[] = [
    {
      id: 'ATHENA_OG',
      name: 'Athena OG (House)',
      type: 'HYBRID',
      vegDays: 14,
      flowerDays: 63,
      stretch: 'MED',
      feedSensitivity: 'LOW',
      milestones: JSON.parse(JSON.stringify(this.SOP_FLOWER))
    },
    {
      id: 'MAC_1',
      name: 'MAC 1 (Cap Cut)',
      type: 'HYBRID',
      vegDays: 21,
      flowerDays: 70,
      stretch: 'LOW',
      feedSensitivity: 'MED',
      milestones: [
        ...JSON.parse(JSON.stringify(this.SOP_FLOWER.filter((m: Milestone) => m.day !== 63))),
        { id: 'm1', day: 60, phase: 'FLOWER', title: 'Late Bulk', type: 'FEED', description: 'Push EC high.' },
        { id: 'm2', day: 70, phase: 'FLOWER', title: 'Harvest', type: 'HARVEST', description: 'Dense buds ready.' }
      ]
    },
    {
      id: 'HAZE_XL',
      name: 'Super Lemon Haze',
      type: 'SATIVA',
      vegDays: 14,
      flowerDays: 80,
      stretch: 'HIGH',
      feedSensitivity: 'HIGH',
      milestones: [
         ...JSON.parse(JSON.stringify(this.SOP_FLOWER.filter((m: Milestone) => m.day !== 63))),
         { id: 'h1', day: 14, phase: 'FLOWER', title: 'Height Control', type: 'TOP', description: 'Supercrop due to stretch.' },
         { id: 'h2', day: 80, phase: 'FLOWER', title: 'Harvest', type: 'HARVEST', description: 'Amber trichomes visible.' }
      ]
    },
    {
      id: 'GMO',
      name: 'GMO Cookies',
      type: 'INDICA',
      vegDays: 21,
      flowerDays: 75,
      stretch: 'HIGH',
      feedSensitivity: 'MED',
      milestones: [
         ...JSON.parse(JSON.stringify(this.SOP_FLOWER.filter((m: Milestone) => m.day !== 63))),
         { id: 'g1', day: 14, phase: 'FLOWER', title: 'Install Trellis', type: 'TOP', description: 'Requires double trellis due to height.' },
         { id: 'g2', day: 75, phase: 'FLOWER', title: 'Harvest', type: 'HARVEST', description: 'Distinct garlic aroma.' }
      ]
    },
    {
      id: 'STRAWBERRY',
      name: 'Strawberry Cough',
      type: 'SATIVA',
      vegDays: 14,
      flowerDays: 65,
      stretch: 'MED',
      feedSensitivity: 'LOW',
      milestones: JSON.parse(JSON.stringify(this.SOP_FLOWER))
    }
  ];

  getProfile(id: string): StrainProfile {
    // Return a deep copy so rooms can edit their own instances
    const template = this.STRAINS.find(s => s.id === id) || this.STRAINS[0];
    return JSON.parse(JSON.stringify(template));
  }

  getVegProfile(): StrainProfile {
    return {
        id: 'VEG_PHASE',
        name: 'Vegetative Stock',
        type: 'HYBRID',
        vegDays: 30,
        flowerDays: 30, // Veg duration
        stretch: 'MED',
        feedSensitivity: 'LOW',
        milestones: JSON.parse(JSON.stringify(this.SOP_VEG))
    };
  }
}
