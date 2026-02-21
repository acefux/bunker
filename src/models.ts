
// --- AI Types ---
export type AiPersona = 'PROFESSIONAL' | 'FUNNY' | 'DRILL_SERGEANT';

export interface AiAction {
  type: 'SET_P1_SHOTS';
  roomId: string;
  value: number;
  description: string;
}

export interface ConsultationResult {
  status: "OPTIMAL" | "WARNING" | "CRITICAL";
  headline: string;
  analysis: string;
  recommendations: string[];
  suggestedAction: AiAction | null;
}

export interface CropSteeringMetrics {
  overnightDrybackPercent: number; // % VWC lost overnight
  p1RampVelocity: number;          // % VWC per Hour
  fieldCapacityVwc: number;        // Max VWC in 24h
  fieldCapacityStability: number;  // Variance at peak saturation (New V2.4)
  canopyToAmbientDelta: number;    // °F (Canopy - Ambient)
  vpdAvg: number;                  // Average VPD over 24h
  vpdStressScore: number;          // Hours outside 0.8-1.2 kPa (New V2.4)
  ecStackingVelocity: number;      // EC delta over 24h
  co2EfficiencyScore: number;      // % Target achieved during lights on (New V2.4)
}

// --- Strain / Biology Types ---
export interface Milestone {
  id?: string;
  day: number;
  phase: 'VEG' | 'FLOWER'; 
  title: string;
  type: 'PRUNE' | 'TOP' | 'DEFOL' | 'FEED' | 'HARVEST' | 'TRANSPLANT';
  description: string;
}

export interface StrainProfile {
  id: string;
  name: string;
  type: 'INDICA' | 'SATIVA' | 'HYBRID';
  vegDays: number;    
  flowerDays: number; 
  stretch: 'LOW' | 'MED' | 'HIGH';
  feedSensitivity: 'LOW' | 'MED' | 'HIGH';
  milestones: Milestone[];
}

// --- Historical Data ---
export interface BatchHistory {
    batchId: string;
    roomId: string;
    strains: string[]; // Names of strains in this batch
    vegStartDate: number;
    flowerStartDate: number | null;
    harvestDate: number;
    totalDays: number;
    yieldRating?: 'A' | 'B' | 'C' | 'F';
    // Aggregated simplified history
    dailyStats: {
        day: number;
        avgVwc: number;
        avgTemp: number;
        avgVpd: number;
    }[];
}

// --- Facility / Room Types ---
export interface RoomConfig {
  lightsOnHour: number;
  dayLength: number;
  
  // Irrigation Phase Config
  p0Duration: number;
  p1Duration: number;
  p1Interval: number;
  p1Shots: number;
  p2Interval: number;
  p2Cutoff: number;
  shotDuration: number;
  floodIntervalHours: number;
  floodDurationMinutes: number;
  
  // HVAC Config (Synced to Lights)
  dayTempLow: number;         // Heat To
  dayTempHigh: number;        // Cool To
  nightTempLow: number;
  nightTempHigh: number;
  dayRhTarget: number;
  nightRhTarget: number;
  co2Target: number;
  
  // Lighting additions
  lightIntensity: number; // 0-100%
  lightRampDuration: number; // Minutes
}

export interface SensorData {
  id: number;
  vwc: number;
  ec: number;
  temp: number;
}

export interface HvacState {
  mode: 'IDLE' | 'COOLING' | 'HEATING' | 'LOCKED_OUT';
  coolRelay: boolean;
  heatRelay: boolean;
  lastCycleOffTimeMin: number; 
  lockoutRemainingMin: number; 
  diagnostic: string;
}

export interface RoomState {
  id: string;
  name: string;
  type: 'FLOWER' | 'VEG';
  
  // Chronology State
  currentBatchId: string | null;
  currentLifecyclePhase: 'IDLE' | 'VEG' | 'FLOWER';
  vegStartDate: number | null;    // Simulated Timestamp
  flowerStartDate: number | null; // Simulated Timestamp
  
  strains: StrainProfile[]; 
  dayOfCycle: number; // Computed relative to phase start
  activeMilestones: { strainName: string, milestone: Milestone }[];

  phase: 'P0' | 'P1' | 'P2' | 'P3' | 'NIGHT' | 'FLOOD' | 'DRAIN';
  isDay: boolean;
  nextShotMin: number;
  shotsFiredToday: number;
  
  temp: number;
  canopyTemp: number; 
  rh: number;
  vwc: number;
  co2: number;
  ec: number;
  vpd: number;
  
  reservoirLevel: number; // % (0-100) - Ultrasonic Safety Interlock

  sensors: SensorData[];
  sensorStatus: 'OK' | 'ERROR' | 'DRIFTING';
  
  valveOpen: boolean; 
  valveOpenSince: number | null;
  lightsOn: boolean;
  damperPos: number; // 0-100%
  coolingStatus: 'IDLE' | 'COOLING' | 'HEATING';
  
  mainPumpFailure?: boolean;
  pin18Bypass?: boolean;
  
  hvac: HvacState;

  config: RoomConfig;
  dryback24h: number;
  
  history: { 
    time: number; 
    vwc: number; 
    temp: number; 
    rh: number; 
    vpd: number;
    ec: number;
    co2: number; 
    phase: number; 
    valve: number 
  }[];
}

// --- Reporting Types ---
export interface TuningReport {
    originalConfigScore: string;
    autoTunedConfigScore: string;
    listOfChanges: string[];
}

export interface StressTestReport {
  totalSimulatedDays: number;
  totalValveCycles: number;
  safetyInterventions: {
    success: number;
    fail: number;
  };
  plantHealth: 'SURVIVED' | 'DIED';
  durationSeconds: number;
  tuningReport?: TuningReport;
}

// --- Self Healing Types ---
export interface HealingAction {
  action: "UPDATE_CONFIG";
  parameter: keyof RoomConfig;
  value: number;
  reason: string;
}

// --- Logging Types ---
export type LogLevel = 'INFO' | 'ACTION' | 'WARN' | 'CRITICAL';

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
}
