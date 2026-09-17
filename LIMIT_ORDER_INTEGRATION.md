# Limit Order Integration Guide

## 📋 Overview

This guide documents the integration of **Limit Order functionality** with expiry settings into your Swap.tsx component. The implementation includes:

- ✅ **Limit Price Input** - Set specific execution price
- ✅ **Expiry Settings** - 1h, 24h, 7d, 30d, or custom duration
- ✅ **Execution Disclaimer** - Clear warning about execution conditions
- ✅ **Price Comparison** - Shows difference vs market price
- ✅ **Order Summary** - Preview before submission
- ✅ **Type-Safe Implementation** - Full TypeScript coverage

---

## 🎯 What Was Analyzed & Integrated

From your input:
```
2727.03          ← Limit price input field
0
0
Expiry           ← Expiry settings
Limits may not execute exactly when tokens reach the specified
                 ← Execution disclaimer
```

This has been transformed into a **production-grade limit order interface**.

---

## 📁 Files Created/Modified

### 1. **NEW: `src/components/swap/LimitOrderCard.tsx`**
Complete limit order UI component with:
- Limit price input with market price reference
- Expiry time selector (1h, 24h, 7d, 30d, custom)
- Price discrepancy calculator (shows % difference from market)
- Order summary card
- Execution disclaimer alert
- All standard swap features (token selection, balance display, etc.)

### 2. **MODIFIED: `src/pages/Swap.tsx`**
Updated to conditionally render:
```typescript
{tabMode === 'limit' ? (
  <LimitOrderCard {...props} />  // ← Limit order UI
) : (
  <SwapCard {...props} />         // ← Standard swap UI
)}
```

---

## 🎨 UI Features

### A. Execution Disclaimer
```typescript
<Alert className="bg-amber-50 border-amber-200">
  <AlertCircle className="h-4 w-4 text-amber-600" />
  <AlertDescription>
    <strong>Important:</strong> Limits may not execute exactly when
    tokens reach the specified price. Execution depends on network
    conditions, gas prices, and available liquidity.
  </AlertDescription>
</Alert>
```

**Visual**: Prominent warning at top of card in amber/yellow styling.

### B. Limit Price Input
```typescript
<Input
  id="limit-price"
  type="number"
  placeholder="0.0"
  value={limitPrice}
  onChange={(e) => setLimitPrice(e.target.value)}
  className="text-lg font-medium pr-20"
/>
<div className="absolute right-3">
  {buyToken.symbol}/{sellToken.symbol}
</div>
```

**Features**:
- Large, prominent input field
- Shows trading pair (e.g., "USDC/ETH")
- "Use market price" quick action button
- Real-time price comparison with market

### C. Price Comparison
```typescript
const priceDiscrepancy = useMemo(() => {
  if (!currentMarketPrice || !limitPrice) return null;
  const limit = parseFloat(limitPrice);
  const market = currentMarketPrice;
  const diff = ((limit - market) / market) * 100;
  return {
    percentage: diff,
    isBetter: diff > 0,
  };
}, [currentMarketPrice, limitPrice]);
```

**Display**:
```
Market: 2650.45 USDC/ETH
+2.89%  ← Green if better, red if worse
```

### D. Expiry Settings
```typescript
const EXPIRY_OPTIONS = {
  '1h': { label: '1 Hour', seconds: 3600 },
  '24h': { label: '24 Hours', seconds: 86400 },
  '7d': { label: '7 Days', seconds: 604800 },
  '30d': { label: '30 Days', seconds: 2592000 },
  'custom': { label: 'Custom', seconds: 0 },
}
```

**UI**: Grid of 5 buttons + custom hours input

**Display**:
```
[ 1 Hour ] [ 24 Hours ] [ 7 Days ] [ 30 Days ] [ Custom ]

🕐 Expires: 12/25/2024, 3:45:30 PM
```

### E. Order Summary Card
```typescript
<Card className="bg-gradient-to-r from-blue-50 to-indigo-50">
  <CardContent>
    Order Type: Limit Order
    Limit Price: 2727.030000 USDC/ETH
    You will receive: ≈ 2.727030 USDC
    Slippage Tolerance: 0.5%
  </CardContent>
</Card>
```

---

## 🔧 Technical Implementation

### Type Safety

**Expiry Types**:
```typescript
type ExpiryOption = '1h' | '24h' | '7d' | '30d' | 'custom';

interface ExpiryConfig {
  readonly label: string;
  readonly seconds: number;
}
```

**Component Props**:
```typescript
interface LimitOrderCardProps {
  swap: UseSwapReturn;
  tokens: readonly Token[];
  approveHash?: `0x${string}`;
  swapHash?: `0x${string}`;
  showSettings: boolean;
  onSettingsChange: (open: boolean) => void;
}
```

### State Management

**Limit Order Specific State**:
```typescript
const [limitPrice, setLimitPrice] = useState<string>('');
const [expiry, setExpiry] = useState<ExpiryOption>('24h');
const [customExpiryHours, setCustomExpiryHours] = useState<string>('');
```

### Computed Values

**Expiry Timestamp**:
```typescript
const expiryTimestamp = useMemo(() => {
  if (expiry === 'custom') {
    const hours = parseFloat(customExpiryHours) || 0;
    return Date.now() + hours * 3600 * 1000;
  }
  return Date.now() + EXPIRY_OPTIONS[expiry].seconds * 1000;
}, [expiry, customExpiryHours]);
```

**Calculated Receive Amount**:
```typescript
const calculatedReceiveAmount = useMemo(() => {
  if (!sellAmount || !limitPrice) return '0.0';
  const sellAmt = parseFloat(sellAmount);
  const price = parseFloat(limitPrice);
  return (sellAmt * price).toFixed(6);
}, [sellAmount, limitPrice]);
```

---

## 🚀 How to Use

### For Users

1. **Navigate to Swap page** → Click **"Limit"** tab
2. **Enter amount** to sell (e.g., "1.0 ETH")
3. **Select tokens** (From/To)
4. **Set limit price** (e.g., "2727.03 USDC/ETH")
   - Or click "Use market price" for current rate
5. **Choose expiry** (1h, 24h, 7d, 30d, or custom)
6. **Review order summary**
7. **Approve token** (if needed)
8. **Click "Create Limit Order"**

### Visual Flow

```
┌─────────────────────────────────────┐
│  ⚠️  DISCLAIMER                      │
│  Limits may not execute exactly...  │
└─────────────────────────────────────┘
         ↓
┌─────────────────────────────────────┐
│  You pay                            │
│  [1.0 ▼] [ETH ▼]                   │
│  Balance: 5.2341 ETH    [MAX]      │
└─────────────────────────────────────┘
         ↓
      [ ⇅ ]  ← Reverse tokens
         ↓
┌─────────────────────────────────────┐
│  You receive                        │
│  [2.727030] [USDC ▼]               │
│  Balance: 12,450.21 USDC           │
└─────────────────────────────────────┘
         ↓
┌─────────────────────────────────────┐
│  Limit Price  [Use market price]   │
│  [2727.03 ───────] USDC/ETH        │
│  Market: 2650.45    +2.89%         │
└─────────────────────────────────────┘
         ↓
┌─────────────────────────────────────┐
│  Expiry                             │
│  [1H] [24H*] [7D] [30D] [Custom]   │
│  🕐 Expires: 12/25/24, 3:45 PM     │
└─────────────────────────────────────┘
         ↓
┌─────────────────────────────────────┐
│  📊 ORDER SUMMARY                   │
│  Order Type: Limit Order            │
│  Limit Price: 2727.03 USDC/ETH      │
│  You will receive: ≈ 2.727030 USDC │
│  Slippage: 0.5%                     │
└─────────────────────────────────────┘
         ↓
┌─────────────────────────────────────┐
│  [ Create Limit Order ]             │
└─────────────────────────────────────┘
```

---

## 🎨 Styling & UX

### Color Scheme

**Limit Order Card**:
- Border: `border-blue-200` (lighter blue vs purple for swaps)
- Background: `bg-white/95` with backdrop blur
- Accent: Blue gradient (`from-blue-600 to-indigo-600`)

**Disclaimer Alert**:
- Background: `bg-amber-50`
- Border: `border-amber-200`
- Icon/Text: `text-amber-600/800`

**Price Comparison**:
- Better than market: `text-green-600`
- Worse than market: `text-red-600`

### Icons

- **Clock** (`<Clock />`) - Next to "Limit Order" title
- **AlertCircle** - In disclaimer
- **ArrowUpDown** - Reverse tokens button
- **Loader2** - Loading states

### Responsive Design

All inputs and buttons are touch-friendly:
- Minimum tap target: 44x44px
- Large text inputs for easy mobile entry
- Grid layout adapts to screen size

---

## ⚡ Performance Optimizations

### 1. Memoized Calculations
```typescript
// Only recalculates when dependencies change
const expiryTimestamp = useMemo(() => { ... }, [expiry, customExpiryHours]);
const calculatedReceiveAmount = useMemo(() => { ... }, [sellAmount, limitPrice]);
const currentMarketPrice = useMemo(() => { ... }, [sellAmount, buyAmount]);
const priceDiscrepancy = useMemo(() => { ... }, [currentMarketPrice, limitPrice]);
```

### 2. Memo-ized Component
```typescript
export const LimitOrderCard = memo<LimitOrderCardProps>(({ ... }) => {
  // Component only re-renders when props change
});
```

### 3. Conditional Rendering
```typescript
// In Swap.tsx - only renders active component
{tabMode === 'limit' ? <LimitOrderCard /> : <SwapCard />}
```

---

## 🔌 Integration with Existing Code

### Swap.tsx Changes

**Before**:
```typescript
<TabsContent value="limit">
  <SwapCard swap={swapLimit} {...props} />
</TabsContent>
```

**After**:
```typescript
{tabConfigs.map(({ mode: tabMode }) => (
  <TabsContent key={tabMode} value={tabMode}>
    {tabMode === 'limit' ? (
      <LimitOrderCard           // ← New component
        swap={swapInstances[tabMode]}
        tokens={MAINNET_TOKENS}
        showSettings={showSettings}
        onSettingsChange={setShowSettings}
      />
    ) : (
      <SwapCard                  // ← Existing component
        swap={swapInstances[tabMode]}
        tokens={MAINNET_TOKENS}
        showSettings={showSettings}
        onSettingsChange={setShowSettings}
      />
    )}
  </TabsContent>
))}
```

**Benefits**:
- ✅ No breaking changes to existing code
- ✅ SwapCard remains unchanged
- ✅ LimitOrderCard is a drop-in replacement
- ✅ Shares same props interface
- ✅ Both use the same `useSwap` hook

---

## 🛠️ Backend Integration (TODO)

The `LimitOrderCard` component currently logs the order data to console. To fully implement:

### 1. Create Limit Order Contract/Service

```typescript
// TODO: Implement in your backend
interface LimitOrder {
  id: string;
  user: Address;
  sellToken: Address;
  buyToken: Address;
  sellAmount: bigint;
  limitPrice: bigint;  // Price in wei/token
  expiry: number;      // Unix timestamp
  status: 'pending' | 'filled' | 'cancelled' | 'expired';
  createdAt: number;
}
```

### 2. Update Button Handler

Replace the console.log with actual order creation:

```typescript
const handleCreateOrder = async () => {
  try {
    const order: LimitOrder = {
      sellToken: state.sellToken.address,
      buyToken: state.buyToken.address,
      sellAmount: parseUnits(state.sellAmount, state.sellToken.decimals),
      limitPrice: parseUnits(limitPrice, state.buyToken.decimals),
      expiry: expiryTimestamp,
    };

    // Call your smart contract or API
    const tx = await createLimitOrder(order);
    await tx.wait();

    toast.success('Limit order created!');
  } catch (error) {
    toast.error('Failed to create order');
  }
};
```

### 3. Order Monitoring

You'll need:
- **Smart contract** or **centralized service** to store orders
- **Price oracle** to check when limit price is reached
- **Executor** to automatically execute orders when conditions are met
- **Notification system** to alert users

---

## 📊 Comparison: Swap vs Limit

| Feature | Swap (SwapCard) | Limit (LimitOrderCard) |
|---------|----------------|------------------------|
| Execution | Immediate | When price reached |
| Price | Market price | User-defined |
| Expiry | N/A | Configurable |
| Gas Costs | One transaction | Two transactions* |
| Slippage | Yes | Yes |
| Guarantee | Immediate (if liquidity) | Conditional |

\* *Order creation + order execution*

---

## 🧪 Testing Checklist

### Unit Tests
- [ ] Price calculation accuracy
- [ ] Expiry timestamp calculation
- [ ] Price discrepancy percentage
- [ ] Custom expiry hours parsing
- [ ] Token reversal maintains limit price

### Integration Tests
- [ ] Switch between Swap/Buy/Limit/Sell tabs
- [ ] State persists when switching tabs
- [ ] URL parameters update correctly
- [ ] Market price button populates limit price
- [ ] MAX button works correctly

### E2E Tests
- [ ] Complete order creation flow
- [ ] Token approval flow
- [ ] Error handling (insufficient balance, etc.)
- [ ] Expiry options all work
- [ ] Custom expiry validation

### Visual Tests
- [ ] Responsive on mobile (320px - 480px)
- [ ] Responsive on tablet (768px - 1024px)
- [ ] Responsive on desktop (1280px+)
- [ ] Disclaimer is visible and readable
- [ ] All buttons have proper hover states

---

## 🎓 Key Concepts

### Why Limit Orders May Not Execute Exactly

The disclaimer states: *"Limits may not execute exactly when tokens reach the specified price."*

**Reasons:**

1. **Network Congestion**
   - High gas prices may delay execution
   - Order may be in mempool when price changes

2. **Liquidity**
   - Insufficient liquidity at exact price
   - Slippage may prevent fill

3. **Oracle Latency**
   - Price feeds update with delay
   - On-chain price may differ from off-chain

4. **MEV (Maximal Extractable Value)**
   - Bots may front-run order execution
   - Sandwich attacks possible

5. **Gas Price Volatility**
   - Executor may wait for lower gas
   - Order execution cost vs gain trade-off

**Best Practices:**
- Set realistic limit prices with buffer
- Use appropriate slippage tolerance
- Choose longer expiry for better odds
- Monitor order status actively

---

## 🚀 Future Enhancements

### Possible Improvements

1. **Advanced Order Types**
   - Stop-loss orders
   - Take-profit orders
   - Trailing stop orders
   - Good-till-cancelled (GTC)

2. **Order Management**
   - View all open orders
   - Cancel orders
   - Edit order price/expiry
   - Order history

3. **Notifications**
   - Email/SMS when order fills
   - Push notifications
   - Discord/Telegram integration

4. **Analytics**
   - Fill rate statistics
   - Average execution time
   - Slippage analysis
   - Gas cost tracking

5. **Multi-Chain Support**
   - Cross-chain limit orders
   - Chain-specific expiry
   - Unified order book

---

## 📝 Summary

### What You Got

✅ **Fully functional limit order UI** with:
- Limit price input
- Expiry settings (5 options)
- Execution disclaimer
- Price comparison
- Order summary
- Type-safe implementation
- Production-ready styling
- Responsive design

✅ **Clean integration** with existing Swap.tsx:
- No breaking changes
- Conditional rendering
- Shared state management
- Consistent UX

✅ **Developer-friendly**:
- Well-documented code
- TypeScript throughout
- Reusable components
- Easy to extend

### Next Steps

1. **Test the UI** - Run `npm run dev` and click the Limit tab
2. **Implement backend** - Create order storage/execution logic
3. **Add order management** - List, cancel, edit orders
4. **Deploy** - Ship to production

---

**Questions or issues?** Check the code comments in `LimitOrderCard.tsx` for detailed explanations of each feature.
