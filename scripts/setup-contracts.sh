#!/bin/bash
# Quick setup script for contract integration

set -e

echo "🚀 Shaggy Dogg DEX - Contract Integration Setup"
echo "================================================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Create directory structure
echo "📁 Creating directory structure..."

mkdir -p contracts/src
mkdir -p contracts/test
mkdir -p contracts/script
mkdir -p deployments
mkdir -p src/hooks/contracts

echo -e "${GREEN}✅ Directories created${NC}"
echo ""

# Step 2: Copy contracts from shaggy-dogg-sol_files
echo "📋 Copying contracts..."

if [ -f "shaggy-dogg-sol_files/GovernanceToken.sol" ]; then
    cp shaggy-dogg-sol_files/GovernanceToken.sol contracts/src/
    echo -e "${GREEN}✅ Copied GovernanceToken.sol${NC}"
else
    echo -e "${YELLOW}⚠️  GovernanceToken.sol not found${NC}"
fi

if [ -f "shaggy-dogg-sol_files/FeeDiscountStaking.sol" ]; then
    cp shaggy-dogg-sol_files/FeeDiscountStaking.sol contracts/src/
    echo -e "${GREEN}✅ Copied FeeDiscountStaking.sol${NC}"
else
    echo -e "${YELLOW}⚠️  FeeDiscountStaking.sol not found${NC}"
fi

if [ -f "shaggy-dogg-sol_files/Shaggy-Dogg-Dex.sol" ]; then
    cp shaggy-dogg-sol_files/Shaggy-Dogg-Dex.sol contracts/src/Deploy.sol
    echo -e "${GREEN}✅ Copied Deploy.sol${NC}"
else
    echo -e "${YELLOW}⚠️  Deploy.sol not found${NC}"
fi

echo ""

# Step 3: Check for Foundry
echo "🔍 Checking for Foundry..."

if command -v forge &> /dev/null; then
    echo -e "${GREEN}✅ Foundry installed: $(forge --version | head -n 1)${NC}"

    # Initialize Foundry project
    echo ""
    echo "🏗️  Initializing Foundry project..."
    cd contracts

    if [ ! -f "foundry.toml" ]; then
        forge init --no-commit --force . 2>/dev/null || true
        echo -e "${GREEN}✅ Foundry project initialized${NC}"
    else
        echo -e "${YELLOW}ℹ️  Foundry already initialized${NC}"
    fi

    cd ..
else
    echo -e "${YELLOW}⚠️  Foundry not installed${NC}"
    echo ""
    echo "📝 Foundry is optional but recommended for:"
    echo "   - Local contract testing"
    echo "   - Automated deployments"
    echo "   - Gas optimization"
    echo ""
    echo "To install Foundry:"
    echo "   curl -L https://foundry.paradigm.xyz | bash"
    echo "   foundryup"
    echo ""
    echo "Or continue with Remix-only workflow (no installation needed)"
fi

echo ""

# Step 4: Install Node dependencies
echo "📦 Checking Node dependencies..."

MISSING_DEPS=""

# Check if tsx is installed
if ! npm list tsx &> /dev/null; then
    MISSING_DEPS="$MISSING_DEPS tsx"
fi

# Check if concurrently is installed
if ! npm list concurrently &> /dev/null; then
    MISSING_DEPS="$MISSING_DEPS concurrently"
fi

if [ -n "$MISSING_DEPS" ]; then
    echo "Installing missing dependencies:$MISSING_DEPS"
    npm install --save-dev $MISSING_DEPS
    echo -e "${GREEN}✅ Dependencies installed${NC}"
else
    echo -e "${GREEN}✅ All dependencies installed${NC}"
fi

echo ""

# Step 5: Create initial deployment placeholders
echo "📝 Creating deployment templates..."

cat > deployments/localhost.json << 'EOF'
{
  "chainId": 31337,
  "timestamp": 0,
  "blockNumber": 0,
  "deployer": "0x0000000000000000000000000000000000000000",
  "contracts": {
    "GovernanceToken": "0x0000000000000000000000000000000000000000",
    "FeeDiscountStaking": "0x0000000000000000000000000000000000000000"
  }
}
EOF

echo -e "${GREEN}✅ Created localhost.json template${NC}"

cat > deployments/sepolia.json << 'EOF'
{
  "chainId": 11155111,
  "timestamp": 0,
  "blockNumber": 0,
  "deployer": "0x0000000000000000000000000000000000000000",
  "contracts": {
    "GovernanceToken": "0x0000000000000000000000000000000000000000",
    "FeeDiscountStaking": "0x0000000000000000000000000000000000000000"
  }
}
EOF

echo -e "${GREEN}✅ Created sepolia.json template${NC}"

echo ""

# Step 6: Run initial sync
echo "🔄 Running initial ABI sync..."

if npm run abi:sync 2>/dev/null; then
    echo -e "${GREEN}✅ ABIs synced${NC}"
else
    echo -e "${YELLOW}⚠️  ABI sync skipped (compile contracts first)${NC}"
fi

echo ""

# Step 7: Summary
echo "================================================"
echo -e "${GREEN}✨ Setup Complete!${NC}"
echo "================================================"
echo ""
echo "📚 Next Steps:"
echo ""
echo "1. Compile contracts:"
echo "   ${YELLOW}npm run contracts:compile${NC}"
echo ""
echo "2. Run tests:"
echo "   ${YELLOW}npm run contracts:test${NC}"
echo ""
echo "3. Deploy locally:"
echo "   ${YELLOW}npm run contracts:deploy:local${NC}"
echo ""
echo "4. Sync ABIs:"
echo "   ${YELLOW}npm run abi:sync${NC}"
echo ""
echo "5. Start development:"
echo "   ${YELLOW}npm run dev${NC}"
echo ""
echo "📖 Full Documentation:"
echo "   - INTEGRATION_GUIDE.md"
echo "   - shaggy-dogg-sol_files/REMIX_SETUP.md"
echo ""
