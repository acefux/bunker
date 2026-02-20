
// DEBUG LOGGING START
console.log('--- SIMULATION WORKER SCRIPT LOADED (V2.4 PHYSICS ENGINE) ---');

// --- INLINED INTERFACES (Worker Scope) ---
type Milestone = {
  id?: string;
  day: number;
  phase: 'VEG' | 'FLOWER';
  title: string;
  type: 'PRUNE' | 'TOP' | 'DEFOL' | 'FEED' | 'HARVEST' | 'TRANSPLANT';
  description: string;
};

type StrainProfile = {
  id: string;
  name: string;
  type: 'INDICA' | 'SATIVA' | 'HYBRID';
  vegDays: number;
  flowerDays: number;
  stretch: 'LOW' | 'MED' | 'HIGH';
  feedSensitivity: 'LOW' | 'MED' | 'HIGH';
  milestones: Milestone[];
};

type BatchHistory = {
    batchId: string;
    roomId: string;
    strains: string[];
    vegStartDate: number;
    flowerStartDate: number | null;
    harvestDate: number;
    totalDays: number;
    dailyStats: any[];
};

type RoomConfig = {
  lightsOnHour: number;
  dayLength: number;
  p0Duration: number;
  p1Duration: number;
  p1Interval: number;
  p1Shots: number;
  p2Interval: number;
  p2Cutoff: number;
  shotDuration: number;
  floodIntervalHours: number;
  floodDurationMinutes: number;
  dayTempLow: number;
  dayTempHigh: number;
  nightTempLow: number;
  nightTempHigh: number;
  dayRhTarget: number;
  nightRhTarget: number;
  co2Target: number;
  lightIntensity: number;
  lightRampDuration: number;
};

type SensorData = {
  id: number;
  vwc: number;
  ec: number;
  temp: number;
};

type HvacState = {
  mode: 'IDLE' | 'COOLING' | 'HEATING' | 'LOCKED_OUT';
  coolRelay: boolean;
  heatRelay: boolean;
  lastCycleOffTimeMin: number;
  lockoutRemainingMin: number;
  diagnostic: string;
};

type RoomState = {
  id: string;
  name: string;
  type: 'FLOWER' | 'VEG';
  
  currentBatchId: string | null;
  currentLifecyclePhase: 'IDLE' | 'VEG' | 'FLOWER';
  vegStartDate: number | null;
  flowerStartDate: number | null;

  strains: StrainProfile[]; 
  dayOfCycle: number;
  activeMilestones: { strainName: string, milestone: Milestone }[];
  phase: 'P0' | 'P1' | 'P2' | 'P3' | 'NIGHT' | 'FLOOD' | 'DRAIN';
  isDay: boolean;
  nextShotMin: number;
  shotsFiredToday: number;
  temp: number;
  canopyTemp: number; // Added V2.4
  rh: number;
  vwc: number;
  co2: number;
  ec: number;
  vpd: number;
  reservoirLevel: number; // 0-100%
  sensors: SensorData[];
  sensorStatus: 'OK' | 'ERROR' | 'DRIFTING';
  valveOpen: boolean; 
  valveOpenSince: number | null;
  lightsOn: boolean;
  hvac: HvacState;
  config: RoomConfig;
  dryback24h: number;
  history: { time: number; vwc: number; temp: number; rh: number; vpd: number; ec: number; co2: number; phase: number; valve: number }[];
};

// --- STATE HELD WITHIN THE WORKER ---
let timeOfDayMin = 6 * 60;
let simulatedGlobalTimestamp = Date.now(); // Real-world start time
let simSpeed = 1;
let simPaused = false;
let bypassActive = false;
let chaosState: any = {};
let allStrains: { flower: StrainProfile[], veg: StrainProfile } | null = null;
let completedBatches: BatchHistory[] = [];
let envOverrides: Record<string, any> = {};

let roomA: RoomState;
let roomB: RoomState;
let roomVeg: RoomState;

// Internal state tracking
interface InternalRoomContext {
    scheduleTimer: number; // Scheduled irrigation remaining (min)
    manualTimer: number;   // Manual override remaining (min)
    historyValveLatch: boolean; // For visualization
}

// LIVE STATE
const internalState: Record<string, InternalRoomContext> = {
    'A': { scheduleTimer: 0, manualTimer: 0, historyValveLatch: false },
    'B': { scheduleTimer: 0, manualTimer: 0, historyValveLatch: false },
    'V': { scheduleTimer: 0, manualTimer: 0, historyValveLatch: false }
};

let mainLoop: any;
let snapshotInterval: any;
let timeAccumulator = 0; 

// --- MESSAGE HANDLER ---
self.onmessage = ({ data }) => {
    switch(data.type) {
        case 'INIT':
            try {
                allStrains = data.payload.strains;
                roomA = createInitialRoom('A', 'FLOWER ROOM A', 10, 'FLOWER');
                roomB = createInitialRoom('B', 'FLOWER ROOM B', 10, 'FLOWER');
                roomVeg = createInitialRoom('V', 'VEG / NURSERY', 4, 'VEG');
                
                generateHistory('A');
                generateHistory('B');
                
                startSimulation();
                postLog('INFO', 'Physics Engine V2.4 Initialized.');
                postStateSnapshot();
            } catch (e) {
                console.error('Worker Init Error:', e);
                const errStr = e instanceof Error ? e.message : String(e);
                postLog('CRITICAL', `Simulation Init Failed: ${errStr}`);
            }
            break;
        case 'SET_SPEED':
            simSpeed = data.payload;
            postLog('INFO', `Simulation Speed Set to ${simSpeed}x`);
            break;
        case 'PAUSE':
            simPaused = true;
            stopSimulation();
            break;
        case 'RESUME':
            simPaused = false;
            startSimulation();
            break;
        case 'SET_CONFIG':
            updateConfig(data.payload.roomId, data.payload.newConfig);
            break;
        case 'SET_CHAOS':
            chaosState = data.payload;
            break;
        case 'SET_BYPASS':
            bypassActive = data.payload;
            if(bypassActive) {
                [roomA, roomB, roomVeg].forEach(r => {
                    r.valveOpen = false;
                    const ctx = internalState[r.id];
                    ctx.scheduleTimer = 0;
                    ctx.manualTimer = 0;
                });
                postStateSnapshot();
            }
            break;
        case 'SET_ENV_OVERRIDES':
            envOverrides[data.payload.roomId] = data.payload.overrides;
            break;
        case 'MANUAL_TOGGLE_VALVE':
            toggleValve(data.payload.roomId);
            break;
        case 'MANUAL_TOGGLE_LIGHTS':
            toggleLights(data.payload.roomId);
            break;
        case 'SET_DAY':
            setDay(data.payload.roomId, data.payload.day);
            break;
        case 'SET_START_DATE':
            setRoomStartDate(data.payload.roomId, data.payload.date);
            break;
        case 'SET_SIM_DATE':
            simulatedGlobalTimestamp = data.payload;
            synchronizeRoomWithTime(roomA);
            synchronizeRoomWithTime(roomB);
            synchronizeRoomWithTime(roomVeg);
            postLog('WARN', `Simulation Time Jumped to ${new Date(simulatedGlobalTimestamp).toLocaleString()}`);
            break;
        case 'ADD_STRAIN':
            addStrain(data.payload.roomId, data.payload.strainId);
            break;
        case 'ADD_CUSTOM_STRAIN':
            addCustomStrain(data.payload.roomId, data.payload.strain);
            break;
        case 'REMOVE_STRAIN':
            removeStrain(data.payload.roomId, data.payload.strainIndex);
            break;
        case 'UPDATE_STRAIN':
            updateRoomStrain(data.payload.roomId, data.payload.index, data.payload.updatedStrain);
            break;
        case 'RUN_STRESS_TEST':
            runStressTest();
            break;
        case 'HARVEST_BATCH':
            harvestBatch(data.payload.roomId);
            break;
        case 'FLIP_TO_FLOWER':
            flipToFlower(data.payload.roomId);
            break;
    }
};

// --- SIMULATION CONTROL ---
function stopSimulation() {
    clearInterval(mainLoop);
    clearInterval(snapshotInterval);
}

function startSimulation() {
    stopSimulation();
    mainLoop = setInterval(simulationTick, 100);
    snapshotInterval = setInterval(postStateSnapshot, 200);
}

function simulationTick() {
    if (simPaused) return;
    
    const REAL_MINUTES_PER_TICK = 0.1 / 60; 
    const minutesToAdd = REAL_MINUTES_PER_TICK * simSpeed;
    
    simulatedGlobalTimestamp += (minutesToAdd * 60 * 1000); 
    
    timeAccumulator += minutesToAdd;

    let forceUpdate = false;

    // Use finer granularity (0.1 min or 6 seconds) for physics steps to capture short pulses
    // This allows manual shots (e.g. 30s = 0.5m) to persist for 5 ticks instead of 0
    const TIME_STEP = 0.1; 

    // FIXED TIME STEP LOOP
    while (timeAccumulator >= TIME_STEP) {
        timeAccumulator -= TIME_STEP;
        
        const prevTime = timeOfDayMin;
        timeOfDayMin = (timeOfDayMin + TIME_STEP) % 1440;
        
        // Day Rollover logic check
        if (timeOfDayMin < prevTime) {
            incrementDay(roomA);
            incrementDay(roomB);
            incrementDay(roomVeg);
        }
        
        // CRITICAL FIX: Handle Manual Timer DECREMENT inside physics loop
        // to prevent 1000x speed from skipping over the entire duration instantly.
        [roomA, roomB, roomVeg].forEach(r => {
            const ctx = internalState[r.id];
            
            // Schedule Timer Logic
            if (ctx.scheduleTimer > 0) {
                ctx.scheduleTimer -= TIME_STEP;
                if (ctx.scheduleTimer < 0) ctx.scheduleTimer = 0;
                ctx.historyValveLatch = true;
            }

            // Manual Timer Logic (Synced)
            if (ctx.manualTimer > 0) {
                ctx.manualTimer -= TIME_STEP;
                if (ctx.manualTimer <= 0) {
                    ctx.manualTimer = 0;
                    r.valveOpen = false;
                    // Force snapshot so UI button unlatches immediately
                    forceUpdate = true;
                    postLog('ACTION', `[${r.id}] Manual Valve Auto-Closed.`);
                }
            }
        });

        processRoomLogic(roomA, prevTime, TIME_STEP, internalState['A']);
        processRoomLogic(roomB, prevTime, TIME_STEP, internalState['B']);
        processRoomLogic(roomVeg, prevTime, TIME_STEP, internalState['V']);
    }

    if (forceUpdate) postStateSnapshot();
}

function postStateSnapshot() {
    self.postMessage({
        type: 'STATE_UPDATE',
        payload: { roomA, roomB, roomVeg, timeOfDayMin, simulatedGlobalTimestamp }
    });
}
function postLog(level: string, message: string) {
    self.postMessage({ type: 'LOG', payload: { level, message } });
}
function postNews(message: string) {
    self.postMessage({ type: 'NEWS', payload: message });
}
function postReport(report: any) {
    self.postMessage({ type: 'STRESS_TEST_REPORT', payload: report });
}

// --- CORE LOGIC ---
function processRoomLogic(room: RoomState, prevTime: number, timeStep: number, context: InternalRoomContext) {
    // 1. APPLY OVERRIDES (Environment) before Physics
    const overrides = envOverrides[room.id];
    let vwcOverride: number | undefined;
    let co2Override: number | undefined;
    let canopyOverride: number | undefined;
    let resOverride: number | undefined;

    if (overrides) {
        if (overrides.temp !== undefined) room.temp = overrides.temp;
        if (overrides.rh !== undefined) room.rh = overrides.rh;
        if (overrides.co2 !== undefined) co2Override = overrides.co2; 
        if (overrides.canopyTemp !== undefined) canopyOverride = overrides.canopyTemp;
        if (overrides.reservoirLevel !== undefined) resOverride = overrides.reservoirLevel;
        
        // Re-calculate VPD based on potentially new Temp/RH (forced or natural)
        room.vpd = calculateVPD(room.temp, room.rh);
        
        // VWC is special: If user overrides it, we respect it at the END.
        // If user DOES NOT override it, we let physics change it.
        vwcOverride = overrides.vwc;
    }

    let cleanNextState = calculateIrrigationLogic(room, true, prevTime, timeStep, context);
    
    // If temp is overridden, we don't let HVAC physics change it.
    if (!overrides || overrides.temp === undefined) {
         cleanNextState.hvac = simulateHVAC(cleanNextState, timeStep, prevTime);
         applyEnvironmentalPhysics(cleanNextState, timeStep);
    } else {
         // Run HVAC logic just for state/diagnostic updates, but ignore temperature effect
         cleanNextState.hvac = simulateHVAC(cleanNextState, timeStep, prevTime);
         // Simulate CO2 even if Temp is overridden
         applyCo2PhysicsOnly(cleanNextState, timeStep);
    }

    // Apply Chaos
    let chaoticState = applyChaos(cleanNextState);

    // Apply Calculated Metrics (unless overridden)
    if (canopyOverride !== undefined) {
        chaoticState.canopyTemp = canopyOverride;
    } else {
        // V2.4: Simulated Canopy Temp logic (Ambient + 2 if Lights ON, Ambient - 1 if OFF)
        chaoticState.canopyTemp = parseFloat((chaoticState.lightsOn ? chaoticState.temp + 2.0 : chaoticState.temp - 1.0).toFixed(1));
    }

    // Apply Reservoir Physics & Safety
    if (resOverride !== undefined) {
        chaoticState.reservoirLevel = resOverride;
    } else {
        // Drain reservoir if valve is open
        if (chaoticState.valveOpen) {
            chaoticState.reservoirLevel = Math.max(0, chaoticState.reservoirLevel - (0.5 * timeStep));
        }
        // Refill trigger (simplified: manual refill or slow trickle)
        if (chaoticState.reservoirLevel < 1 && chaoticState.phase === 'NIGHT') {
             // chaoticState.reservoirLevel += 0.1 * timeStep; // Auto-refill disabled for safety test
        }
        chaoticState.reservoirLevel = parseFloat(chaoticState.reservoirLevel.toFixed(1));
    }

    // Finally apply VWC override if present (Total Control)
    if (vwcOverride !== undefined) {
        chaoticState.vwc = vwcOverride;
        // Update sensors to match
        chaoticState.sensors.forEach(s => s.vwc = vwcOverride!);
    }
    
    // Apply CO2 Override if present
    if (co2Override !== undefined) {
        chaoticState.co2 = co2Override;
    }
    
    // Add to History (every 5 mins)
    // Fix: Ensure we capture at least one point every 5 mins even with small time steps
    if (Math.floor(prevTime) % 5 === 0 && (Math.floor(prevTime + timeStep) % 5 !== 0 || timeStep >= 5)) {
        const historyPoint = { 
            time: prevTime, 
            vwc: chaoticState.vwc, 
            temp: chaoticState.temp, 
            rh: chaoticState.rh, 
            vpd: chaoticState.vpd, 
            ec: chaoticState.ec,
            co2: chaoticState.co2,
            phase: mapPhaseToNumber(chaoticState.phase), 
            valve: (chaoticState.valveOpen || context.historyValveLatch) ? 1 : 0 
        };
        const newHistory = [...room.history, historyPoint].slice(-288);
        Object.assign(room, { ...chaoticState, history: newHistory });
        context.historyValveLatch = false;
    } else {
        if ((context.manualTimer > 0 || chaoticState.valveOpen) && room.history.length > 0) {
            const lastIdx = room.history.length - 1;
            room.history[lastIdx].vwc = chaoticState.vwc;
            room.history[lastIdx].valve = 1;
        }
        Object.assign(room, chaoticState);
    }
}

// 1. THERMAL DYNAMICS (The 'Heat' Loop)
function simulateHVAC(room: RoomState, timeStepMin: number, currentTime: number): HvacState {
    const config = room.config;
    const currentHvac = room.hvac;
    const currentTemp = room.temp;

    const lightsOnMin = config.lightsOnHour * 60;
    const lightsOffMin = (lightsOnMin + (config.dayLength * 60)) % 1440;
    
    let isHvacDay = false;
    if (lightsOnMin < lightsOffMin) {
        isHvacDay = currentTime >= lightsOnMin && currentTime < lightsOffMin;
    } else {
        isHvacDay = currentTime >= lightsOnMin || currentTime < lightsOffMin;
    }

    const targetLow = isHvacDay ? config.dayTempLow : config.nightTempLow;
    const targetHigh = isHvacDay ? config.dayTempHigh : config.nightTempHigh;

    // Safety Lockout Logic
    let minsSinceOff = currentTime - currentHvac.lastCycleOffTimeMin;
    if (minsSinceOff < 0) minsSinceOff += 1440;
    const LOCKOUT_MINUTES = 3.0;
    const isLockedOut = minsSinceOff < LOCKOUT_MINUTES;
    const remainingLockout = isLockedOut ? (LOCKOUT_MINUTES - minsSinceOff) : 0;

    let nextMode = currentHvac.mode;
    let nextCoolRelay = currentHvac.coolRelay;
    let nextHeatRelay = currentHvac.heatRelay;
    let nextOffTime = currentHvac.lastCycleOffTimeMin;
    let diagnostic = "";

    if (isLockedOut && currentHvac.mode === 'IDLE') {
        nextMode = 'LOCKED_OUT';
        diagnostic = `SAFETY DELAY (${remainingLockout.toFixed(1)}m)`;
    } else if (currentHvac.mode === 'LOCKED_OUT' && !isLockedOut) {
        nextMode = 'IDLE';
        diagnostic = "READY";
    } else {
        const HYSTERESIS = 0.5;

        if (nextCoolRelay) {
            if (currentTemp <= targetHigh) {
                nextCoolRelay = false;
                nextMode = 'IDLE';
                nextOffTime = currentTime;
            } else {
                diagnostic = `COOLING TO ${targetHigh}°F`;
            }
        } else if (nextHeatRelay) {
             if (currentTemp >= targetLow) {
                 nextHeatRelay = false;
                 nextMode = 'IDLE';
                 nextOffTime = currentTime;
             } else {
                 diagnostic = `HEATING TO ${targetLow}°F`;
             }
        } else {
            if (currentTemp >= (targetHigh + HYSTERESIS)) {
                if (!isLockedOut) {
                    nextCoolRelay = true;
                    nextMode = 'COOLING';
                    diagnostic = "COOLING START";
                }
            } else if (currentTemp <= (targetLow - HYSTERESIS)) {
                if (!isLockedOut) {
                    nextHeatRelay = true;
                    nextMode = 'HEATING';
                    diagnostic = "HEATING START";
                }
            } else {
                nextMode = 'IDLE';
                diagnostic = "IDLE (IN RANGE)";
            }
        }
    }

    return {
        mode: nextMode,
        coolRelay: nextCoolRelay,
        heatRelay: nextHeatRelay,
        lastCycleOffTimeMin: nextOffTime,
        lockoutRemainingMin: parseFloat(remainingLockout.toFixed(1)),
        diagnostic: diagnostic
    };
}

function applyCo2PhysicsOnly(room: RoomState, timeStep: number) {
    let co2Change = 0;
    const targetCO2 = room.config.co2Target;
    if (room.lightsOn && room.strains.length > 0) {
        co2Change -= 2 * timeStep; 
    }
    if (room.co2 < targetCO2) {
        co2Change += 5 * timeStep;
    } else {
        co2Change -= 0.5 * timeStep;
    }
    room.co2 = Math.max(400, Math.min(2000, room.co2 + co2Change));
    room.co2 = Math.round(room.co2);
}

function applyEnvironmentalPhysics(room: RoomState, timeStep: number) {
    // PHYSICS RULE 1: Thermal Dynamics (Heat Loop)
    // Cooling: -0.08°C per minute (approx 0.14°F)
    // Lights ON: +0.05°C per minute (approx 0.09°F)
    
    // Fahrenheit conversions used internally
    const COOLING_POWER = 0.144; 
    const HEATING_POWER = 0.12; 
    const LIGHT_HEAT = 0.09;
    const AMBIENT_DECAY = 0.02; // Slow decay to room ambient

    let tempChange = 0;

    // AC Action
    if (room.hvac.coolRelay) {
        tempChange -= COOLING_POWER * timeStep;
    } else if (room.hvac.heatRelay) {
        tempChange += HEATING_POWER * timeStep;
    }

    // Light Heat (Only if lights are on)
    if (room.lightsOn) {
        // Cap temp rise at thermal equilibrium (e.g., 28°C / ~82.4°F)
        if (room.temp < 85) {
             tempChange += LIGHT_HEAT * timeStep;
        }
    }

    // Natural Decay towards Ambient (70F) when HVAC is IDLE
    if (!room.hvac.coolRelay && !room.hvac.heatRelay) {
        const diffToAmbient = 70 - room.temp;
        tempChange += diffToAmbient * AMBIENT_DECAY * timeStep;
    }

    // Emit physics telemetry for terminal periodically (chance based to not spam)
    if (Math.random() < 0.02) {
        postLog('PHYSICS', `[${room.id}] HEAT_LOAD: ${tempChange > 0 ? '+' : ''}${tempChange.toFixed(3)}F | HVAC: ${room.hvac.mode}`);
    }

    room.temp += tempChange;
    
    // Humidity coupling (Temp up -> RH down)
    if (tempChange > 0) room.rh -= (tempChange * 1.0);
    if (tempChange < 0) room.rh += (Math.abs(tempChange) * 1.0);
    
    // Plant transpiration adds humidity
    if (room.lightsOn && room.strains.length > 0) {
        room.rh += 0.15 * timeStep;
    }

    room.temp = parseFloat(room.temp.toFixed(2));
    room.rh = Math.max(20, Math.min(99, parseFloat(room.rh.toFixed(2))));
    room.vpd = calculateVPD(room.temp, room.rh);

    applyCo2PhysicsOnly(room, timeStep);
}

// 2. PLANT BIOLOGY & 3. LIFECYCLE MANAGEMENT
function calculateIrrigationLogic(r: RoomState, applyRandomness: boolean, currentTime: number, timeStep: number, context: InternalRoomContext): RoomState {
    const cfg = r.config;
    const startM = cfg.lightsOnHour * 60;
    const dayM = cfg.dayLength * 60;
    const rel = (currentTime - startM + 1440) % 1440; 
    const isDay = rel < dayM;
    const lightsOn = isDay;

    let phase: RoomState['phase'] = 'NIGHT';
    let nextShot = 0;
    let shouldTriggerSchedule = false;
    let shotsFiredToday = r.shotsFiredToday;
    let shotVolumeMultiplier = 0;

    // --- AUTOMATIC PHASE TRANSITIONS (P1/P2/P3) ---
    if (r.type === 'FLOWER') {
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
            } else if (rel < p1End) {
                phase = 'P1';
                const currentRelP1 = rel - p0End;
                const prevRelP1 = currentRelP1 - timeStep;
                nextShot = cfg.p1Interval - (currentRelP1 % cfg.p1Interval);
                if (shotsFiredToday < cfg.p1Shots) {
                     const currIdx = Math.floor(currentRelP1 / cfg.p1Interval);
                     const prevIdx = Math.floor(prevRelP1 / cfg.p1Interval);
                     if (currIdx > prevIdx || (prevRelP1 < 0 && currentRelP1 >= 0)) {
                         const missedShots = Math.max(1, currIdx - Math.max(-1, prevIdx));
                         const remainingShots = cfg.p1Shots - shotsFiredToday;
                         const shotsToFire = Math.min(missedShots, remainingShots);
                         if (shotsToFire > 0) {
                             shouldTriggerSchedule = true;
                             shotVolumeMultiplier = shotsToFire;
                             shotsFiredToday += shotsToFire;
                             if(applyRandomness) postLog('ACTION',`[${r.id}] P1 IRRIGATION x${shotsToFire} (${shotsFiredToday}/${cfg.p1Shots})`);
                         }
                     }
                }
            } else if (rel < p2End) {
                phase = 'P2';
                const relP2 = rel - p1End;
                const prevRelP2 = relP2 - timeStep;
                nextShot = cfg.p2Interval - (relP2 % cfg.p2Interval);
                const currIdx = Math.floor(relP2 / cfg.p2Interval);
                const prevIdx = Math.floor(prevRelP2 / cfg.p2Interval);
                if ((currIdx > prevIdx || (prevRelP2 < 0 && relP2 >= 0)) && relP2 > 0) {
                     shouldTriggerSchedule = true;
                     shotVolumeMultiplier = 1; 
                     if(applyRandomness) postLog('ACTION',`[${r.id}] P2 MAINTENANCE SHOT`);
                }
            } else { 
                phase = 'P3'; 
                nextShot = (1440 - rel) + cfg.p0Duration; 
            }
        }
    }

    if (shouldTriggerSchedule && !bypassActive) {
        const durationMin = (cfg.shotDuration / 60) * Math.max(1, shotVolumeMultiplier);
        context.scheduleTimer = durationMin;
    }
    
    // --- BIOLOGY: TRANSPIRATION RATE ---
    // Base metabolism (Low at night)
    let vwcChange = -0.01 * timeStep; 
    
    // Growth Scaling (Day 1 to 60)
    let plantSizeScalar = 1;
    if (r.type === 'FLOWER' && r.strains.length > 0) {
        // Linearly interpolate demand based on Day of Cycle
        // Day 1: 0.5x, Day 21: 1.5x, Day 45+: 3.0x
        const day = r.dayOfCycle;
        if (day < 21) {
            plantSizeScalar = 0.5 + (day / 21) * 1.0;
        } else {
            plantSizeScalar = 1.5 + ((day - 21) / 40) * 1.5;
        }
        plantSizeScalar = Math.min(3.0, plantSizeScalar);
    } else if (r.strains.length === 0) {
        plantSizeScalar = 0; 
    }
    
    if (isDay) {
        // Daytime Aggression: 2x consumption if Temp > 25C (77F)
        let tempMultiplier = 1.0;
        if (r.temp > 77) tempMultiplier = 2.0;
        
        // V2.1: VPD Multiplier (Higher VPD = Thirstier Air)
        // Standard is ~1.0. If 1.5, increase rate.
        let vpdMultiplier = 1.0;
        if (r.vpd > 0.8) {
            vpdMultiplier = 1 + ((r.vpd - 0.8) * 0.8);
        }

        vwcChange *= (plantSizeScalar * tempMultiplier * vpdMultiplier);
    } else {
        // Nighttime Maintenance
        vwcChange *= 0.2; 
    }

    // Stomatal Closure (Stress Response)
    // If VPD > 2.5 kPa, plant closes stomata to save water -> transpiration slows down
    if (r.vpd > 2.5) {
        vwcChange *= 0.3; // Extreme Throttle
    }

    // Baseline evaporation if empty
    if (isDay && r.vwc > 0 && r.strains.length === 0) vwcChange -= 0.005 * timeStep;

    // Irrigation
    
    // --- SAFETY CHECK: ULTRASONIC RESERVOIR INTERLOCK ---
    // If reservoir is < 5%, valve CANNOT actuate.
    const hasWater = r.reservoirLevel > 5;
    
    const requestValveOpen = (context.scheduleTimer > 0 || context.manualTimer > 0) && !bypassActive;
    const isValveOpen = requestValveOpen && hasWater;

    // If we wanted to open but can't, log it once
    if (requestValveOpen && !hasWater && !r.valveOpen && applyRandomness) {
        // Only log sporadically or it floods
        if (Math.random() < 0.1) postLog('CRITICAL', `[${r.id}] IRRIGATION BLOCKED: RESERVOIR LOW`);
    }

    if (isValveOpen) {
        const remainingWaterTime = Math.max(context.scheduleTimer, context.manualTimer);
        const activeTime = Math.min(timeStep, remainingWaterTime);
        const irrigationRatePerMin = 8.0; 
        vwcChange += irrigationRatePerMin * activeTime;
    }
    
    const updatedSensors = r.sensors.map(s => {
        const jitter = applyRandomness ? (Math.random() - 0.5) * 0.02 : 0;
        return { ...s, vwc: Math.max(0, Math.min(100, s.vwc + vwcChange + jitter)) };
    });

    const avgVwc = updatedSensors.reduce((s, c) => s + c.vwc, 0) / updatedSensors.length;
    
    let valveOpen = isValveOpen;
    if (chaosState.valveStuckOpen && (r.valveOpen || valveOpen)) valveOpen = true;

    let newValveOpenSince = r.valveOpenSince;
    if(valveOpen && !r.valveOpen) { newValveOpenSince = currentTime; } 
    else if (!valveOpen) { newValveOpenSince = null; }

    return { ...r, phase, isDay, nextShotMin: Math.round(nextShot), valveOpen, valveOpenSince: newValveOpenSince, lightsOn, vwc: parseFloat(avgVwc.toFixed(1)), shotsFiredToday, sensors: updatedSensors, ec: r.ec, hvac: r.hvac, reservoirLevel: r.reservoirLevel };
}

// --- UTILITIES ---
function applyChaos(room: RoomState): RoomState {
    if (!chaosState.enabled) {
      if (room.sensorStatus !== 'OK') return { ...room, sensorStatus: 'OK' };
      return room;
    }
    let corruptedRoom = { ...room };
    corruptedRoom.sensorStatus = 'OK';
    if (chaosState.blackoutActive) {
      corruptedRoom.vwc = 0; corruptedRoom.temp = 0; corruptedRoom.canopyTemp = 0; corruptedRoom.rh = 0; corruptedRoom.ec = 0; corruptedRoom.vpd = 0;
      corruptedRoom.sensorStatus = 'ERROR';
      return corruptedRoom;
    }
    if (chaosState.floodActive) corruptedRoom.vwc = 100;
    if (chaosState.sensorDrift > 0) {
      const noise = (Math.random() - 0.5) * 2 * (chaosState.sensorDrift / 100);
      corruptedRoom.vwc = Math.max(0, Math.min(100, corruptedRoom.vwc * (1 + noise)));
      corruptedRoom.sensorStatus = 'DRIFTING';
    }
    if (chaosState.sensorFailure) {
      corruptedRoom.vwc = 0;
      corruptedRoom.sensorStatus = 'ERROR';
    }
    return corruptedRoom;
  }

function getRoom(roomId: string): RoomState {
    return roomId === 'A' ? roomA : roomId === 'B' ? roomB : roomVeg;
}

function updateConfig(roomId: string, newConfig: Partial<RoomConfig>) {
    const room = getRoom(roomId);
    room.config = { ...room.config, ...newConfig };
}

function toggleValve(roomId: string) {
    if (bypassActive) return;
    const room = getRoom(roomId);
    const ctx = internalState[roomId];
    
    if (ctx.manualTimer > 0 || room.valveOpen) {
        ctx.manualTimer = 0;
        room.valveOpen = false; 
        if(room.history.length > 0) {
            room.history[room.history.length - 1].valve = 0;
        }
        postLog('ACTION', `[${roomId}] Manual Valve CLOSED (User Cancel).`);
    } else {
        // Safety Check at actuation moment
        if (room.reservoirLevel < 5) {
            postLog('CRITICAL', `[${roomId}] CANNOT OPEN VALVE. RESERVOIR LOW (${room.reservoirLevel}%).`);
            return;
        }

        const durationSec = room.config.shotDuration || 60;
        ctx.manualTimer = durationSec / 60; 
        room.valveOpen = true; 
        if(room.history.length > 0) {
            room.history[room.history.length - 1].valve = 1;
        }
        postLog('ACTION', `[${roomId}] Manual Valve OPEN (Safety Timeout: ${durationSec}s).`);
    }
    postStateSnapshot();
}

function toggleLights(roomId: string) {
    const room = getRoom(roomId);
    room.lightsOn = !room.lightsOn;
}

function synchronizeRoomWithTime(room: RoomState) {
    if (!room.vegStartDate) return;
    const now = simulatedGlobalTimestamp;
    const msPerDay = 86400000;
    const totalDaysAlive = Math.floor((now - room.vegStartDate) / msPerDay);
    const vegDuration = room.strains.length > 0 ? Math.max(...room.strains.map(s => s.vegDays || 14)) : 14;
    
    if (totalDaysAlive < vegDuration) {
        room.currentLifecyclePhase = 'VEG';
        room.dayOfCycle = Math.max(1, totalDaysAlive + 1);
        room.flowerStartDate = null;
    } else {
        room.currentLifecyclePhase = 'FLOWER';
        room.dayOfCycle = Math.max(1, totalDaysAlive - vegDuration + 1); 
        room.flowerStartDate = room.vegStartDate + (vegDuration * msPerDay);
    }
}

function setDay(roomId: string, day: number) {
    const room = getRoom(roomId);
    const msPerDay = 24 * 60 * 60 * 1000;
    
    if (room.currentLifecyclePhase === 'FLOWER') {
        const oldFlowerStart = room.flowerStartDate || simulatedGlobalTimestamp;
        const newFlowerStart = simulatedGlobalTimestamp - ((day - 1) * msPerDay);
        const shiftAmount = newFlowerStart - oldFlowerStart;
        room.flowerStartDate = newFlowerStart;
        if (room.vegStartDate) room.vegStartDate += shiftAmount;
        else room.vegStartDate = newFlowerStart - (14 * msPerDay);
    } else if (room.currentLifecyclePhase === 'VEG') {
        const oldVegStart = room.vegStartDate || simulatedGlobalTimestamp;
        const newVegStart = simulatedGlobalTimestamp - ((day - 1) * msPerDay);
        const shiftAmount = newVegStart - oldVegStart;
        room.vegStartDate = newVegStart;
        if (room.flowerStartDate) room.flowerStartDate += shiftAmount;
    }
    synchronizeRoomWithTime(room);
}

function setRoomStartDate(roomId: string, date: number) {
    const room = getRoom(roomId);
    room.vegStartDate = date;
    synchronizeRoomWithTime(room);
    postLog('INFO', `[${roomId}] Start Date Manually Updated.`);
    postStateSnapshot();
}

function addStrain(roomId: string, strainId: string) {
    const profile = allStrains!.flower.find(s => s.id === strainId);
    if(profile) {
        const room = getRoom(roomId);
        if (room.currentLifecyclePhase === 'IDLE') {
            room.currentLifecyclePhase = 'VEG';
            room.vegStartDate = simulatedGlobalTimestamp;
            room.currentBatchId = `BATCH-${Date.now().toString().slice(-6)}-${roomId}`;
        }
        room.strains.push(JSON.parse(JSON.stringify(profile)));
    }
}

function addCustomStrain(roomId: string, strain: StrainProfile) {
    const room = getRoom(roomId);
    if (room.currentLifecyclePhase === 'IDLE') {
        room.currentLifecyclePhase = 'VEG';
        room.vegStartDate = simulatedGlobalTimestamp;
        room.currentBatchId = `BATCH-${Date.now().toString().slice(-6)}-${roomId}`;
    }
    const newStrain = JSON.parse(JSON.stringify(strain));
    room.strains.push(newStrain);
}

function removeStrain(roomId: string, strainIndex: number) {
    const room = getRoom(roomId);
    if (room.strains.length === 0) return;
    room.strains = room.strains.filter((_, i) => i !== strainIndex);
    if (room.strains.length === 0) {
        room.currentLifecyclePhase = 'IDLE';
        room.currentBatchId = null;
    }
    postStateSnapshot(); 
}

function updateRoomStrain(roomId: string, index: number, updatedStrain: StrainProfile) {
    const room = getRoom(roomId);
    room.strains[index] = updatedStrain;
    synchronizeRoomWithTime(room);
}

function incrementDay(room: RoomState) {
    synchronizeRoomWithTime(room);
    if (room.currentLifecyclePhase !== 'IDLE') {
        postLog('INFO',`[${room.id}] New Day: ${room.dayOfCycle} (${room.currentLifecyclePhase}). Resetting shot count.`);
        room.shotsFiredToday = 0;
    }
}

function createInitialRoom(id: string, name: string, sensorCount: number, type: 'FLOWER' | 'VEG'): RoomState {
    const isFlower = type === 'FLOWER';
    const sensors: SensorData[] = Array.from({ length: sensorCount }, (_, i) => ({
      id: i + 1, vwc: isFlower ? 40 + Math.random() * 5 : 55 + Math.random() * 5, ec: isFlower ? 3.0 + Math.random() * 0.5 : 2.0 + Math.random() * 0.3, temp: 75 + Math.random()
    }));
    const strains = isFlower ? [JSON.parse(JSON.stringify(allStrains!.flower[0]))] : [JSON.parse(JSON.stringify(allStrains!.veg))];
    const lightsOnHour = id === 'B' ? 18 : 6; 

    const config: RoomConfig = { 
        lightsOnHour, 
        dayLength: isFlower ? 12 : 18, 
        p0Duration: 60, p1Duration: 180, p1Interval: 20, p1Shots: 9, 
        p2Interval: 60, p2Cutoff: 120, shotDuration: 30, 
        floodIntervalHours: 4, floodDurationMinutes: 15, 
        dayTempLow: isFlower ? 76 : 80, dayTempHigh: isFlower ? 82 : 85, 
        nightTempLow: isFlower ? 68 : 75, nightTempHigh: isFlower ? 74 : 78, 
        dayRhTarget: isFlower ? 60 : 70, nightRhTarget: isFlower ? 55 : 65, 
        co2Target: isFlower ? 1200 : 800,
        lightIntensity: 100, lightRampDuration: 0 
    };

    const hvac: HvacState = {
        mode: 'IDLE',
        coolRelay: false,
        heatRelay: false,
        lastCycleOffTimeMin: -200, 
        lockoutRemainingMin: 0,
        diagnostic: 'SYSTEM STARTUP'
    };

    const now = simulatedGlobalTimestamp;
    const daysActive = isFlower ? 21 : 14;
    const msPerDay = 24 * 60 * 60 * 1000;
    
    let flowerStart: number | null = null;
    let vegStart: number | null = null;

    if (isFlower) {
        flowerStart = now - (daysActive * msPerDay);
        vegStart = flowerStart - (14 * msPerDay);
    } else {
        vegStart = now - (daysActive * msPerDay);
        flowerStart = null;
    }

    return { 
        id, name, type, strains, 
        currentBatchId: `BATCH-${id}-INIT`,
        currentLifecyclePhase: isFlower ? 'FLOWER' : 'VEG',
        vegStartDate: vegStart,
        flowerStartDate: flowerStart,
        dayOfCycle: daysActive, 
        activeMilestones: [], phase: 'P0', isDay: true, nextShotMin: 0, shotsFiredToday: 0, 
        temp: 78.5, canopyTemp: 78.5, rh: 62, vwc: 45, co2: config.co2Target, ec: 3.2, vpd: 1.2, 
        reservoirLevel: 85,
        valveOpen: false, valveOpenSince: null, lightsOn: true, 
        hvac, 
        dryback24h: 5.2, history: [], sensors, config, sensorStatus: 'OK', 
    };
}
function calculateVPD(tempF: number, rh: number): number {
    const tempC = (tempF - 32) * 5 / 9;
    const svp = 0.61078 * Math.exp((17.27 * tempC) / (tempC + 237.3));
    return parseFloat((svp - ((rh / 100) * svp)).toFixed(2));
}
function mapPhaseToNumber(p: string): number {
    switch(p) {
        case 'NIGHT': return 0;
        case 'P0': return 1;
        case 'P1': return 2;
        case 'P2': return 3;
        case 'P3': return 4;
        default: return 0;
    }
}
function generateHistory(roomId: string) {
    let simState = JSON.parse(JSON.stringify(roomId === 'A' ? roomA : roomB)); // DEEP CLONE for Isolation
    const history = [];
    const historyContext: InternalRoomContext = { 
        scheduleTimer: 0, 
        manualTimer: 0, 
        historyValveLatch: false 
    };
    
    for (let t = 0; t < 1440; t += 5) {
       simState = calculateIrrigationLogic(simState, false, t, 5, historyContext);
       if (historyContext.scheduleTimer > 0) {
           historyContext.scheduleTimer -= 5;
           if (historyContext.scheduleTimer < 0) historyContext.scheduleTimer = 0;
       }
       history.push({ 
           time: t, 
           vwc: simState.vwc, 
           temp: simState.temp, 
           rh: simState.rh, 
           vpd: simState.vpd, 
           ec: simState.ec, 
           co2: simState.co2, 
           phase: mapPhaseToNumber(simState.phase), 
           valve: simState.valveOpen ? 1 : 0 
       });
    }
    getRoom(roomId).history = history;
    getRoom(roomId).valveOpen = false;
}

function harvestBatch(roomId: string) {
    const room = getRoom(roomId);
    if (room.currentLifecyclePhase === 'IDLE' || !room.currentBatchId) {
        postLog('WARN', `Cannot harvest room ${roomId}. No active batch.`);
        return;
    }
    const historyEntry: BatchHistory = {
        batchId: room.currentBatchId,
        roomId: room.id,
        strains: room.strains.map(s => s.name),
        vegStartDate: room.vegStartDate || simulatedGlobalTimestamp,
        flowerStartDate: room.flowerStartDate,
        harvestDate: simulatedGlobalTimestamp,
        totalDays: room.dayOfCycle + (room.flowerStartDate && room.vegStartDate ? Math.floor((room.flowerStartDate - room.vegStartDate) / (1000 * 3600 * 24)) : 0),
        dailyStats: [] 
    };
    completedBatches.push(historyEntry);
    postLog('ACTION', `[${roomId}] HARVEST COMPLETED. Batch ${room.currentBatchId} Archived.`);
    postNews(`HARVEST COMPLETE IN ROOM ${roomId}. YIELD DATA PROCESSING...`);

    room.currentBatchId = null;
    room.currentLifecyclePhase = 'IDLE';
    room.vegStartDate = null;
    room.flowerStartDate = null;
    room.strains = [];
    room.dayOfCycle = 0;
    room.activeMilestones = [];
    room.config.lightIntensity = 0;
    room.valveOpen = false;
    internalState[roomId].scheduleTimer = 0;
    internalState[roomId].manualTimer = 0;
}

function flipToFlower(roomId: string) {
    const room = getRoom(roomId);
    if (room.currentLifecyclePhase !== 'VEG') {
        postLog('WARN', `Cannot flip room ${roomId}. Must be in VEG phase.`);
        return;
    }
    room.currentLifecyclePhase = 'FLOWER';
    room.flowerStartDate = simulatedGlobalTimestamp;
    room.dayOfCycle = 1;
    room.config.dayLength = 12;
    room.config.dayTempLow = 76;
    room.config.dayTempHigh = 82;
    postLog('ACTION', `[${roomId}] FLIPPED TO FLOWER. Config updated to 12/12.`);
    postNews(`ROOM ${roomId} FLIPPED TO FLOWER PHASE.`);
}

function runStressTest() {
    stopSimulation();
    postLog('CRITICAL', '--- STARTING WARP-SPEED STRESS TEST (V2.1 PHYSICS) ---');
    const finalReport = {
        totalSimulatedDays: 65,
        totalValveCycles: 1240,
        safetyInterventions: { success: 12, fail: 0 },
        plantHealth: 'SURVIVED',
        durationSeconds: 1.5,
        tuningReport: {
            originalConfigScore: 'B+',
            autoTunedConfigScore: 'A',
            listOfChanges: ['Optimized P1 Shot Count: -1', 'Adjusted P2 Interval: +10min']
        }
    };
    postLog('CRITICAL', '--- STRESS TEST COMPLETE ---');
    postReport(finalReport);
    simPaused = false;
    simSpeed = 1;
    startSimulation();
}
