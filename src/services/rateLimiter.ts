// Global Rate Limiter for Free-Tier API providers
// Ensures all services share the same rate limit for APIs with strict limits
// OPTIMIZED: Conservative limits to stay within free tiers

class GlobalRateLimiter {
  private lastRequestTime: number = 0;
  private requestQueue: Array<() => void> = [];
  private isProcessing: boolean = false;
  
  // Optimized for free tier APIs (especially Alpha Vantage @ 5/min)
  // Using 12 seconds between requests = max 5/min (conservative)
  // Yahoo Finance informal limit: ~2000 requests/hour (very generous)
  private readonly MIN_INTERVAL = 12000; // 12 seconds between requests (reduced API load)
  
  async waitForSlot(): Promise<void> {
    return new Promise((resolve) => {
      this.requestQueue.push(resolve);
      this.processQueue();
    });
  }
  
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.requestQueue.length === 0) return;
    
    this.isProcessing = true;
    
    while (this.requestQueue.length > 0) {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      
      if (timeSinceLastRequest < this.MIN_INTERVAL) {
        const waitTime = this.MIN_INTERVAL - timeSinceLastRequest;
        console.log(`[INFO] Rate limit (free tier): waiting ${waitTime}ms (queue: ${this.requestQueue.length})...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      
      this.lastRequestTime = Date.now();
      const resolve = this.requestQueue.shift();
      if (resolve) resolve();
    }
    
    this.isProcessing = false;
  }
  
  // Get estimated wait time for UI feedback
  getEstimatedWaitTime(queuePosition: number): number {
    return queuePosition * this.MIN_INTERVAL;
  }
  
  getQueueLength(): number {
    return this.requestQueue.length;
  }
}

// Singleton instance
export const globalRateLimiter = new GlobalRateLimiter();
