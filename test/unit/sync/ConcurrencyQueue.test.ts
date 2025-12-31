/**
 * ConcurrencyQueue unit tests
 */

import { ConcurrencyQueue } from '../../../src/sync/ConcurrencyQueue';
import { sleep, createCallCounter } from '../../helpers/testUtils';

describe('ConcurrencyQueue', () => {
  describe('Concurrency Control', () => {
    it('should limit concurrent executions to max concurrency', async () => {
      const maxConcurrent = 3;
      const queue = new ConcurrencyQueue<string>(maxConcurrent);
      
      let currentlyRunning = 0;
      let maxSeen = 0;

      const createTask = (id: number) => async () => {
        currentlyRunning++;
        maxSeen = Math.max(maxSeen, currentlyRunning);
        
        await sleep(50);
        
        currentlyRunning--;
        return `task_${id}`;
      };

      // Add 10 tasks
      const promises = Array.from({ length: 10 }, (_, i) =>
        queue.add(createTask(i + 1))
      );

      await Promise.all(promises);

      // Should never have exceeded max concurrent
      expect(maxSeen).toBeLessThanOrEqual(maxConcurrent);
      expect(maxSeen).toBe(maxConcurrent);
    });

    it('should process remaining tasks after completions', async () => {
      const queue = new ConcurrencyQueue<number>(2);
      
      const results: number[] = [];

      const createTask = (value: number) => async () => {
        await sleep(10);
        results.push(value);
        return value;
      };

      // Add 5 tasks with concurrency 2
      const promises = [1, 2, 3, 4, 5].map(n => queue.add(createTask(n)));

      await Promise.all(promises);

      // All tasks should complete
      expect(results).toHaveLength(5);
      expect(results.sort()).toEqual([1, 2, 3, 4, 5]);
    });

    it('should handle task failures without blocking queue', async () => {
      const queue = new ConcurrencyQueue<string>(2);
      
      const results: Array<string | Error> = [];

      const successTask = async (id: string) => {
        await sleep(10);
        return id;
      };

      const failTask = async (id: string) => {
        await sleep(10);
        throw new Error(`Task ${id} failed`);
      };

      // Mix of success and failure tasks
      const promises = [
        queue.add(() => successTask('1')).catch(e => e),
        queue.add(() => failTask('2')).catch(e => e),
        queue.add(() => successTask('3')).catch(e => e),
        queue.add(() => failTask('4')).catch(e => e),
        queue.add(() => successTask('5')).catch(e => e),
      ];

      const settled = await Promise.all(promises);

      // Should have 3 successes and 2 failures
      const successes = settled.filter(r => typeof r === 'string');
      const failures = settled.filter(r => r instanceof Error);

      expect(successes).toHaveLength(3);
      expect(failures).toHaveLength(2);
    });

    it('should track active and pending tasks correctly', async () => {
      const queue = new ConcurrencyQueue<number>(2);

      const taskWithDelay = async (value: number) => {
        await sleep(100);
        return value;
      };

      // Add 5 tasks
      const promise1 = queue.add(() => taskWithDelay(1));
      const promise2 = queue.add(() => taskWithDelay(2));
      const promise3 = queue.add(() => taskWithDelay(3));
      const promise4 = queue.add(() => taskWithDelay(4));
      const promise5 = queue.add(() => taskWithDelay(5));

      // Wait a bit for tasks to start
      await sleep(20);

      // Should have 2 active, 3 pending
      const stats = queue.getStats();
      expect(stats.active).toBe(2);
      expect(stats.pending).toBe(3);

      // Wait for all to complete
      await Promise.all([promise1, promise2, promise3, promise4, promise5]);

      // Should have 5 completed, 0 active, 0 pending
      const finalStats = queue.getStats();
      expect(finalStats.completed).toBe(5);
      expect(finalStats.active).toBe(0);
      expect(finalStats.pending).toBe(0);
    });
  });

  describe('Task Priority', () => {
    it('should process high priority tasks first', async () => {
      const queue = new ConcurrencyQueue<string>(1); // Only 1 concurrent
      
      const executionOrder: string[] = [];

      // First task to fill the concurrent slot
      await queue.add(async () => {
        executionOrder.push('first');
        await sleep(50);
        return 'first';
      });

      // Queue tasks with different priorities
      const lowPriority = queue.add(
        async () => {
          executionOrder.push('low');
          return 'low';
        },
        0 // Low priority
      );

      const highPriority = queue.add(
        async () => {
          executionOrder.push('high');
          return 'high';
        },
        10 // High priority
      );

      const mediumPriority = queue.add(
        async () => {
          executionOrder.push('medium');
          return 'medium';
        },
        5 // Medium priority
      );

      await Promise.all([lowPriority, highPriority, mediumPriority]);

      // Should execute in priority order after first
      expect(executionOrder).toEqual(['first', 'high', 'medium', 'low']);
    });

    it('should use FIFO for same priority tasks', async () => {
      const queue = new ConcurrencyQueue<number>(1);
      
      const executionOrder: number[] = [];

      // Fill concurrent slot
      await queue.add(async () => {
        executionOrder.push(0);
        return 0;
      });

      // Queue multiple tasks with same priority
      const promises = [1, 2, 3, 4, 5].map(n =>
        queue.add(
          async () => {
            executionOrder.push(n);
            return n;
          },
          5 // Same priority for all
        )
      );

      await Promise.all(promises);

      // Should maintain insertion order
      expect(executionOrder).toEqual([0, 1, 2, 3, 4, 5]);
    });
  });

  describe('Queue Statistics', () => {
    it('should track completed task count', async () => {
      const queue = new ConcurrencyQueue<number>(3);

      const tasks = [1, 2, 3, 4, 5].map(n =>
        queue.add(async () => n)
      );

      await Promise.all(tasks);

      const stats = queue.getStats();
      expect(stats.completed).toBe(5);
    });

    it('should track failed task count', async () => {
      const queue = new ConcurrencyQueue<number>(2);

      const tasks = [
        queue.add(async () => 1).catch(() => null),
        queue.add(async () => { throw new Error('fail'); }).catch(() => null),
        queue.add(async () => 3).catch(() => null),
        queue.add(async () => { throw new Error('fail'); }).catch(() => null),
      ];

      await Promise.all(tasks);

      const stats = queue.getStats();
      expect(stats.completed).toBe(2);
      expect(stats.failed).toBe(2);
    });

    it('should return correct queue length', () => {
      const queue = new ConcurrencyQueue<number>(1);

      // Fill concurrent slot
      queue.add(async () => {
        await sleep(100);
        return 1;
      });

      // Queue more tasks
      queue.add(async () => 2);
      queue.add(async () => 3);
      queue.add(async () => 4);

      expect(queue.getQueueLength()).toBe(3);
    });

    it('should return correct active count', async () => {
      const queue = new ConcurrencyQueue<number>(3);

      // Add tasks that take some time
      queue.add(async () => {
        await sleep(100);
        return 1;
      });
      queue.add(async () => {
        await sleep(100);
        return 2;
      });
      queue.add(async () => {
        await sleep(100);
        return 3;
      });

      // Wait for tasks to start
      await sleep(20);

      expect(queue.getActiveCount()).toBe(3);
    });
  });

  describe('Queue State Management', () => {
    it('should report idle when no tasks', () => {
      const queue = new ConcurrencyQueue<number>(3);
      expect(queue.isIdle()).toBe(true);
    });

    it('should report not idle when tasks running', async () => {
      const queue = new ConcurrencyQueue<number>(3);

      const promise = queue.add(async () => {
        await sleep(50);
        return 1;
      });

      await sleep(10);
      expect(queue.isIdle()).toBe(false);

      await promise;
      expect(queue.isIdle()).toBe(true);
    });

    it('should wait for idle correctly', async () => {
      const queue = new ConcurrencyQueue<number>(2);

      // Add tasks
      const promises = [1, 2, 3, 4].map(n =>
        queue.add(async () => {
          await sleep(50);
          return n;
        })
      );

      const startTime = Date.now();
      await queue.waitForIdle();
      const duration = Date.now() - startTime;

      // Should have waited for all tasks
      expect(queue.isIdle()).toBe(true);
      expect(duration).toBeGreaterThanOrEqual(90); // At least ~100ms for 4 tasks with concurrency 2

      // All promises should be resolved
      const results = await Promise.all(promises);
      expect(results).toHaveLength(4);
    });

    it('should clear queue correctly', async () => {
      const queue = new ConcurrencyQueue<number>(1);

      // Fill queue
      queue.add(async () => {
        await sleep(100);
        return 1;
      });
      queue.add(async () => 2);
      queue.add(async () => 3);

      await sleep(20);
      expect(queue.getQueueLength()).toBeGreaterThan(0);

      // Clear queue
      queue.clear();

      expect(queue.getQueueLength()).toBe(0);
      const stats = queue.getStats();
      expect(stats.pending).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero max concurrency by throwing', () => {
      expect(() => {
        new ConcurrencyQueue<number>(0);
      }).toThrow();
    });

    it('should handle negative max concurrency by throwing', () => {
      expect(() => {
        new ConcurrencyQueue<number>(-1);
      }).toThrow();
    });

    it('should handle empty queue operations', () => {
      const queue = new ConcurrencyQueue<number>(3);

      expect(queue.getQueueLength()).toBe(0);
      expect(queue.getActiveCount()).toBe(0);
      expect(queue.isIdle()).toBe(true);
      
      const stats = queue.getStats();
      expect(stats.pending).toBe(0);
      expect(stats.active).toBe(0);
    });

    it('should handle rapid task additions', async () => {
      const queue = new ConcurrencyQueue<number>(3);
      const results: number[] = [];

      // Add 100 tasks rapidly
      const promises = Array.from({ length: 100 }, (_, i) =>
        queue.add(async () => {
          results.push(i);
          return i;
        })
      );

      await Promise.all(promises);

      expect(results).toHaveLength(100);
      expect(queue.isIdle()).toBe(true);
    });
  });
});