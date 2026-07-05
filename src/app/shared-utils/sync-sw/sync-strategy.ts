// Sync strategies for different network conditions and priorities

export type SyncStrategyType = 'immediate' | 'background' | 'batch';

export class SyncStrategy {
  private retryCount = 0;
  private maxRetries = 5;
  private baseDelay = 1000; // 1 second

  async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    try {
      const result = await fn();
      this.retryCount = 0; // Reset on success
      return result;
    } catch (error) {
      if (this.retryCount < this.maxRetries) {
        const delay = this.calculateDelay();
        console.warn(`Sync failed, retrying in ${delay}ms...`, error);

        await new Promise(resolve => setTimeout(resolve, delay));
        this.retryCount++;

        return this.executeWithRetry(fn);
      }

      console.error('Max retries exceeded:', error);
      throw error;
    }
  }

  private calculateDelay(): number {
    // Exponential backoff with jitter
    const exponentialDelay = this.baseDelay * Math.pow(2, this.retryCount);
    const jitter = Math.random() * 0.5 * exponentialDelay;
    return exponentialDelay + jitter;
  }

  reset(): void {
    this.retryCount = 0;
  }

  getStrategyForNetwork(): SyncStrategyType {
    if (!navigator.onLine) {
      return 'batch'; // Queue for later when offline
    }

    // Check connection quality (simplified)
    const connection = (navigator as any).connection;
    if (connection) {
      if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') {
        return 'batch'; // Conserve bandwidth
      }
    }

    return 'immediate'; // Fast networks can sync immediately
  }
}