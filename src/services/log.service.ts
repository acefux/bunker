
import { Injectable, signal } from '@angular/core';
import { LogEntry, LogLevel } from '../models';

@Injectable({
  providedIn: 'root'
})
export class LogService {
  private readonly MAX_LOGS = 300; // Increased for telemetry buffer
  logs = signal<LogEntry[]>([]);

  constructor() {
    this.logInfo('Log Service Initialized. System boot.');
  }

  log(level: LogLevel | 'PHYSICS', message: string) {
    const newEntry: LogEntry = { timestamp: new Date(), level: level as any, message };
    this.logs.update(currentLogs => {
      const updatedLogs = [newEntry, ...currentLogs];
      if (updatedLogs.length > this.MAX_LOGS) {
        return updatedLogs.slice(0, this.MAX_LOGS);
      }
      return updatedLogs;
    });
  }

  logInfo(message: string) {
    this.log('INFO', message);
  }

  logAction(message: string) {
    this.log('ACTION', message);
  }

  logWarning(message: string) {
    this.log('WARN', message);
  }

  logCritical(message: string) {
    this.log('CRITICAL', message);
  }
}
