# 🚀 Modern ESLint Setup Guide (2025 Standards)

**Comprehensive ESLint configuration for Vite + React + TypeScript + Vitest + Tailwind CSS**

---

## 📦 Step 1: Install Required Packages

Run the following command to install all necessary ESLint plugins and dependencies:

```bash
npm install -D \
  @vitest/eslint-plugin \
  eslint-plugin-tailwindcss \
  eslint-plugin-simple-import-sort \
  eslint-plugin-import \
  eslint-config-prettier \
  prettier \
  prettier-plugin-tailwindcss
```

### Already Installed (From your package.json)
- ✅ `eslint` (^9.39.1)
- ✅ `typescript-eslint` (^8.46.4)
- ✅ `eslint-plugin-react` (^7.37.5)
- ✅ `eslint-plugin-react-hooks` (^5.2.0)
- ✅ `eslint-plugin-react-refresh` (^0.4.24)
- ✅ `eslint-plugin-jsx-a11y` (^6.10.2)
- ✅ `globals` (^15.15.0)

---

## ⚙️ Step 2: Configuration Files

### ✅ eslint.config.js
Already created! This file includes:

- **ESLint v9 Flat Config** format (2025 standard)
- **TypeScript** support with strict type checking
- **React** and React Hooks rules
- **Vitest** testing rules for test files
- **Tailwind CSS** linting and auto-sorting
- **Import sorting** with auto-fix capability
- **Accessibility** (a11y) rules
- **Prettier** integration (no conflicts)

### ✅ .prettierrc
Already created! Configured for:
- Tailwind CSS class sorting plugin
- Consistent code formatting
- Compatible with ESLint

### ✅ .prettierignore
Already created to exclude build directories and dependencies.

---

## 📜 Step 3: Update package.json Scripts

Add these scripts to your `package.json`:

```json
{
  "scripts": {
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write \"src/**/*.{ts,tsx,js,jsx,json,css,md}\"",
    "format:check": "prettier --check \"src/**/*.{ts,tsx,js,jsx,json,css,md}\"",
    "check": "npm run type-check && npm run lint && npm run format:check"
  }
}
```

---

## 🎯 Features & Benefits

### 🔄 Auto-fixable Rules
Many rules can be automatically fixed with `npm run lint:fix`:
- Import sorting and organization
- Tailwind class ordering
- React JSX formatting
- Code style consistency

### 📊 Import Organization
Imports are automatically sorted into logical groups:
1. Side effects
2. Node.js built-ins
3. React & framework packages
4. External packages
5. Internal packages (`@/`)
6. Parent/relative imports
7. Style imports
8. Type imports

### 🎨 Tailwind CSS Support
- Automatic class name ordering
- Detects contradicting classes
- Enforces shorthand notation
- Works with `cn()`, `cva()`, `clsx()`, `twMerge()`

### 🧪 Vitest Testing Rules
Special rules for test files:
- Enforces test best practices
- Prevents focused/disabled tests in production
- Validates expect assertions

### ♿ Accessibility (A11y)
Critical accessibility rules enabled:
- Alt text for images
- ARIA attributes validation
- Keyboard navigation support
- Semantic HTML enforcement

---

## 🚦 Usage

### Lint all files
```bash
npm run lint
```

### Auto-fix issues
```bash
npm run lint:fix
```

### Format with Prettier
```bash
npm run format
```

### Check everything (type-check + lint + format)
```bash
npm run check
```

---

## 🔧 Customization

### Adjust Rule Severity

In `eslint.config.js`, change rule severity:
- `"off"` or `0` - Disable the rule
- `"warn"` or `1` - Warning (doesn't fail builds)
- `"error"` or `2` - Error (fails builds)

Example:
```javascript
rules: {
  "no-console": "warn",  // Change to "error" for production
  "react-hooks/exhaustive-deps": "off",  // Disable if needed
}
```

### Add Custom Import Groups

Modify the `simple-import-sort/imports` rule in `eslint.config.js`:
```javascript
"simple-import-sort/imports": [
  "error",
  {
    groups: [
      // Your custom groups here
      ["^@mycompany/"],
    ],
  },
],
```

### Tailwind Settings

Modify Tailwind settings for custom class names:
```javascript
settings: {
  tailwindcss: {
    callees: ["cn", "cva", "clsx", "twMerge", "yourCustomFunction"],
    config: "tailwind.config.js",
  },
},
```

---

## 🆚 What's New in 2025?

### Updated from Old Config
- ✅ **Flat config format** (replaces `.eslintrc`)
- ✅ **ESLint v9** compatibility
- ✅ **Import sorting** with `simple-import-sort`
- ✅ **Vitest** support (v3.5.0+)
- ✅ **Tailwind CSS** linting
- ✅ **Prettier integration** (no conflicts)
- ✅ **Stricter TypeScript** rules
- ✅ **Better accessibility** rules

### Removed Deprecated
- ❌ `.eslintrc.json` format
- ❌ `eslint-plugin-import` conflicts
- ❌ Prettier formatting rules in ESLint

---

## 📚 Resources

### Official Documentation
- [ESLint Flat Config](https://eslint.org/docs/latest/use/configure/configuration-files)
- [TypeScript ESLint](https://typescript-eslint.io/)
- [eslint-plugin-simple-import-sort](https://github.com/lydell/eslint-plugin-simple-import-sort)
- [eslint-plugin-tailwindcss](https://github.com/francoismassart/eslint-plugin-tailwindcss)
- [eslint-plugin-vitest](https://github.com/vitest-dev/eslint-plugin-vitest)
- [eslint-config-prettier](https://github.com/prettier/eslint-config-prettier)

### Community Resources
- [ESLint Flat Config Examples](https://github.com/zemd/eslint-flat-config)
- [Tailwind + ESLint Guide](https://mewis.me/blog/css/boost-your-tailwind-workflow-with-eslint-and-prettier)
- [Medium: ESLint 9 Tutorial](https://owenkriz.medium.com/eslint-9-flat-config-tutorial-5dea2dcd77f1)

---

## 🐛 Troubleshooting

### Error: Cannot find module '@vitest/eslint-plugin'
Run: `npm install -D @vitest/eslint-plugin`

### Error: Unknown rule 'tailwindcss/classnames-order'
Run: `npm install -D eslint-plugin-tailwindcss`

### Prettier conflicts with ESLint
Make sure `eslint-config-prettier` is the **last** item in your config (already configured).

### Import sorting not working
1. Check that `simple-import-sort` is installed
2. Run `npm run lint:fix` to auto-fix
3. Restart your editor/IDE

---

## ✅ Verification

After installation, verify everything works:

```bash
# Install dependencies
npm install

# Check TypeScript
npm run type-check

# Lint all files
npm run lint

# Auto-fix issues
npm run lint:fix

# Format with Prettier
npm run format

# Run all checks
npm run check
```

If all commands pass ✅, your setup is complete!

---

## 🎉 You're All Set!

Your project now has a **production-ready ESLint configuration** with:
- Modern flat config (ESLint v9)
- TypeScript support
- React & Hooks linting
- Vitest testing rules
- Tailwind CSS auto-sorting
- Automatic import organization
- Accessibility checks
- Prettier integration

**Happy coding!** 🚀
