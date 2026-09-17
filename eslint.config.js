// eslint.config.js - Modern ESLint Flat Config (2025 Standards)
// ══════════════════════════════════════════════════════════════════════════════
// COMPREHENSIVE ESLINT SETUP FOR VITE + REACT + TYPESCRIPT + VITEST + TAILWIND
// ══════════════════════════════════════════════════════════════════════════════

import js from "@eslint/js";
import vitest from "@vitest/eslint-plugin";
import prettierConfig from "eslint-config-prettier";
import importPlugin from "eslint-plugin-import";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tailwind from "eslint-plugin-tailwindcss";
import globals from "globals";
import tseslint from "typescript-eslint";

// ══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ══════════════════════════════════════════════════════════════════════════════

export default tseslint.config(
  // ────────────────────────────────────────────────────────────────────────────
  // Global Ignores
  // ────────────────────────────────────────────────────────────────────────────
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.next/**",
      "**/build/**",
      "**/coverage/**",
      "**/.vite/**",
      "**/.turbo/**",
      "server/dist/**",
      "**/*.d.ts",
      "**/*.config.js",
      "**/*.config.ts",
      "!eslint.config.js", // Don't ignore this file
    ],
  },

  // ────────────────────────────────────────────────────────────────────────────
  // Base Configuration - All TypeScript/JavaScript Files
  // ────────────────────────────────────────────────────────────────────────────
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2024,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "jsx-a11y": jsxA11y,
      "simple-import-sort": simpleImportSort,
      import: importPlugin,
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      // ──────────────────────────────────────────────────────────────────────
      // Import Sorting & Organization (Auto-fixable)
      // ──────────────────────────────────────────────────────────────────────
      "simple-import-sort/imports": [
        "error",
        {
          groups: [
            // Side effect imports
            ["^\\u0000"],
            // Node.js built-ins
            ["^node:"],
            // React & related packages
            ["^react", "^@react", "^next"],
            // External packages
            ["^@?\\w"],
            // Internal packages
            ["^@/"],
            // Parent imports
            ["^\\.\\.(?!/?$)", "^\\.\\./?$"],
            // Relative imports
            ["^\\./(?=.*/)(?!/?$)", "^\\.(?!/?$)", "^\\./?$"],
            // Style imports
            ["^.+\\.s?css$"],
            // Type imports
            ["^@?\\w.*\\u0000$", "^[^.].*\\u0000$", "^\\..*\\u0000$"],
          ],
        },
      ],
      "simple-import-sort/exports": "error",
      "import/first": "error",
      "import/newline-after-import": "error",
      "import/no-duplicates": "off", // TypeScript handles this better
      "import/no-unresolved": "off", // TypeScript handles this better

      // ──────────────────────────────────────────────────────────────────────
      // TypeScript - Strict Type Safety
      // ──────────────────────────────────────────────────────────────────────
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "off", // Allow any for flexibility
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          fixStyle: "separate-type-imports",
          disallowTypeAnnotations: false,
        },
      ],
      "@typescript-eslint/consistent-type-definitions": ["error", "interface"],
      "@typescript-eslint/array-type": ["error", { default: "array-simple" }],
      "@typescript-eslint/prefer-nullish-coalescing": "off", // Requires type checking
      "@typescript-eslint/prefer-optional-chain": "off", // Requires type checking

      // ──────────────────────────────────────────────────────────────────────
      // React & JSX
      // ──────────────────────────────────────────────────────────────────────
      "react/react-in-jsx-scope": "off", // Not needed in React 17+
      "react/jsx-uses-react": "off",
      "react/prop-types": "off", // TypeScript handles this
      "react/jsx-key": "error",
      "react/jsx-no-useless-fragment": "warn",
      "react/self-closing-comp": "warn",
      "react/jsx-curly-brace-presence": [
        "warn",
        { props: "never", children: "never" },
      ],
      "react/jsx-boolean-value": ["warn", "never"],
      "react/jsx-fragments": ["warn", "syntax"],
      "react/no-array-index-key": "off", // Allow index keys for static lists
      "react/display-name": "off",

      // ──────────────────────────────────────────────────────────────────────
      // React Hooks
      // ──────────────────────────────────────────────────────────────────────
      ...reactHooks.configs.recommended.rules,
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "off", // Allow manual dependency control

      // ──────────────────────────────────────────────────────────────────────
      // React Refresh (Vite HMR)
      // ──────────────────────────────────────────────────────────────────────
      "react-refresh/only-export-components": "off", // Allow mixed exports for flexibility

      // ──────────────────────────────────────────────────────────────────────
      // Accessibility (A11y) - Critical for production apps
      // ──────────────────────────────────────────────────────────────────────
      "jsx-a11y/alt-text": "error",
      "jsx-a11y/anchor-is-valid": "error",
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/aria-proptypes": "error",
      "jsx-a11y/aria-unsupported-elements": "error",
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/heading-has-content": "error",
      "jsx-a11y/html-has-lang": "error",
      "jsx-a11y/img-redundant-alt": "warn",
      "jsx-a11y/interactive-supports-focus": "warn",
      "jsx-a11y/label-has-associated-control": "warn",
      "jsx-a11y/no-autofocus": "warn",
      "jsx-a11y/no-noninteractive-element-interactions": "warn",
      "jsx-a11y/role-has-required-aria-props": "error",
      "jsx-a11y/role-supports-aria-props": "error",

      // ──────────────────────────────────────────────────────────────────────
      // Naming Conventions
      // ──────────────────────────────────────────────────────────────────────
      "@typescript-eslint/naming-convention": [
        "error",
        {
          selector: "interface",
          format: ["PascalCase"],
          custom: { regex: "^I[A-Z]", match: false }, // No "I" prefix
        },
        {
          selector: "typeAlias",
          format: ["PascalCase"],
        },
        {
          selector: "enum",
          format: ["PascalCase"],
        },
        {
          selector: "enumMember",
          format: ["UPPER_CASE", "PascalCase"],
        },
      ],

      // ──────────────────────────────────────────────────────────────────────
      // Code Quality & Best Practices
      // ──────────────────────────────────────────────────────────────────────
      "prefer-const": "error",
      "no-var": "error",
      "object-shorthand": "warn",
      "prefer-template": "warn",
      "prefer-arrow-callback": "warn",
      "no-console": "off", // Allow console for debugging
      "no-debugger": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-unused-expressions": "off",
      "@typescript-eslint/no-unused-expressions": "error",
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  // Tailwind CSS Configuration
  // ────────────────────────────────────────────────────────────────────────────
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    plugins: {
      tailwindcss: tailwind,
    },
    rules: {
      "tailwindcss/classnames-order": "off", // Prettier handles this
      "tailwindcss/enforces-negative-arbitrary-values": "warn",
      "tailwindcss/enforces-shorthand": "warn",
      "tailwindcss/no-arbitrary-value": "off", // Allow arbitrary values
      "tailwindcss/no-contradicting-classname": "error",
      "tailwindcss/no-custom-classname": "off", // Allow custom classes
      "tailwindcss/no-unnecessary-arbitrary-value": "off", // Allow arbitrary values for precision
    },
    settings: {
      tailwindcss: {
        callees: ["cn", "cva", "clsx", "twMerge"],
        config: "tailwind.config.js",
        classRegex: "^(class(Name)?|tw)$",
      },
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  // Vitest/Testing Configuration
  // ────────────────────────────────────────────────────────────────────────────
  {
    files: ["**/*.{test,spec}.{ts,tsx,js,jsx}", "**/test/**/*.{ts,tsx,js,jsx}"],
    plugins: {
      vitest,
    },
    rules: {
      ...vitest.configs.recommended.rules,
      "vitest/expect-expect": "error",
      "vitest/no-disabled-tests": "warn",
      "vitest/no-focused-tests": "error",
      "vitest/valid-expect": "error",
      "vitest/consistent-test-it": ["warn", { fn: "it" }],
      "vitest/prefer-to-be": "warn",
      "vitest/prefer-to-have-length": "warn",
    },
    languageOptions: {
      globals: {
        ...vitest.environments.env.globals,
      },
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  // Prettier Integration (Must be last to override formatting rules)
  // ────────────────────────────────────────────────────────────────────────────
  prettierConfig,
);
