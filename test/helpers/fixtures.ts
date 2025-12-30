/**
 * Test data fixtures
 */

import { Campaign, Token, PaginatedResponse, SyncResponse, AuthResponse } from '../../src/types';

/**
 * Create mock campaign
 */
export function createMockCampaign(overrides?: Partial<Campaign>): Campaign {
  return {
    id: 'campaign_test_1',
    name: 'Test Campaign',
    status: 'active',
    budget: 5000,
    impressions: 10000,
    clicks: 500,
    conversions: 25,
    created_at: '2024-12-01T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * Create multiple mock campaigns
 */
export function createMockCampaigns(count: number): Campaign[] {
  return Array.from({ length: count }, (_, i) => createMockCampaign({
    id: `campaign_${i + 1}`,
    name: `Campaign ${i + 1}`,
  }));
}

/**
 * Create mock token
 */
export function createMockToken(overrides?: Partial<Token>): Token {
  return {
    access_token: 'mock_token_12345',
    token_type: 'Bearer',
    expires_in: 3600,
    issued_at: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

/**
 * Create expired mock token
 */
export function createExpiredToken(): Token {
  return createMockToken({
    issued_at: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
    expires_in: 3600, // 1 hour expiry
  });
}

/**
 * Create mock auth response
 */
export function createMockAuthResponse(overrides?: Partial<AuthResponse>): AuthResponse {
  return {
    access_token: 'mock_token_12345',
    token_type: 'Bearer',
    expires_in: 3600,
    ...overrides,
  };
}

/**
 * Create mock paginated response
 */
export function createMockPaginatedResponse<T>(
  data: T[],
  page: number,
  perPage: number,
  total: number
): PaginatedResponse<T> {
  return {
    data,
    pagination: {
      page,
      per_page: perPage,
      total,
      has_more: page * perPage < total,
    },
  };
}

/**
 * Create mock sync response
 */
export function createMockSyncResponse(campaignId: string, success = true): SyncResponse {
  return {
    success,
    campaign_id: campaignId,
    synced_at: new Date().toISOString(),
    message: success ? 'Campaign synced successfully' : 'Sync failed',
  };
}

/**
 * Create campaign with SQL injection attempt
 */
export function createSqlInjectionCampaign(): Campaign {
  return createMockCampaign({
    id: "'; DROP TABLE campaigns; --",
    name: "Test'; DELETE FROM campaigns WHERE '1'='1",
  });
}

/**
 * Create campaign with special characters
 */
export function createSpecialCharsCampaign(): Campaign {
  return createMockCampaign({
    id: 'campaign_special',
    name: `Campaign with "quotes" and 'apostrophes' and <html> tags`,
  });
}