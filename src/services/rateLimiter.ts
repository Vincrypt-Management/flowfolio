// Global Rate Limiter for Yahoo Finance API
// Ensures all services share the same rate limit

class GlobalRateLimiter {
  private lastRequestTime: number = 0;
  private requestQueue: Array<() => void> = [];
  private isProcessing: boolean = false;
  
  // Yahoo Finance informal limit: ~2000 requests/hour
  // Using 5 seconds to be very safe and allow time for backend requests too
  private readonly MIN_INTERVAL = 5000; // 5 seconds between requests
  
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
        console.log(`⏳ Rate limit: waiting ${waitTime}ms (queue: ${this.requestQueue.length})...`);
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
