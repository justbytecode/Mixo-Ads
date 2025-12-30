/**
 * TokenManager unit tests
 */

import { TokenManager } from '../../../src/auth/TokenManager';
import { createMockAuthResponse, createMockToken, createExpiredToken } from '../../helpers/fixtures';
import { createMockFetch } from '../../helpers/testUtils';
import { AuthError, TokenExpiredError } from '../../../src/utils/ErrorHandler';

describe('TokenManager', () => {
  const credentials = {
    email: 'test@example.com',
    password: 'password123',
  };
  const authEndpoint = 'http://localhost:3000/auth/login';

  describe('Token Acquisition', () => {
    it('should successfully acquire token with valid credentials', async () => {
      const mockAuthResponse = createMockAuthResponse();
      const mockFetch = createMockFetch([
        { status: 200, body: mockAuthResponse },
      ]);

      const tokenManager = new TokenManager(credentials, authEndpoint, mockFetch);
      const token = await tokenManager.getToken();

      expect(token).toBeDefined();
      expect(token.access_token).toBe(mockAuthResponse.access_token);
      expect(token.token_type).toBe(mockAuthResponse.token_type);
      expect(token.expires_in).toBe(mockAuthResponse.expires_in);
      expect(token.issued_at).toBeGreaterThan(0);
    });

    it('should throw AuthError with invalid credentials', async () => {
      const mockFetch = createMockFetch([
        { status: 401, body: { error: 'Invalid credentials' } },
      ]);

      const tokenManager = new TokenManager(credentials, authEndpoint, mockFetch);

      await expect(tokenManager.getToken()).rejects.toThrow(AuthError);
    });

    it('should base64 encode credentials correctly', async () => {
      const mockAuthResponse = createMockAuthResponse();
      const mockFetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => mockAuthResponse,
      } as Response));

      const tokenManager = new TokenManager(credentials, authEndpoint, mockFetch);
      await tokenManager.getToken();

      expect(mockFetch).toHaveBeenCalled();
      const callArgs = mockFetch.mock.calls[0];
      const headers = callArgs[1]?.headers as Record<string, string>;
      
      expect(headers['Authorization']).toMatch(/^Basic /);
      
      // Decode and verify
      const encoded = headers['Authorization'].replace('Basic ', '');
      const decoded = Buffer.from(encoded, 'base64').toString();
      expect(decoded).toBe(`${credentials.email}:${credentials.password}`);
    });
  });

  describe('Token Expiry', () => {
    it('should calculate token expiry correctly from issued_at and expires_in', () => {
      const mockAuthResponse = createMockAuthResponse({ expires_in: 3600 });
      const mockFetch = createMockFetch([
        { status: 200, body: mockAuthResponse },
      ]);

      const tokenManager = new TokenManager(credentials, authEndpoint, mockFetch);
      
      const now = Math.floor(Date.now() / 1000);
      const token = createMockToken({ issued_at: now, expires_in: 3600 });
      
      // Manually set token for testing
      (tokenManager as any).token = token;

      const expiryTime = tokenManager.getExpiryTime();
      expect(expiryTime).toBeDefined();
      
      const expectedExpiry = new Date((now + 3600) * 1000);
      expect(expiryTime?.getTime()).toBe(expectedExpiry.getTime());
    });

    it('should identify token as expired after expiry time', () => {
      const expiredToken = createExpiredToken();
      const mockFetch = createMockFetch([]);

      const tokenManager = new TokenManager(credentials, authEndpoint, mockFetch);
      (tokenManager as any).token = expiredToken;

      expect(tokenManager.isTokenValid()).toBe(false);
    });

    it('should identify token needs refresh 5 minutes before expiry', () => {
      const now = Math.floor(Date.now() / 1000);
      // Token expires in 4 minutes (240 seconds)
      const almostExpiredToken = createMockToken({
        issued_at: now - 3360, // Issued 56 minutes ago
        expires_in: 3600, // 1 hour expiry
      });
      
      const mockFetch = createMockFetch([]);
      const tokenManager = new TokenManager(credentials, authEndpoint, mockFetch);
      (tokenManager as any).token = almostExpiredToken;

      expect(tokenManager.needsRefresh()).toBe(true);
    });

    it('should not need refresh when token has plenty of time', () => {
      const freshToken = createMockToken();
      const mockFetch = createMockFetch([]);

      const tokenManager = new TokenManager(credentials, authEndpoint, mockFetch);
      (tokenManager as any).token = freshToken;

      expect(tokenManager.needsRefresh()).toBe(false);
    });
  });

  describe('Token Refresh', () => {
    it('should refresh token when expired', async () => {
      const expiredToken = createExpiredToken();
      const newAuthResponse = createMockAuthResponse({ access_token: 'new_token' });
      
      const mockFetch = createMockFetch([
        { status: 200, body: newAuthResponse },
      ]);

      const tokenManager = new TokenManager(credentials, authEndpoint, mockFetch);
      (tokenManager as any).token = expiredToken;

      const token = await tokenManager.refreshToken();

      expect(token.access_token).toBe('new_token');
    });

    it('should handle concurrent refresh requests (only refresh once)', async () => {
      const mockAuthResponse = createMockAuthResponse();
      let callCount = 0;
      
      const mockFetch = jest.fn(async () => {
        callCount++;
        // Add small delay to simulate network
        await new Promise(resolve => setTimeout(resolve, 10));
        return {
          ok: true,
          status: 200,
          json: async () => mockAuthResponse,
        } as Response;
      });

      const tokenManager = new TokenManager(credentials, authEndpoint, mockFetch);

      // Make 5 concurrent refresh requests
      const promises = Array.from({ length: 5 }, () => tokenManager.refreshToken());
      const tokens = await Promise.all(promises);

      // All should return the same token
      expect(tokens.every(t => t.access_token === mockAuthResponse.access_token)).toBe(true);
      
      // But API should only be called once
      expect(callCount).toBe(1);
    });

    it('should retry authentication on network failure', async () => {
      const mockAuthResponse = createMockAuthResponse();
      let attempts = 0;
      
      const mockFetch = jest.fn(async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Network error');
        }
        return {
          ok: true,
          status: 200,
          json: async () => mockAuthResponse,
        } as Response;
      });

      const tokenManager = new TokenManager(credentials, authEndpoint, mockFetch);
      const token = await tokenManager.getToken();

      expect(token).toBeDefined();
      expect(attempts).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Token Management', () => {
    it('should clear token', async () => {
      const mockAuthResponse = createMockAuthResponse();
      const mockFetch = createMockFetch([
        { status: 200, body: mockAuthResponse },
      ]);

      const tokenManager = new TokenManager(credentials, authEndpoint, mockFetch);
      await tokenManager.getToken();

      tokenManager.clearToken();

      expect(tokenManager.isTokenValid()).toBe(false);
    });

    it('should return null expiry time when no token', () => {
      const mockFetch = createMockFetch([]);
      const tokenManager = new TokenManager(credentials, authEndpoint, mockFetch);

      expect(tokenManager.getExpiryTime()).toBeNull();
    });

    it('should calculate time until expiry correctly', () => {
      const now = Math.floor(Date.now() / 1000);
      const token = createMockToken({
        issued_at: now,
        expires_in: 3600,
      });

      const mockFetch = createMockFetch([]);
      const tokenManager = new TokenManager(credentials, authEndpoint, mockFetch);
      (tokenManager as any).token = token;

      const timeUntilExpiry = tokenManager.getTimeUntilExpiry();
      
      expect(timeUntilExpiry).toBeGreaterThan(3590 * 1000); // Almost 1 hour
      expect(timeUntilExpiry).toBeLessThan(3600 * 1000); // Less than 1 hour
    });
  });
});