/**
 * Global test setup and configuration
 */

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'ERROR'; // Minimize logs during tests

// Increase test timeout for E2E tests
jest.setTimeout(30000);

// Global beforeAll
beforeAll(async () => {
  // Setup test environment
});

// Global afterAll
afterAll(async () => {
  // Cleanup test environment
});

// Global beforeEach
beforeEach(() => {
  // Reset state before each test
});

// Global afterEach
afterEach(() => {
  // Cleanup after each test
  jest.clearAllMocks();
});