
import { GoogleGenAI, Type } from "@google/genai";
import { RoomState, RoomConfig, HealingAction } from '../models';

export class SelfHealingService {
  private ai: GoogleGenAI;
  private changes: { parameter: string, from: any, to: any, log: string }[] = [];
  private lastReason = '';

  constructor() {
     const apiKey = (typeof process !== 'undefined' && process.env) ? process.env['API_KEY'] : '';
     this.ai = new GoogleGenAI({ apiKey });
  }

  getChanges() {
    return this.changes;
  }
  
  getLastChangeReason(): string {
    return this.lastReason;
  }

  getCurrentConfig(): Partial<RoomConfig> {
    const config: Partial<RoomConfig> = {};
    this.changes.forEach(change => {
        (config as any)[change.parameter] = change.to;
    });
    return config;
  }

  async attemptFix(errorLog: string, roomState: RoomState): Promise<Partial<RoomConfig> | null> {
    const prompt = `
      You are an autonomous self-healing controller for a simulated CEA facility.
      A critical error occurred during a high-speed simulation. Your task is to analyze the error and the room's configuration and provide a single, precise configuration change to fix the issue.

      ERROR LOG: "${errorLog}"

      STATE AT FAILURE:
      - Room Name: ${roomState.name}
      - Day of Cycle: ${roomState.dayOfCycle}
      - Phase: ${roomState.phase}
      - VWC: ${roomState.vwc}%
      - VPD: ${roomState.vpd} kPa

      CURRENT CONFIGURATION:
      - P1 Shots (Count): ${roomState.config.p1Shots}
      - P1 Interval (Min): ${roomState.config.p1Interval}
      - P2 Interval (Min): ${roomState.config.p2Interval}
      - Lights On Hour: ${roomState.config.lightsOnHour}
      - Day Length: ${roomState.config.dayLength}

      RULE: Based on the error, determine which single configuration parameter is most likely the cause.
      - If VWC is too low (plant died from dehydration), you must INCREASE 'p1Shots' by 1 or DECREASE 'p1Interval' by a small amount (e.g., 5-10 minutes). Increasing shots is preferred.
      - If VWC is too high (hypothetical error), you should DECREASE 'p1Shots'.
      - Only modify one parameter per attempt.

      Your response MUST be a valid JSON object following the schema. Do not provide any other text or explanation.
    `;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              action: { type: Type.STRING, enum: ["UPDATE_CONFIG"] },
              parameter: { type: Type.STRING },
              value: { type: Type.NUMBER },
              reason: { type: Type.STRING },
            },
            required: ["action", "parameter", "value", "reason"],
          }
        }
      });

      if (response.text) {
        const parsed = JSON.parse(response.text) as HealingAction;
        
        if (!Object.keys(roomState.config).includes(parsed.parameter)) {
          console.error(`[SelfHeal] AI suggested invalid parameter: ${parsed.parameter}`);
          this.lastReason = `AI failed: invalid parameter suggestion.`;
          return null;
        }

        const oldValue = (roomState.config as any)[parsed.parameter];
        const changeLog = `${parsed.parameter} changed from ${oldValue} to ${parsed.value}`;
        
        this.changes.push({ 
            parameter: parsed.parameter, 
            from: oldValue, 
            to: parsed.value,
            log: changeLog 
        });
        this.lastReason = parsed.reason;

        return { [parsed.parameter]: parsed.value };
      }
      return null;
    } catch (e) {
      console.error("[SelfHeal] AI query failed:", e);
      this.lastReason = `AI query failed.`;
      return null;
    }
  }
}
