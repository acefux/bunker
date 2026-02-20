
console.log('--- SIMULATION WORKER V3.0 (AGRONOMIC PAYLOAD) INITIALIZED ---');

// --- INTERFACES ---
export interface SimulationConfig {
  plantCount: number;
  growthStageDay: number; // 1 to 65
  strainMultiplier: number; // 0.8 to 1.5
  ambientProfile: 'CASTLEGAR_SUMMER' | 'CASTLEGAR_WINTER';
  tickSpeedMs: number;
}

export interface RoomState {
  id: string;
  temp: number; // °F
  rh: number; // %
  vwc: number; // %
  co2: number; // ppm
  vpd: number; // kPa
  lightsOn: boolean;
  damperPos: number; // 0-100%
  coolingStatus: 'IDLE' | 'COOLING' | 'HEATING';
  // Virtual Hardware State
  pumpActive: boolean;
  fanActive: boolean;
}

// --- CONSTANTS ---
const CASTLEGAR_SUMMER = { temp: 89.6, rh: 40 }; // ~32°C
const CASTLEGAR_WINTER = { temp: 64.4, rh: 35 }; // ~18°C (Indoor Ambient Baseline)

// Physics Constants (Arbitrary Simulation Units)
const FIVE_TON_CAPACITY = 5.0; 
const LED_HEAT_LOAD = 3.5; // Room A Heat Source
const BASE_TRANSPIRATION = 0.05; // Base water loss per plant per tick
const MOISTURE_TO_RH_FACTOR = 0.8; // RH rise per unit of transpiration

// --- STATE ---
let config: SimulationConfig = {
  plantCount: 100,
  growthStageDay: 21,
  strainMultiplier: 1.0,
  ambientProfile: 'CASTLEGAR_SUMMER',
  tickSpeedMs: 1000
};

// Time State
let virtualTimestamp = Date.now();
const SIM_MINUTE_MS = 60 * 1000;

// Virtual Hardware Overrides
let overrides = {
  lightsA: null as boolean | null,
  lightsB: null as boolean | null,
  pumpA: null as boolean | null,
  pumpB: null as boolean | null,
  acA: null as boolean | null,
  acB: null as boolean | null
};

let reservoirLevel = 85.0; // %

// Initial Room States
// Room A: Day Mode (Lights ON)
let roomA: RoomState = {
  id: 'A', 
  temp: 78, 
  rh: 60, 
  vwc: 45, 
  co2: 1200, 
  vpd: 1.0, 
  lightsOn: true, 
  damperPos: 0, 
  coolingStatus: 'IDLE',
  pumpActive: false,
  fanActive: true
};

// Room B: Night Mode (Lights OFF) - Relies on Damper
let roomB: RoomState = {
  id: 'B', 
  temp: 70, 
  rh: 55, 
  vwc: 45, 
  co2: 400, 
  vpd: 0.8, 
  lightsOn: false, 
  damperPos: 0, 
  coolingStatus: 'IDLE',
  pumpActive: false,
  fanActive: true
};

// Targets
const TARGET_TEMP_A = 78;
const TARGET_TEMP_B = 68;
const TARGET_RH = 60;

let timer: any;

// --- MESSAGE HANDLER ---
self.onmessage = ({ data }) => {
  switch (data.type) {
    case 'INIT':
      console.log('Worker: Starting Simulation Loop');
      startLoop();
      break;
    case 'UPDATE_CONFIG':
      config = { ...config, ...data.payload };
      console.log('Worker: Config Updated', config);
      // Restart loop if speed changed
      if (data.payload.tickSpeedMs) {
        startLoop();
      }
      break;
    case 'OVERRIDE_HARDWARE':
      // payload: { deviceId: 'LIGHTS_A', state: true }
      handleHardwareOverride(data.payload.deviceId, data.payload.state);
      break;
    case 'SET_RESERVOIR':
      reservoirLevel = Math.max(0, Math.min(100, data.payload.level));
      break;
    case 'TRIGGER_IRRIGATION':
      triggerIrrigation(data.payload.room, data.payload.phase);
      break;
    case 'SET_TIME':
      virtualTimestamp = data.payload.timestamp;
      break;
    case 'STOP':
      clearInterval(timer);
      break;
  }
};

function startLoop() {
  if (timer) clearInterval(timer);
  timer = setInterval(tick, config.tickSpeedMs);
}

function handleHardwareOverride(deviceId: string, state: boolean) {
  switch(deviceId) {
    case 'LIGHTS_A': overrides.lightsA = state; break;
    case 'LIGHTS_B': overrides.lightsB = state; break;
    case 'PUMP_A': overrides.pumpA = state; break;
    case 'PUMP_B': overrides.pumpB = state; break;
    case 'AC_A': overrides.acA = state; break;
    case 'AC_B': overrides.acB = state; break;
  }
}

function triggerIrrigation(roomId: 'A' | 'B', phase: 'P1' | 'P2' | 'P3') {
  const room = roomId === 'A' ? roomA : roomB;
  let spike = 0;
  switch(phase) {
    case 'P1': spike = 5; break;
    case 'P2': spike = 2; break;
    case 'P3': spike = 10; break;
  }
  room.vwc = Math.min(100, room.vwc + spike);
  // Decrease reservoir
  reservoirLevel = Math.max(0, reservoirLevel - (spike * 0.5));
}

// --- PHYSICS ENGINE ---
function tick() {
  // Advance Time (1 Tick = 1 Simulated Minute)
  virtualTimestamp += SIM_MINUTE_MS;

  // 0. Apply Hardware Overrides (Pre-Physics)
  if (overrides.lightsA !== null) roomA.lightsOn = overrides.lightsA;
  if (overrides.lightsB !== null) roomB.lightsOn = overrides.lightsB;
  if (overrides.pumpA !== null) roomA.pumpActive = overrides.pumpA;
  if (overrides.pumpB !== null) roomB.pumpActive = overrides.pumpB;
  
  // 1. Calculate Growth Factor (Biological Curve)
  const growthFactor = calculateGrowthFactor(config.growthStageDay);
  
  // 2. Calculate Transpiration Load
  // Formula: Base * Count * Strain * Growth
  const totalTranspiration = BASE_TRANSPIRATION * config.plantCount * config.strainMultiplier * growthFactor;
  
  // Apply Transpiration
  // Room A (Lights ON): Full Transpiration
  applyTranspiration(roomA, totalTranspiration);
  
  // Room B (Lights OFF): Reduced Transpiration (Night cycle)
  // Plants transpire significantly less at night (stomata closed), say 15%
  applyTranspiration(roomB, totalTranspiration * 0.15);

  // 3. Thermodynamics & HVAC (The Asymmetry)
  const ambient = config.ambientProfile === 'CASTLEGAR_SUMMER' ? CASTLEGAR_SUMMER : CASTLEGAR_WINTER;
  
  // Heat Load Calculation
  // Room A: LED Heat + Ambient Bleed (Insulated but active)
  const heatLoadA = LED_HEAT_LOAD + (ambient.temp - roomA.temp) * 0.02;
  
  // Room B: Ambient Bleed (Unconditioned footprint)
  // Bleed is higher here to simulate lack of isolation/insulation or lung room effect
  const heatLoadB = (ambient.temp - roomB.temp) * 0.15;

  // Apply Passive Heat Loads
  roomA.temp += heatLoadA;
  roomB.temp += heatLoadB;

  // HVAC Demand Check
  const needsCoolingA = roomA.temp > TARGET_TEMP_A;
  // Room B needs cooling if Temp is high OR RH is high (Dehumidification requirement)
  const needsCoolingB = roomB.temp > TARGET_TEMP_B || roomB.rh > TARGET_RH;

  let coolingA = 0;
  let coolingB = 0;

  // --- THE DAMPER RULE (Priority Logic) ---
  if (needsCoolingA) {
    // Room A hogs the AC (100% Capacity)
    coolingA = FIVE_TON_CAPACITY;
    roomA.coolingStatus = 'COOLING';
    
    // Room B gets scraps (10% Capacity via Damper)
    if (needsCoolingB) {
      coolingB = FIVE_TON_CAPACITY * 0.1;
      roomB.damperPos = 10; // Visual feedback
      roomB.coolingStatus = 'COOLING'; // It's trying, but struggling
    } else {
      roomB.damperPos = 0;
      roomB.coolingStatus = 'IDLE';
    }
  } else {
    // Room A Satisfied
    roomA.coolingStatus = 'IDLE';
    
    // Room B gets full capacity if needed
    if (needsCoolingB) {
      coolingB = FIVE_TON_CAPACITY;
      roomB.damperPos = 100;
      roomB.coolingStatus = 'COOLING';
    } else {
      roomB.damperPos = 0;
      roomB.coolingStatus = 'IDLE';
    }
  }

  // Apply Cooling Physics
  // Cooling reduces Temp AND RH (Condensation)
  if (coolingA > 0) {
    roomA.temp -= coolingA;
    roomA.rh -= coolingA * 0.4; // Dehum factor
  }
  if (coolingB > 0) {
    roomB.temp -= coolingB;
    roomB.rh -= coolingB * 0.4;
  }

  // 4. Physics Cleanup
  finalizeRoom(roomA);
  finalizeRoom(roomB);

  // 5. Post Update
  self.postMessage({
    type: 'STATE_UPDATE',
    payload: { roomA, roomB, config, reservoirLevel, virtualTimestamp }
  });
}

// --- HELPER FUNCTIONS ---

function calculateGrowthFactor(day: number): number {
  // Day 1: 0.2 -> Day 40: 1.0 -> Day 65: 0.7
  if (day <= 40) {
    // Linear ramp 0.2 -> 1.0
    return 0.2 + (day / 40) * 0.8;
  } else {
    // Linear taper 1.0 -> 0.7
    const daysPastPeak = day - 40;
    // (65 - 40) = 25 days to drop 0.3
    return 1.0 - (daysPastPeak / 25) * 0.3;
  }
}

function applyTranspiration(room: RoomState, amount: number) {
  // Substrate loses water (VWC Drop)
  // Scale factor to make VWC drop realistic (e.g., 5-10% per day)
  room.vwc = Math.max(0, room.vwc - (amount * 0.2)); 
  
  // Air gains moisture (RH Rise)
  room.rh = Math.min(100, room.rh + (amount * MOISTURE_TO_RH_FACTOR));
}

function finalizeRoom(room: RoomState) {
  // VPD Calculation
  room.vpd = calculateVPD(room.temp, room.rh);
  
  // Clamp values for sanity
  room.temp = parseFloat(room.temp.toFixed(2));
  room.rh = parseFloat(room.rh.toFixed(2));
  room.vwc = parseFloat(room.vwc.toFixed(2));
  room.vpd = parseFloat(room.vpd.toFixed(2));
}

function calculateVPD(tempF: number, rh: number): number {
  const tempC = (tempF - 32) * 5 / 9;
  const svp = 0.61078 * Math.exp((17.27 * tempC) / (tempC + 237.3));
  const vpd = svp * (1 - rh / 100);
  return vpd;
}
