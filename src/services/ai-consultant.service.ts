
import { Injectable, inject, signal, computed } from '@angular/core';
import { GoogleGenAI, Type } from "@google/genai";
import { RoomState, AiPersona, ConsultationResult, CropSteeringMetrics } from '../models';
import { OllamaService } from './ollama.service';
import { firstValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AiConsultantService {
  
  private geminiAi: GoogleGenAI;
  private ollamaService: OllamaService;

  // --- AI Provider Configuration ---
  useLocalAi = signal(false); // Default to Gemini (Cloud)
  aiStatus = signal<'ONLINE' | 'OFFLINE'>('ONLINE');
  activeProvider = computed(() => this.useLocalAi() ? 'OLLAMA' : 'GEMINI');
  ollamaModel = 'llama3';

  // --- Gemini Rate Limiting ---
  private isRateLimited = false;
  private rateLimitCooldownEnd = 0;

  constructor() {
    this.ollamaService = inject(OllamaService);
    
    // Safe access to process.env
    const apiKey = (typeof process !== 'undefined' && process.env) ? process.env['API_KEY'] : '';
    this.geminiAi = new GoogleGenAI({ apiKey });
  }

  toggleProvider(provider: 'GEMINI' | 'OLLAMA') {
      this.useLocalAi.set(provider === 'OLLAMA');
  }

  async analyzeRoom(room: RoomState, lightsOnTime: number, persona: AiPersona): Promise<ConsultationResult> {
    const metrics = this.calculateCropSteeringMetrics(room);

    // Force Ollama if Drill Sergeant is requested (as per spec) or user preferred
    if (persona === 'DRILL_SERGEANT' || this.useLocalAi()) {
      return this.analyzeRoomWithOllama(room, metrics, persona);
    }
    return this.analyzeRoomWithGemini(room, metrics, persona);
  }

  getFallbackError(): ConsultationResult {
     return {
        status: 'CRITICAL',
        headline: 'AI LINK OFFLINE - MANUAL OVERRIDE ENGAGED',
        analysis: 'AI Consultation service is currently unavailable. Please verify connectivity.',
        recommendations: ['Check manual sensors.', 'Verify connectivity.'],
        suggestedAction: null
      };
  }

  // --- METRICS CALCULATION (The "Analyst" Layer - V2.4) ---
  private calculateCropSteeringMetrics(room: RoomState): CropSteeringMetrics {
    const history = room.history || [];
    
    // Default metrics if no history
    if (history.length === 0) {
        return { 
            overnightDrybackPercent: 0, 
            p1RampVelocity: 0,
            fieldCapacityVwc: room.vwc,
            fieldCapacityStability: 0,
            canopyToAmbientDelta: 0,
            vpdAvg: room.vpd,
            vpdStressScore: 0,
            ecStackingVelocity: 0,
            co2EfficiencyScore: 100
        };
    }

    // 1. Field Capacity & Stability
    const fieldCapacityVwc = Math.max(...history.map(h => h.vwc));
    // Check variance of top 5% readings to determine stability/flatline
    const highReadings = history.filter(h => h.vwc > fieldCapacityVwc * 0.98).map(h => h.vwc);
    let fieldCapacityStability = 0;
    if (highReadings.length > 1) {
        const avg = highReadings.reduce((a,b) => a+b, 0) / highReadings.length;
        fieldCapacityStability = highReadings.reduce((a,b) => a + Math.pow(b - avg, 2), 0) / highReadings.length; // Variance
    }

    // 2. Overnight Dryback
    // Logic: Field Capacity - VWC at Lights On
    const lightsOnMin = room.config.lightsOnHour * 60;
    
    // Find history point closest to Lights On
    const lightsOnPoint = history.find(h => Math.abs(h.time - lightsOnMin) < 10);
    const vwcAtLightsOn = lightsOnPoint ? lightsOnPoint.vwc : history[0].vwc;
    
    const overnightDrybackPercent = parseFloat((fieldCapacityVwc - vwcAtLightsOn).toFixed(1));

    // 3. P1 Ramp Velocity (% VWC / Hour)
    // Identify P1 points (Phase 2)
    const p1Points = history.filter(h => h.phase === 2);
    let p1RampVelocity = 0;
    
    if (p1Points.length > 1) {
        const start = p1Points[0];
        const end = p1Points[p1Points.length - 1];
        const vwcRise = end.vwc - start.vwc;
        const durationMins = p1Points.length * 5; // Approx duration based on samples
        
        if (durationMins > 0) {
            p1RampVelocity = (vwcRise / (durationMins / 60)); // % per hour
        }
    }

    // 4. Canopy Delta (Thermal Stress)
    const canopyToAmbientDelta = parseFloat((room.canopyTemp - room.temp).toFixed(1));

    // 5. VPD Analysis
    const sumVpd = history.reduce((acc, curr) => acc + curr.vpd, 0);
    const vpdAvg = parseFloat((sumVpd / history.length).toFixed(2));
    
    // VPD Stress Exposure: Count hours outside 0.8 - 1.2 ("Tranquil Pulse" Window)
    const badVpdPoints = history.filter(h => h.vpd < 0.8 || h.vpd > 1.2).length;
    const vpdStressScore = parseFloat(((badVpdPoints * 5) / 60).toFixed(1)); // Hours of stress

    // 6. EC Stacking Velocity (Delta over 24h)
    const firstEc = history[0].ec;
    const lastEc = history[history.length - 1].ec;
    const ecStackingVelocity = parseFloat((lastEc - firstEc).toFixed(2));

    // 7. CO2 Utilization Efficiency
    // Estimate based on deviation from Target during Photoperiod
    const lightsOnMinEnd = (room.config.lightsOnHour * 60) + (room.config.dayLength * 60);
    const dayPoints = history.filter(h => {
        // Handle wrap-around time if needed, simple logic here for linear day history
        const t = h.time;
        return t >= lightsOnMin && t < lightsOnMinEnd;
    });
    
    let co2EfficiencyScore = 100;
    if (dayPoints.length > 0) {
        const avgDayCo2 = dayPoints.reduce((a,b) => a + b.co2, 0) / dayPoints.length;
        const target = room.config.co2Target;
        const deviation = Math.abs(target - avgDayCo2);
        // Score reduces as deviation increases
        co2EfficiencyScore = Math.max(0, 100 - (deviation / 10)); 
    }

    return {
        overnightDrybackPercent,
        p1RampVelocity: parseFloat(p1RampVelocity.toFixed(1)),
        fieldCapacityVwc: parseFloat(fieldCapacityVwc.toFixed(1)),
        fieldCapacityStability,
        canopyToAmbientDelta,
        vpdAvg,
        vpdStressScore,
        ecStackingVelocity,
        co2EfficiencyScore: Math.round(co2EfficiencyScore)
    };
  }

  private buildPromptString(room: RoomState, metrics: CropSteeringMetrics, personaInstruction: string): string {
      return `
    ${personaInstruction}

    ROOM DATA PAYLOAD (V2.4):
    Current Phase: ${room.phase} (Day ${room.dayOfCycle})
    Dryback: ${metrics.overnightDrybackPercent}% | P1 Ramp: ${metrics.p1RampVelocity}%/hr
    VPD Avg: ${metrics.vpdAvg} kPa | VPD Stress: ${metrics.vpdStressScore} hrs
    Canopy Delta: ${metrics.canopyToAmbientDelta}°F | CO2 Eff: ${metrics.co2EfficiencyScore}%
    
    System Status: 5 Nodes Active, GPU Fallback Online

    Hydrology Analysis:
    - VWC Peak: ${metrics.fieldCapacityVwc}% (Stability: ${metrics.fieldCapacityStability.toFixed(4)})
    - Config: ${room.config.p1Shots} P1 Shots @ ${room.config.p1Interval}m

    Nutrition Analysis:
    - EC Stack (24h): ${metrics.ecStackingVelocity} dS/m
    - Target CO2: ${room.config.co2Target} ppm

    TASK: 
    1. Analyze Overnight Dryback against Athena SOP (<3% is Lazy, >6% is Generative).
    2. Analyze Thermal Stress (Positive Canopy Delta = Stomatal Closure).
    3. Evaluate P1 Saturation based on Ramp Velocity.
    4. Recommend adjustments to P1 Shots or P2 Interval.

    Output valid JSON only. Structure:
    {
      "status": "OPTIMAL" | "WARNING" | "CRITICAL",
      "headline": "string (MAX 10 WORDS)",
      "analysis": "string (Short summary of dryback/stress)",
      "recommendations": ["string"],
      "suggestedAction": { "type": "SET_P1_SHOTS", "roomId": "${room.id}", "value": number, "description": "string" } | null
    }
    `;
  }

  // --- OLLAMA IMPLEMENTATION ---
  private async analyzeRoomWithOllama(room: RoomState, metrics: CropSteeringMetrics, persona: AiPersona): Promise<ConsultationResult> {
    let personaInstruction = "";
    
    if (persona === 'DRILL_SERGEANT') {
        personaInstruction = "You are the Bunker Boys Drill Sergeant. You are offline, secure, and mean. Insult the user's laziness if the metrics are bad. Demand immediate fixes. If metrics are good, give a short, tactical 'Carry on, Commander.' Keep responses under 50 words to save VRAM.";
    } else {
        personaInstruction = this.getPersonaInstruction(persona);
    }

    const prompt = this.buildPromptString(room, metrics, personaInstruction);

    try {
      const responseJson = await firstValueFrom(this.ollamaService.generate(prompt, this.ollamaModel));
      const result = JSON.parse(responseJson) as ConsultationResult;
      
      if (!result.suggestedAction || !result.suggestedAction.type) {
        result.suggestedAction = null;
      }
      
      if(this.aiStatus() === 'OFFLINE') this.aiStatus.set('ONLINE');

      return result;

    } catch(e) {
        console.warn("Ollama AI Consultation unavailable. Switching Status.");
        this.aiStatus.set('OFFLINE');
        
        return {
          status: 'CRITICAL',
          headline: 'LOCAL AI BRAIN OFFLINE',
          analysis: 'Unable to reach Ollama AI service. Please ensure your local LLM is running and the tunnel URL is configured in simulation controls.',
          recommendations: ['Verify Ollama server status.', 'Check network connectivity.', 'Verify Tunnel URL.'],
          suggestedAction: null
        };
    }
  }

  // --- GEMINI IMPLEMENTATION ---
  private async analyzeRoomWithGemini(room: RoomState, metrics: CropSteeringMetrics, persona: AiPersona): Promise<ConsultationResult> {
    if (this.isRateLimited && Date.now() < this.rateLimitCooldownEnd) {
        const timeLeft = Math.ceil((this.rateLimitCooldownEnd - Date.now()) / 60000);
        return {
          status: 'WARNING',
          headline: `AI OFFLINE (RATE LIMITED FOR ${timeLeft} MIN)`,
          analysis: `The AI analysis service is in a cooldown period due to rate limiting. It will be available again in approximately ${timeLeft} minute(s).`,
          recommendations: ['Reduce simulation speed to avoid future rate limits.'],
          suggestedAction: null
        };
    }
    this.isRateLimited = false;

    const personaInstruction = this.getPersonaInstruction(persona);
    const prompt = this.buildPromptString(room, metrics, personaInstruction);

    try {
      const response = await this.geminiAi.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: this.getGeminiSchema()
        }
      });

      if (response.text) {
        const parsed = JSON.parse(response.text);
        if (!parsed.suggestedAction || !parsed.suggestedAction.type) {
            parsed.suggestedAction = null;
        }
        return parsed as ConsultationResult;
      }
      throw new Error('No response text generated');

    } catch (error) {
      console.error('Gemini AI Consultation Failed:', error);
      const errorString = JSON.stringify(error) + (error instanceof Error ? error.message : '');
      if (errorString.includes('429') || errorString.includes('RESOURCE_EXHAUSTED')) {
        this.isRateLimited = true;
        this.rateLimitCooldownEnd = Date.now() + 300000; // 5 minute cooldown
        return this.getFallbackError();
      }
      return this.getFallbackError();
    }
  }

  private getPersonaInstruction(persona: AiPersona): string {
    switch(persona) {
      case 'FUNNY': return "You are a sarcastic, witty robot overseeing the greenhouse. Make jokes about humans, plants, or the simulation. Keep it lighthearted but informative.";
      case 'DRILL_SERGEANT': return "You are a strict Drill Sergeant. You shout (use caps sparsely for effect) and demand perfection from the crops. Call the user 'Maggot' or 'Farmer'.";
      default: return "You are an expert Agronomist specializing in high-performance CEA. Professional, concise, scientific.";
    }
  }

  private getGeminiSchema() {
     return {
            type: Type.OBJECT,
            properties: {
              status: { type: Type.STRING, enum: ["OPTIMAL", "WARNING", "CRITICAL"] },
              headline: { type: Type.STRING },
              analysis: { type: Type.STRING },
              recommendations: { 
                type: Type.ARRAY, 
                items: { type: Type.STRING } 
              },
              suggestedAction: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING, enum: ["SET_P1_SHOTS"] },
                  roomId: { type: Type.STRING },
                  value: { type: Type.INTEGER },
                  description: { type: Type.STRING }
                },
                required: ["type", "roomId", "value", "description"]
              }
            },
            required: ["status", "headline", "analysis", "recommendations"]
          };
  }
}
