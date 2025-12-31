/**
 * RateLimiter unit tests
 */

import { RateLimiter } from '../../../src/api/RateLimiter';
import { sleep, waitFor } from '../../helpers/testUtils';

describe('RateLimiter', () => {
  describe('Sliding Window', () => {
    it('should allow 10 requests within 60 seconds', async () => {
      const rateLimiter = new RateLimiter({
        maxRequests: 10,
        windowMs: 60000,
      });

      const results: string[] = [];

      // Make 10 requests
      for (let i = 0; i < 10; i++) {
        await rateLimiter.execute(async () => {
          results.push(`request_${i + 1}`);
          return `request_${i + 1}`;
        });
      }

      expect(results).toHaveLength(10);
      expect(rateLimiter.getInfo().remaining).toBe(0);
    });

    it('should block 11th request within 60 seconds', async () => {
      const rateLimiter = new RateLimiter({
        maxRequests: 10,
        windowMs: 1000, // 1 second for faster test
      });

      const results: string[] = [];
      const startTime = Date.now();

      // Make 11 requests
      const promises = Array.from({ length: 11 }, (_, i) =>
        rateLimiter.execute(async () => {
          results.push(`request_${i + 1}`);
          return `request_${i + 1}`;
        })
      );

      await Promise.all(promises);

      const duration = Date.now() - startTime;

      expect(results).toHaveLength(11);
      // 11th request should have been queued and waited
      expect(duration).toBeGreaterThan(900); // At least 900ms (close to 1 second)
    });

    it('should allow request after 60 seconds elapsed', async () => {
      const rateLimiter = new RateLimiter({
        maxRequests: 10,
        windowMs: 100, // 100ms for faster test
      });

      // Make 10 requests to fill the limit
      for (let i = 0; i < 10; i++) {
        await rateLimiter.execute(async () => `request_${i}`);
      }

      expect(rateLimiter.getInfo().remaining).toBe(0);

      // Wait for window to reset
      await sleep(150);

      // Should allow new request
      expect(rateLimiter.canMakeRequest()).toBe(true);

      const result = await rateLimiter.execute(async () => 'new_request');
      expect(result).toBe('new_request');
    });

    it('should properly track sliding window', async () => {
      const rateLimiter = new RateLimiter({
        maxRequests: 5,
        windowMs: 1000,
      });

      // Make 3 requests
      for (let i = 0; i < 3; i++) {
        await rateLimiter.execute(async () => `request_${i}`);
      }

      expect(rateLimiter.getInfo().remaining).toBe(2);

      // Wait 600ms
      await sleep(600);

      // Make 2 more requests
      for (let i = 0; i < 2; i++) {
        await rateLimiter.execute(async () => `request_${i}`);
      }

      expect(rateLimiter.getInfo().remaining).toBe(0);

      // Wait 500ms more (first 3 requests should expire)
      await sleep(500);

      // Should have 3 slots available now
      expect(rateLimiter.getInfo().remaining).toBe(3);
    });
  });

  describe('Request Queue', () => {
    it('should queue requests when rate limit hit', async () => {
      const rateLimiter = new RateLimiter({
        maxRequests: 3,
        windowMs: 1000,
      });

      const results: string[] = [];

      // Make 6 requests (3 immediate, 3 queued)
      const promises = Array.from({ length: 6 }, (_, i) =>
        rateLimiter.execute(async () => {
          results.push(`request_${i + 1}`);
          return `request_${i + 1}`;
        })
      );

      // First 3 should execute immediately
      await sleep(50);
      expect(results).toHaveLength(3);
      expect(rateLimiter.getQueueLength()).toBe(3);

      // Wait for queue to process
      await Promise.all(promises);

      expect(results).toHaveLength(6);
      expect(rateLimiter.getQueueLength()).toBe(0);
    });

    it('should process queued requests when capacity available', async () => {
      const rateLimiter = new RateLimiter({
        maxRequests: 2,
        windowMs: 500,
      });

      const executionOrder: number[] = [];

      // Fill rate limit
      await rateLimiter.execute(async () => {
        executionOrder.push(1);
        return 1;
      });
      await rateLimiter.execute(async () => {
        executionOrder.push(2);
        return 2;
      });

      // Queue additional requests
      const promise3 = rateLimiter.execute(async () => {
        executionOrder.push(3);
        return 3;
      });
      const promise4 = rateLimiter.execute(async () => {
        executionOrder.push(4);
        return 4;
      });

      expect(rateLimiter.getQueueLength()).toBeGreaterThan(0);

      // Wait for window to reset and queue to process
      await Promise.all([promise3, promise4]);

      expect(executionOrder).toHaveLength(4);
      expect(rateLimiter.getQueueLength()).toBe(0);
    });

    it('should maintain request order in queue (FIFO)', async () => {
      const rateLimiter = new RateLimiter({
        maxRequests: 1,
        windowMs: 200,
      });

      const executionOrder: number[] = [];

      // Execute first request
      await rateLimiter.execute(async () => {
        executionOrder.push(1);
      });

      // Queue multiple requests
      const promises = [
        rateLimiter.execute(async () => {
          executionOrder.push(2);
        }),
        rateLimiter.execute(async () => {
          executionOrder.push(3);
        }),
        rateLimiter.execute(async () => {
          executionOrder.push(4);
        }),
      ];

      await Promise.all(promises);

      // Should execute in order: 1, 2, 3, 4
      expect(executionOrder).toEqual([1, 2, 3, 4]);
    });

    it('should handle priority queue correctly', async () => {
      const rateLimiter = new RateLimiter({
        maxRequests: 1,
        windowMs: 200,
      });

      const executionOrder: string[] = [];

      // Execute first request to fill limit
      await rateLimiter.execute(async () => {
        executionOrder.push('first');
      });

      // Queue requests with different priorities
      const lowPriority = rateLimiter.execute(
        async () => {
          executionOrder.push('low');
        },
        0 // Low priority
      );

      const highPriority = rateLimiter.execute(
        async () => {
          executionOrder.push('high');
        },
        10 // High priority
      );

      const mediumPriority = rateLimiter.execute(
        async () => {
          executionOrder.push('medium');
        },
        5 // Medium priority
      );

      await Promise.all([lowPriority, highPriority, mediumPriority]);

      // High priority should execute before medium and low
      expect(executionOrder[0]).toBe('first');
      expect(executionOrder[1]).toBe('high');
      expect(executionOrder[2]).toBe('medium');
      expect(executionOrder[3]).toBe('low');
    });
  });

  describe('Rate Limit Info', () => {
    it('should return correct remaining capacity', () => {
      const rateLimiter = new RateLimiter({
        maxRequests: 10,
        windowMs: 60000,
      });

      const info = rateLimiter.getInfo();
      expect(info.remaining).toBe(10);
      expect(info.total).toBe(10);
    });

    it('should update remaining capacity after requests', async () => {
      const rateLimiter = new RateLimiter({
        maxRequests: 5,
        windowMs: 60000,
      });

      await rateLimiter.execute(async () => 'test1');
      expect(rateLimiter.getInfo().remaining).toBe(4);

      await rateLimiter.execute(async () => 'test2');
      expect(rateLimiter.getInfo().remaining).toBe(3);

      await rateLimiter.execute(async () => 'test3');
      expect(rateLimiter.getInfo().remaining).toBe(2);
    });

    it('should calculate correct reset time', async () => {
      const rateLimiter = new RateLimiter({
        maxRequests: 10,
        windowMs: 1000,
      });

      const beforeTime = Date.now();
      await rateLimiter.execute(async () => 'test');
      const info = rateLimiter.getInfo();

      expect(info.resetAt).toBeGreaterThanOrEqual(beforeTime + 1000);
      expect(info.resetAt).toBeLessThanOrEqual(beforeTime + 1100);
    });
  });

  describe('Wait for Reset', () => {
    it('should not wait if capacity available', async () => {
      const rateLimiter = new RateLimiter({
        maxRequests: 10,
        windowMs: 60000,
      });

      const startTime = Date.now();
      await rateLimiter.waitForReset();
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(50); // Should be immediate
    });

    it('should wait until reset if no capacity', async () => {
      const rateLimiter = new RateLimiter({
        maxRequests: 2,
        windowMs: 500,
      });

      // Fill rate limit
      await rateLimiter.execute(async () => 'test1');
      await rateLimiter.execute(async () => 'test2');

      expect(rateLimiter.getInfo().remaining).toBe(0);

      const startTime = Date.now();
      await rateLimiter.waitForReset();
      const duration = Date.now() - startTime;

      // Should have waited approximately 500ms
      expect(duration).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Clear State', () => {
    it('should clear all state', async () => {
      const rateLimiter = new RateLimiter({
        maxRequests: 5,
        windowMs: 60000,
      });

      // Make some requests
      await rateLimiter.execute(async () => 'test1');
      await rateLimiter.execute(async () => 'test2');

      expect(rateLimiter.getInfo().remaining).toBe(3);

      // Clear state
      rateLimiter.clear();

      // Should be back to full capacity
      expect(rateLimiter.getInfo().remaining).toBe(5);
      expect(rateLimiter.getQueueLength()).toBe(0);
    });
  });
});