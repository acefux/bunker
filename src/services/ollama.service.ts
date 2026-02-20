import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, map, catchError, throwError } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class OllamaService {
  private http: HttpClient = inject(HttpClient);
  
  // Updated default host to user provided Cloudflare tunnel
  ollamaHost = signal<string>('https://solar-judicial-skirt-enjoying.trycloudflare.com');

  constructor() {
    // Check for saved host in local storage if available
    if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem('ollama_host');
        if (saved) this.ollamaHost.set(saved.trim());
    }
  }

  setHost(url: string) {
      // Ensure no trailing slash and no whitespace
      const cleanUrl = url.trim().replace(/\/$/, '');
      this.ollamaHost.set(cleanUrl);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('ollama_host', cleanUrl);
      }
  }

  /**
   * Sends a prompt to the local Ollama API.
   * @param prompt The full prompt string.
   * @param model The model to use (e.g., 'llama3').
   * @returns An Observable that emits the string content of the AI's response.
   */
  generate(prompt: string, model: string): Observable<string> {
    const apiUrl = `${this.ollamaHost()}/api/generate`;
    
    const payload = {
      model,
      prompt,
      stream: false,
      format: 'json' // Instruct Ollama to ensure the output is valid JSON
    };

    return this.http.post<{ response: string }>(apiUrl, payload).pipe(
      map((response: any) => response.response),
      catchError((error: HttpErrorResponse) => {
        console.error("Ollama Service Error:", error);
        let errorMessage = 'Unknown Error connecting to Ollama.';
        
        if (error.status === 0) {
            errorMessage = `Connection refused to ${this.ollamaHost()}. If using a Cloudflare Tunnel, ensure it is active and OLLAMA_ORIGINS="*" is set on the server.`;
        } else if (error.status === 404) {
            errorMessage = `Model '${model}' not found. Run 'ollama pull ${model}' in your terminal.`;
        } else {
            errorMessage = `Ollama Server Error: ${error.status} ${error.statusText}`;
        }
        
        return throwError(() => new Error(errorMessage));
      })
    );
  }
}