/**
 * Mock API Server for testing using nock
 * Provides configurable responses for all API endpoints
 */

import nock from 'nock';
import { 
  AuthResponse, 
  Campaign, 
  PaginatedResponse, 
  SyncResponse 
} from '../../src/types';
import { 
  createMockAuthResponse, 
  createMockCampaign, 
  createMockCampaigns,
  createMockPaginatedResponse,
  createMockSyncResponse 
} from './fixtures';

/**
 * Mock API configuration
 */
export interface MockApiConfig {
  baseUrl: string;
  authDelay?: number;
  fetchDelay?: number;
  syncDelay?: number;
  failureRate?: number;
  enable503Errors?: boolean;
  enableTimeouts?: boolean;
  enableRateLimits?: boolean;
}

/**
 * Request tracking
 */
export interface RequestLog {
  method: string;
  path: string;
  timestamp: number;
  headers?: Record<string, string>;
  body?: unknown;
}

/**
 * Mock API Server class
 */
export class MockApiServer {
  private config: MockApiConfig;
  private requestLogs: RequestLog[] = [];
  private rateLimitCounter = 0;
  private scope: nock.Scope | null = null;

  constructor(config: Partial<MockApiConfig> = {}) {
    this.config = {
      baseUrl: config.baseUrl || 'http://localhost:3001',
      authDelay: config.authDelay || 0,
      fetchDelay: config.fetchDelay || 0,
      syncDelay: config.syncDelay || 0,
      failureRate: config.failureRate || 0,
      enable503Errors: config.enable503Errors || false,
      enableTimeouts: config.enableTimeouts || false,
      enableRateLimits: config.enableRateLimits || false,
    };
  }

  /**
   * Start the mock server
   */
  public start(): void {
    this.scope = nock(this.config.baseUrl);
    this.setupAuthEndpoint();
    this.setupCampaignsEndpoints();
    this.setupSyncEndpoints();
  }

  /**
   * Stop the mock server
   */
  public stop(): void {
    if (this.scope) {
      nock.cleanAll();
      this.scope = null;
    }
    this.requestLogs = [];
    this.rateLimitCounter = 0;
  }

  /**
   * Reset request logs
   */
  public resetLogs(): void {
    this.requestLogs = [];
    this.rateLimitCounter = 0;
  }

  /**
   * Get request logs
   */
  public getRequestLogs(): RequestLog[] {
    return [...this.requestLogs];
  }

  /**
   * Get request count
   */
  public getRequestCount(): number {
    return this.requestLogs.length;
  }

  /**
   * Setup authentication endpoint
   */
  private setupAuthEndpoint(): void {
    if (!this.scope) return;

    this.scope
      .post('/api/auth/login')
      .reply((uri, requestBody) => {
        this.logRequest('POST', uri);

        // Simulate delay
        if (this.config.authDelay) {
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve([200, createMockAuthResponse()]);
            }, this.config.authDelay);
          });
        }

        return [200, createMockAuthResponse()];
      })
      .persist();
  }

  /**
   * Setup campaigns fetch endpoints
   */
  private setupCampaignsEndpoints(): void {
    if (!this.scope) return;

    this.scope
      .get(/\/api\/campaigns/)
      .query(true)
      .reply((uri) => {
        this.logRequest('GET', uri);

        // Check rate limit
        if (this.config.enableRateLimits && this.shouldRateLimit()) {
          return [
            429,
            { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded' } },
            { 'Retry-After': '60' },
          ];
        }

        // Simulate 503 error
        if (this.config.enable503Errors && this.shouldFail()) {
          return [
            503,
            { error: { code: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable' } },
          ];
        }

        // Parse query parameters
        const url = new URL(uri, this.config.baseUrl);
        const page = parseInt(url.searchParams.get('page') || '1', 10);
        const perPage = parseInt(url.searchParams.get('per_page') || '10', 10);

        // Generate campaigns for this page
        const totalCampaigns = 100;
        const startIndex = (page - 1) * perPage;
        const campaigns = createMockCampaigns(perPage).map((c, i) => ({
          ...c,
          id: `campaign_${startIndex + i + 1}`,
          name: `Campaign ${startIndex + i + 1}`,
        }));

        const response = createMockPaginatedResponse(
          campaigns,
          page,
          perPage,
          totalCampaigns
        );

        // Simulate delay
        if (this.config.fetchDelay) {
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve([200, response]);
            }, this.config.fetchDelay);
          });
        }

        return [200, response];
      })
      .persist();
  }

  /**
   * Setup campaign sync endpoints
   */
  private setupSyncEndpoints(): void {
    if (!this.scope) return;

    this.scope
      .post(/\/api\/campaigns\/[^/]+\/sync/)
      .reply((uri) => {
        this.logRequest('POST', uri);

        // Extract campaign ID
        const match = uri.match(/\/api\/campaigns\/([^/]+)\/sync/);
        const campaignId = match ? match[1] : 'unknown';

        // Check rate limit
        if (this.config.enableRateLimits && this.shouldRateLimit()) {
          return [
            429,
            { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded' } },
            { 'Retry-After': '60' },
          ];
        }

        // Simulate 503 error
        if (this.config.enable503Errors && this.shouldFail()) {
          return [
            503,
            { error: { code: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable' } },
          ];
        }

        // Simulate timeout (by delaying response significantly)
        if (this.config.enableTimeouts && Math.random() < 0.1) {
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve([200, createMockSyncResponse(campaignId)]);
            }, 15000); // 15 second delay to cause timeout
          });
        }

        const response = createMockSyncResponse(campaignId);

        // Simulate delay
        if (this.config.syncDelay) {
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve([200, response]);
            }, this.config.syncDelay);
          });
        }

        return [200, response];
      })
      .persist();
  }

  /**
   * Log request
   */
  private logRequest(method: string, path: string): void {
    this.requestLogs.push({
      method,
      path,
      timestamp: Date.now(),
    });
    this.rateLimitCounter++;
  }

  /**
   * Check if should fail (based on failure rate)
   */
  private shouldFail(): boolean {
    return Math.random() < (this.config.failureRate || 0);
  }

  /**
   * Check if should rate limit (10 requests per window)
   */
  private shouldRateLimit(): boolean {
    // Reset counter every 60 seconds
    if (this.requestLogs.length > 0) {
      const oldestRequest = this.requestLogs[0].timestamp;
      const now = Date.now();
      if (now - oldestRequest > 60000) {
        this.rateLimitCounter = 1;
        return false;
      }
    }

    return this.rateLimitCounter > 10;
  }

  /**
   * Configure specific endpoint behavior
   */
  public mockEndpoint(
    method: string,
    path: string | RegExp,
    statusCode: number,
    response: unknown,
    headers?: Record<string, string>
  ): void {
    if (!this.scope) {
      this.start();
    }

    const methodLower = method.toLowerCase() as 'get' | 'post' | 'put' | 'delete';
    
    if (this.scope) {
      const interceptor = typeof path === 'string'
        ? this.scope[methodLower](path)
        : this.scope[methodLower](path);

      if (headers) {
        interceptor.reply(statusCode, response, headers);
      } else {
        interceptor.reply(statusCode, response);
      }
    }
  }

  /**
   * Mock authentication failure
   */
  public mockAuthFailure(): void {
    if (this.scope) {
      nock.cleanAll();
      this.scope = nock(this.config.baseUrl);
      
      this.scope
        .post('/api/auth/login')
        .reply(401, {
          error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
        })
        .persist();
    }
  }

  /**
   * Mock specific campaign sync failure
   */
  public mockCampaignSyncFailure(campaignId: string, statusCode: number): void {
    if (!this.scope) {
      this.start();
    }

    if (this.scope) {
      this.scope
        .post(`/api/campaigns/${campaignId}/sync`)
        .reply(statusCode, {
          error: { code: 'SYNC_FAILED', message: 'Campaign sync failed' },
        });
    }
  }
}

/**
 * Create mock API server instance
 */
export function createMockApiServer(config?: Partial<MockApiConfig>): MockApiServer {
  return new MockApiServer(config);
}

/**
 * Helper to setup and teardown mock API in tests
 */
export function withMockApi(config?: Partial<MockApiConfig>) {
  const mockApi = createMockApiServer(config);

  beforeAll(() => {
    mockApi.start();
  });

  afterAll(() => {
    mockApi.stop();
  });

  beforeEach(() => {
    mockApi.resetLogs();
  });

  return mockApi;
}