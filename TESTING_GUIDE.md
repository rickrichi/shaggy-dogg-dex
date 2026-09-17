# Testing Guide - Shaggy Dogg DEX

Comprehensive testing setup using Vitest, React Testing Library, and Happy DOM.

---

## 📋 Table of Contents

1. [Setup](#setup)
2. [Running Tests](#running-tests)
3. [Test Structure](#test-structure)
4. [Writing Tests](#writing-tests)
5. [Test Utilities](#test-utilities)
6. [Mock Data](#mock-data)
7. [Coverage](#coverage)
8. [CI/CD Integration](#cicd-integration)
9. [Best Practices](#best-practices)
10. [Troubleshooting](#troubleshooting)

---

## 🚀 Setup

### Install Dependencies

```bash
npm install
```

The following testing dependencies are configured in `package.json`:

- **vitest** - Fast Vite-native test runner
- **@testing-library/react** - React component testing utilities
- **@testing-library/user-event** - User interaction simulation
- **@testing-library/jest-dom** - Custom matchers for DOM assertions
- **happy-dom** - Lightweight DOM implementation
- **@vitest/ui** - Interactive test UI
- **@vitest/coverage-v8** - V8 coverage provider

### Configuration Files

1. **vitest.config.ts** - Vitest configuration
2. **src/test/setup.ts** - Global test environment setup
3. **src/test/utils.tsx** - Reusable test utilities
4. **src/test/mockData.ts** - Centralized mock data

---

## 🏃 Running Tests

### Available Scripts

```bash
# Run tests in watch mode
npm test

# Run tests with interactive UI
npm run test:ui

# Run tests with coverage report
npm run test:coverage

# Run tests in CI mode (single run with coverage)
npm run test:ci

# Run tests in watch mode (explicit)
npm run test:watch
```

### Watch Mode (Default)

```bash
npm test
```

- Watches for file changes
- Runs only affected tests
- Fast feedback loop
- Great for development

### UI Mode

```bash
npm run test:ui
```

- Opens interactive web UI at http://localhost:51204
- Visual test explorer
- View test results in real-time
- Inspect component snapshots

### Coverage Mode

```bash
npm run test:coverage
```

Generates coverage reports in:
- `coverage/` - HTML, LCOV, JSON reports
- Terminal summary with color-coded results

**Coverage Thresholds**: 80% (lines, functions, branches, statements)

---

## 📁 Test Structure

### File Organization

```
src/
├── test/
│   ├── setup.ts              # Global test setup
│   ├── utils.tsx             # Test utilities & helpers
│   └── mockData.ts           # Mock data & fixtures
├── hooks/
│   ├── useSwap.tsx           # Implementation
│   └── useSwap.test.ts       # Tests
├── components/
│   ├── ErrorBoundary.tsx     # Implementation
│   └── ErrorBoundary.test.tsx # Tests
└── lib/
    ├── analytics.ts          # Implementation
    └── analytics.test.ts     # Tests
```

### Naming Conventions

- Test files: `*.test.ts` or `*.test.tsx`
- Component tests: `ComponentName.test.tsx`
- Hook tests: `useHookName.test.ts`
- Utility tests: `utilityName.test.ts`

---

## ✍️ Writing Tests

### Basic Test Structure

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

describe('ComponentName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Feature Group', () => {
    it('should do something specific', () => {
      // Arrange
      render(<ComponentName />);

      // Act
      const button = screen.getByRole('button', { name: /click me/i });

      // Assert
      expect(button).toBeInTheDocument();
    });
  });
});
```

### Testing React Components

#### Simple Component Test

```typescript
import { render, screen } from '@/test/utils';
import { SwapCard } from './SwapCard';

it('should render swap card', () => {
  render(<SwapCard />);

  expect(screen.getByText(/swap/i)).toBeInTheDocument();
});
```

#### Component with User Interaction

```typescript
import { render, screen, userEvent } from '@/test/utils';
import { SwapCard } from './SwapCard';

it('should flip tokens when flip button clicked', async () => {
  const user = userEvent.setup();
  render(<SwapCard />);

  const flipButton = screen.getByRole('button', { name: /flip/i });
  await user.click(flipButton);

  // Assert tokens are flipped
  expect(screen.getByText(/usdc/i)).toBeInTheDocument();
});
```

#### Component with Providers

```typescript
import { renderWithProviders } from '@/test/utils';
import { Portfolio } from './Portfolio';

it('should render portfolio with wallet connected', () => {
  renderWithProviders(<Portfolio />);

  expect(screen.getByText(/your portfolio/i)).toBeInTheDocument();
});
```

### Testing React Hooks

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { AllProviders } from '@/test/utils';
import { useSwap } from './useSwap';
import { MOCK_ETH, MOCK_USDC } from '@/test/mockData';

it('should initialize with correct tokens', () => {
  const { result } = renderHook(
    () => useSwap(MOCK_ETH, MOCK_USDC),
    { wrapper: AllProviders }
  );

  expect(result.current.state.sellToken).toEqual(MOCK_ETH);
  expect(result.current.state.buyToken).toEqual(MOCK_USDC);
});

it('should fetch quote when amount changes', async () => {
  const { result } = renderHook(
    () => useSwap(MOCK_ETH, MOCK_USDC),
    { wrapper: AllProviders }
  );

  result.current.actions.setSellAmount('1.0');

  await waitFor(() => {
    expect(result.current.state.isQuoteLoading).toBe(false);
  });
});
```

### Testing Services

```typescript
import { analytics } from './analytics';
import { vi } from 'vitest';

const mockGtag = vi.fn();
(global as any).gtag = mockGtag;

it('should track events', () => {
  analytics.track('swap_completed', {
    from_token: 'ETH',
    to_token: 'USDC',
  });

  expect(mockGtag).toHaveBeenCalledWith(
    'event',
    'swap_completed',
    expect.objectContaining({
      from_token: 'ETH',
      to_token: 'USDC',
    })
  );
});
```

### Testing Error Boundaries

```typescript
import { render, screen } from '@/test/utils';
import { ErrorBoundary } from './ErrorBoundary';

function ThrowError() {
  throw new Error('Test error');
}

it('should catch and display errors', () => {
  // Suppress console.error
  const originalError = console.error;
  console.error = vi.fn();

  render(
    <ErrorBoundary>
      <ThrowError />
    </ErrorBoundary>
  );

  expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();

  console.error = originalError;
});
```

---

## 🛠️ Test Utilities

### Rendering Utilities

#### `renderWithProviders(ui, options?)`

Renders components with all required providers (Wagmi, React Query, Router).

```typescript
import { renderWithProviders } from '@/test/utils';

const { getByText, rerender } = renderWithProviders(<MyComponent />);
```

**Options**:
- `route?: string` - Initial route (default: '/')

#### `AllProviders` Wrapper

Use with `renderHook` for testing hooks:

```typescript
import { renderHook } from '@testing-library/react';
import { AllProviders } from '@/test/utils';

const { result } = renderHook(() => useMyHook(), {
  wrapper: AllProviders,
});
```

### Mock Factories

#### Tokens

```typescript
import { mockToken, mockNativeToken } from '@/test/utils';

const customToken = mockToken({
  symbol: 'DAI',
  decimals: 18,
  address: '0x...',
});

const eth = mockNativeToken();
```

#### Balances

```typescript
import { mockBalance } from '@/test/utils';

const balance = mockBalance({
  value: BigInt('5000000000000000000'), // 5 ETH
  formatted: '5.0',
  symbol: 'ETH',
});
```

#### Swap State

```typescript
import { mockSwapState } from '@/test/utils';

const state = mockSwapState({
  sellAmount: '1.0',
  buyAmount: '2650',
  slippage: 0.5,
});
```

### Blockchain Helpers

```typescript
import { toWei, fromWei, mockTxHash, mockAddress } from '@/test/utils';

const weiAmount = toWei(1.5); // BigInt('1500000000000000000')
const ethAmount = fromWei(BigInt('1500000000000000000')); // 1.5

const txHash = mockTxHash('swap'); // 0xswap000...
const address = mockAddress('1'); // 0x000...001
```

### Async Helpers

```typescript
import { waitForCondition, flushPromises } from '@/test/utils';

// Wait for condition with timeout
await waitForCondition(
  () => result.current.isLoaded,
  5000, // timeout
  50 // check interval
);

// Flush all pending promises
await flushPromises();
```

### Mock Setup

```typescript
import { setupFetchMock, spyOnConsole } from '@/test/utils';

// Setup fetch mock with responses
setupFetchMock({
  '/api/prices': { success: true, data: { ... } },
  '/api/quote': { success: true, data: { ... } },
});

// Spy on console methods
const errorSpy = spyOnConsole('error');
// ... test code
errorSpy.mockRestore();
```

---

## 📦 Mock Data

Centralized in `src/test/mockData.ts`.

### Tokens

```typescript
import {
  MOCK_ETH,
  MOCK_USDC,
  MOCK_USDT,
  MOCK_DAI,
  MOCK_WBTC,
  MOCK_TOKENS,
} from '@/test/mockData';

// Use in tests
expect(result.current.token).toEqual(MOCK_ETH);
```

### Addresses

```typescript
import {
  MOCK_USER_ADDRESS,
  MOCK_ROUTER_ADDRESS,
  MOCK_PAIR_ADDRESS,
} from '@/test/mockData';
```

### Balances

```typescript
import {
  MOCK_ETH_BALANCE,
  MOCK_USDC_BALANCE,
} from '@/test/mockData';

// MOCK_ETH_BALANCE = { value: 5 ETH, formatted: '5.0', ... }
```

### Quotes

```typescript
import { MOCK_QUOTE_RESPONSE } from '@/test/mockData';

// { success: true, data: { amountsOut: [...] } }
```

### Pool Data

```typescript
import {
  MOCK_POOL_RESERVES,
  MOCK_LP_BALANCE,
  MOCK_TOTAL_SUPPLY,
} from '@/test/mockData';
```

### Transactions

```typescript
import {
  MOCK_TX_HASH,
  MOCK_TX_RECEIPT,
} from '@/test/mockData';
```

### Form Values

```typescript
import {
  MOCK_SWAP_FORM,
  MOCK_LIQUIDITY_FORM,
  MOCK_LIMIT_ORDER_FORM,
} from '@/test/mockData';
```

---

## 📊 Coverage

### Coverage Thresholds

Configured in `vitest.config.ts`:

```typescript
coverage: {
  lines: 80,
  functions: 80,
  branches: 80,
  statements: 80,
}
```

### Coverage Exclusions

- `node_modules/`
- `src/test/`
- `**/*.d.ts`
- `**/*.config.*`
- `src/components/ui/**` (Shadcn components)
- `src/main.tsx`
- Test files (`*.test.{ts,tsx}`)

### Viewing Coverage

```bash
# Generate coverage report
npm run test:coverage

# Open HTML report
open coverage/index.html
```

### Coverage Reports

Generated in `coverage/`:
- **HTML** - Interactive web report
- **LCOV** - For CI/CD integrations
- **JSON** - Machine-readable format
- **Text** - Terminal summary

---

## 🔄 CI/CD Integration

### GitHub Actions Example

Create `.github/workflows/test.yml`:

```yaml
name: Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run type check
        run: npm run type-check

      - name: Run linter
        run: npm run lint

      - name: Run tests
        run: npm run test:ci

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v4
        with:
          files: ./coverage/lcov.info
          flags: unittests
          name: codecov-umbrella
```

### Pre-commit Hook

Using Husky:

```json
{
  "husky": {
    "hooks": {
      "pre-commit": "npm run type-check && npm run test:ci"
    }
  }
}
```

---

## 📝 Best Practices

### 1. Arrange-Act-Assert Pattern

```typescript
it('should update amount', () => {
  // Arrange
  const { result } = renderHook(() => useSwap(MOCK_ETH, MOCK_USDC), {
    wrapper: AllProviders,
  });

  // Act
  result.current.actions.setSellAmount('1.0');

  // Assert
  expect(result.current.state.sellAmount).toBe('1.0');
});
```

### 2. Test User Behavior, Not Implementation

❌ **Bad**:
```typescript
expect(component.state.isLoading).toBe(true);
```

✅ **Good**:
```typescript
expect(screen.getByRole('progressbar')).toBeInTheDocument();
```

### 3. Use Semantic Queries

Prefer accessible queries in this order:

1. `getByRole` - Most accessible
2. `getByLabelText` - Form elements
3. `getByPlaceholderText` - Inputs
4. `getByText` - Non-interactive elements
5. `getByTestId` - Last resort

```typescript
// Good
const button = screen.getByRole('button', { name: /submit/i });
const input = screen.getByLabelText(/amount/i);

// Avoid
const button = screen.getByTestId('submit-button');
```

### 4. Mock External Dependencies

```typescript
vi.mock('wagmi', () => ({
  useAccount: vi.fn(() => ({
    address: '0x123',
    isConnected: true,
  })),
}));
```

### 5. Clean Up After Tests

```typescript
beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});
```

### 6. Test Edge Cases

```typescript
describe('Amount Input', () => {
  it('should handle valid input', () => { /* ... */ });
  it('should reject negative amounts', () => { /* ... */ });
  it('should handle decimal input', () => { /* ... */ });
  it('should handle empty input', () => { /* ... */ });
  it('should handle very large numbers', () => { /* ... */ });
});
```

### 7. Use Descriptive Test Names

❌ **Bad**:
```typescript
it('works', () => { /* ... */ });
```

✅ **Good**:
```typescript
it('should display error message when swap fails', () => { /* ... */ });
```

### 8. Avoid Testing Implementation Details

❌ **Bad** (testing internal state):
```typescript
expect(component.state.counter).toBe(5);
```

✅ **Good** (testing visible output):
```typescript
expect(screen.getByText('Count: 5')).toBeInTheDocument();
```

### 9. Use `waitFor` for Async Assertions

```typescript
await waitFor(() => {
  expect(screen.getByText(/success/i)).toBeInTheDocument();
});
```

### 10. Group Related Tests

```typescript
describe('useSwap', () => {
  describe('Initialization', () => {
    it('should initialize with correct tokens', () => { /* ... */ });
    it('should initialize with empty amounts', () => { /* ... */ });
  });

  describe('Token Selection', () => {
    it('should update sell token', () => { /* ... */ });
    it('should swap tokens when needed', () => { /* ... */ });
  });
});
```

---

## 🐛 Troubleshooting

### Tests Fail with "Cannot find module"

**Solution**: Check `vitest.config.ts` alias configuration:

```typescript
resolve: {
  alias: {
    '@': path.resolve(__dirname, './src'),
  },
},
```

### "ReferenceError: window is not defined"

**Solution**: Ensure `environment: 'happy-dom'` in `vitest.config.ts`.

### "matchMedia is not a function"

**Solution**: Already mocked in `src/test/setup.ts`:

```typescript
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({ ... })),
});
```

### Tests Hang or Timeout

**Solution**: Increase timeout in `vitest.config.ts`:

```typescript
test: {
  testTimeout: 10000,
  hookTimeout: 10000,
}
```

### Coverage Not Updating

**Solution**: Clear coverage cache:

```bash
rm -rf coverage
npm run test:coverage
```

### React Hook Errors

**Solution**: Always use `wrapper: AllProviders` with `renderHook`:

```typescript
renderHook(() => useMyHook(), {
  wrapper: AllProviders,
});
```

### Wagmi Mock Issues

**Solution**: Mock at the module level:

```typescript
vi.mock('wagmi', () => ({
  useAccount: vi.fn(),
  useBalance: vi.fn(),
  // ... other hooks
}));
```

### Async State Updates

**Solution**: Use `waitFor` from React Testing Library:

```typescript
await waitFor(() => {
  expect(screen.getByText(/loaded/i)).toBeInTheDocument();
});
```

---

## 📚 Additional Resources

### Documentation

- [Vitest Docs](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [Testing Library Queries](https://testing-library.com/docs/queries/about)
- [jest-dom Matchers](https://github.com/testing-library/jest-dom)

### Testing Philosophy

- [Testing Library Guiding Principles](https://testing-library.com/docs/guiding-principles)
- [Common Mistakes with React Testing Library](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)

### Example Tests

Check out the example test files:

1. `src/hooks/useSwap.test.ts` - Hook testing patterns
2. `src/lib/analytics.test.ts` - Service testing patterns
3. `src/components/ErrorBoundary.test.tsx` - Component testing patterns

---

## ✅ Quick Reference

### Test Commands

```bash
npm test                    # Watch mode
npm run test:ui            # Interactive UI
npm run test:coverage      # Coverage report
npm run test:ci            # CI mode
```

### Common Imports

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@/test/utils';
import userEvent from '@testing-library/user-event';
import { renderHook } from '@testing-library/react';
import { AllProviders } from '@/test/utils';
```

### Common Matchers

```typescript
expect(element).toBeInTheDocument()
expect(element).toHaveTextContent('text')
expect(element).toBeVisible()
expect(element).toBeDisabled()
expect(fn).toHaveBeenCalled()
expect(fn).toHaveBeenCalledWith(arg)
expect(value).toBe(expected)
expect(value).toEqual(expected)
```

### Common Queries

```typescript
screen.getByRole('button', { name: /submit/i })
screen.getByLabelText(/amount/i)
screen.getByPlaceholderText(/enter amount/i)
screen.getByText(/swap/i)
screen.queryByText(/optional/i) // Returns null if not found
screen.findByText(/async/i) // Returns promise
```

---

**Happy Testing! 🎉**

Your comprehensive testing setup is ready. Start writing tests and maintain high code quality across your DEX application.
