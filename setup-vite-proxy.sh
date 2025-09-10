#!/bin/bash

# Vite Dev Server Proxy Setup Script
# This script helps configure proxy settings for Vite development servers
# to handle CORS issues when communicating with backend APIs

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
DEFAULT_API_PATH="/api"
DEFAULT_TARGET="http://localhost:3000"
DEFAULT_CONFIG_FILE="vite.config.js"

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}  Vite Dev Server Proxy Setup${NC}"
    echo -e "${BLUE}================================${NC}"
    echo
}

# Function to check if we're in a Vite project
check_vite_project() {
    if [[ ! -f "package.json" ]]; then
        print_error "No package.json found. Are you in a project directory?"
        exit 1
    fi

    if ! grep -q "vite" package.json; then
        print_warning "Vite not found in package.json. This might not be a Vite project."
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# Function to detect existing config file
detect_config_file() {
    if [[ -f "vite.config.ts" ]]; then
        echo "vite.config.ts"
    elif [[ -f "vite.config.js" ]]; then
        echo "vite.config.js"
    elif [[ -f "vite.config.mjs" ]]; then
        echo "vite.config.mjs"
    else
        echo ""
    fi
}

# Function to get user input with default values
get_user_input() {
    echo "Please provide the following configuration details:"
    echo

    # API path
    read -p "API path to proxy (default: ${DEFAULT_API_PATH}): " api_path
    api_path=${api_path:-$DEFAULT_API_PATH}

    # Target URL
    read -p "Target backend URL (default: ${DEFAULT_TARGET}): " target_url
    target_url=${target_url:-$DEFAULT_TARGET}

    # Additional paths
    echo
    read -p "Do you need additional proxy paths? (y/N): " -n 1 -r
    echo
    additional_paths=""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        while true; do
            read -p "Enter additional path (or press Enter to finish): " extra_path
            if [[ -z "$extra_path" ]]; then
                break
            fi
            read -p "Target URL for $extra_path: " extra_target
            additional_paths="$additional_paths,$extra_path:$extra_target"
        done
    fi

    # Advanced options
    echo
    read -p "Enable WebSocket support? (y/N): " -n 1 -r
    echo
    enable_ws=$([[ $REPLY =~ ^[Yy]$ ]] && echo "true" || echo "false")

    read -p "Enable proxy logging for debugging? (y/N): " -n 1 -r
    echo
    enable_logging=$([[ $REPLY =~ ^[Yy]$ ]] && echo "true" || echo "false")

    read -p "Disable SSL verification (for development)? (y/N): " -n 1 -r
    echo
    disable_ssl=$([[ $REPLY =~ ^[Yy]$ ]] && echo "true" || echo "false")
}

# Function to create TypeScript config
create_ts_config() {
    local config_file=$1
    local is_new_file=$2
    
    cat > "$config_file" << EOF
import { defineConfig } from 'vite'
// Import your framework plugin (uncomment as needed)
// import react from '@vitejs/plugin-react'
// import vue from '@vitejs/plugin-vue'
// import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  // plugins: [react()], // Uncomment and adjust for your framework
  server: {
    proxy: {
EOF

    # Add main proxy configuration
    cat >> "$config_file" << EOF
      '${api_path}': {
        target: '${target_url}',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\${api_path}/, ''),$(
        [[ "$disable_ssl" == "true" ]] && echo "
        secure: false,"
        )$(
        [[ "$enable_ws" == "true" ]] && echo "
        ws: true,"
        )$(
        [[ "$enable_logging" == "true" ]] && echo "
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('Proxy error:', err)
          })
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('Sending Request to Target:', req.method, req.url)
          })
          proxy.on('proxyRes', (proxyRes, req, res) => {
            console.log('Received Response from Target:', proxyRes.statusCode, req.url)
          })
        },"
        )
      },
EOF

    # Add additional proxy paths
    if [[ -n "$additional_paths" ]]; then
        IFS=',' read -ra PATHS <<< "$additional_paths"
        for path_config in "${PATHS[@]}"; do
            if [[ -n "$path_config" ]]; then
                IFS=':' read -ra PATH_PARTS <<< "$path_config"
                local path="${PATH_PARTS[0]}"
                local target="${PATH_PARTS[1]}"
                cat >> "$config_file" << EOF
      '${path}': {
        target: '${target}',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\${path}/, ''),$(
        [[ "$disable_ssl" == "true" ]] && echo "
        secure: false,"
        )$(
        [[ "$enable_ws" == "true" ]] && echo "
        ws: true,"
        )
      },
EOF
            fi
        done
    fi

    cat >> "$config_file" << EOF
    }
  }
})
EOF
}

# Function to create JavaScript config
create_js_config() {
    local config_file=$1
    
    cat > "$config_file" << EOF
import { defineConfig } from 'vite'
// Import your framework plugin (uncomment as needed)
// import react from '@vitejs/plugin-react'
// import vue from '@vitejs/plugin-vue'
// import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  // plugins: [react()], // Uncomment and adjust for your framework
  server: {
    proxy: {
EOF

    # Add main proxy configuration
    cat >> "$config_file" << EOF
      '${api_path}': {
        target: '${target_url}',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\${api_path}/, ''),$(
        [[ "$disable_ssl" == "true" ]] && echo "
        secure: false,"
        )$(
        [[ "$enable_ws" == "true" ]] && echo "
        ws: true,"
        )$(
        [[ "$enable_logging" == "true" ]] && echo "
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('Proxy error:', err)
          })
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('Sending Request to Target:', req.method, req.url)
          })
          proxy.on('proxyRes', (proxyRes, req, res) => {
            console.log('Received Response from Target:', proxyRes.statusCode, req.url)
          })
        },"
        )
      },
EOF

    # Add additional proxy paths
    if [[ -n "$additional_paths" ]]; then
        IFS=',' read -ra PATHS <<< "$additional_paths"
        for path_config in "${PATHS[@]}"; do
            if [[ -n "$path_config" ]]; then
                IFS=':' read -ra PATH_PARTS <<< "$path_config"
                local path="${PATH_PARTS[0]}"
                local target="${PATH_PARTS[1]}"
                cat >> "$config_file" << EOF
      '${path}': {
        target: '${target}',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\${path}/, ''),$(
        [[ "$disable_ssl" == "true" ]] && echo "
        secure: false,"
        )$(
        [[ "$enable_ws" == "true" ]] && echo "
        ws: true,"
        )
      },
EOF
            fi
        done
    fi

    cat >> "$config_file" << EOF
    }
  }
})
EOF
}

# Function to backup existing config
backup_config() {
    local config_file=$1
    local backup_file="${config_file}.backup.$(date +%Y%m%d_%H%M%S)"
    cp "$config_file" "$backup_file"
    print_status "Backed up existing config to: $backup_file"
}

# Function to create environment file template
create_env_template() {
    if [[ ! -f ".env.local" ]]; then
        cat > ".env.local" << EOF
# Vite Environment Variables
# These variables will be available in your Vite config

# API Configuration
VITE_API_URL=${target_url}
VITE_API_PATH=${api_path}

# Development Settings
VITE_DEV_MODE=true
EOF
        print_status "Created .env.local template with your configuration"
    else
        print_warning ".env.local already exists, skipping creation"
    fi
}

# Function to create example usage file
create_usage_example() {
    cat > "proxy-usage-example.js" << EOF
// Example usage of the configured proxy in your application

// ✅ Correct: Use the proxy path
fetch('${api_path}/users')
  .then(response => response.json())
  .then(data => console.log(data))
  .catch(error => console.error('Error:', error))

// ✅ Correct: POST request through proxy
fetch('${api_path}/users', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    name: 'John Doe',
    email: 'john@example.com'
  })
})

// ❌ Incorrect: Don't use the full backend URL in development
// fetch('${target_url}/users') // This will cause CORS errors

// Environment-based configuration example:
const apiUrl = import.meta.env.DEV ? '${api_path}' : '${target_url}'
fetch(\`\${apiUrl}/users\`)

// WebSocket usage (if enabled):
$(if [[ "$enable_ws" == "true" ]]; then
echo "const ws = new WebSocket('ws://localhost:5173${api_path}/socket')
ws.onopen = () => console.log('WebSocket connected')
ws.onmessage = (event) => console.log('Message:', event.data)"
fi)
EOF
    print_status "Created proxy-usage-example.js with usage examples"
}

# Function to display final instructions
show_final_instructions() {
    echo
    print_header
    print_status "Proxy configuration completed successfully!"
    echo
    echo -e "${BLUE}Configuration Summary:${NC}"
    echo "  • Config file: $config_file"
    echo "  • Proxy path: $api_path"
    echo "  • Target URL: $target_url"
    echo "  • WebSocket support: $enable_ws"
    echo "  • Debug logging: $enable_logging"
    echo "  • SSL verification disabled: $disable_ssl"
    echo
    echo -e "${BLUE}Next Steps:${NC}"
    echo "1. Make sure your backend server is running on: $target_url"
    echo "2. Start your Vite dev server: npm run dev"
    echo "3. Use $api_path/* in your API calls instead of the full backend URL"
    echo "4. Check proxy-usage-example.js for implementation examples"
    echo
    echo -e "${BLUE}Troubleshooting:${NC}"
    echo "• If you get 404 errors, check your backend routes"
    echo "• If proxy isn't working, verify backend server is accessible"
    echo "• Check browser dev tools Network tab to see proxied requests"
    echo "• Enable debug logging in config for detailed proxy information"
    echo
    print_status "Happy coding! 🚀"
}

# Main execution
main() {
    print_header
    
    # Check if we're in a Vite project
    check_vite_project
    
    # Detect existing config file
    existing_config=$(detect_config_file)
    
    if [[ -n "$existing_config" ]]; then
        print_status "Found existing config file: $existing_config"
        read -p "Do you want to backup and overwrite it? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_error "Aborted by user"
            exit 1
        fi
        config_file="$existing_config"
        backup_config "$config_file"
    else
        print_status "No existing Vite config found"
        read -p "Create TypeScript config? (Y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Nn]$ ]]; then
            config_file="vite.config.js"
        else
            config_file="vite.config.ts"
        fi
    fi
    
    # Get user configuration
    get_user_input
    
    # Create the configuration file
    print_status "Creating $config_file..."
    
    if [[ "$config_file" == *.ts ]]; then
        create_ts_config "$config_file"
    else
        create_js_config "$config_file"
    fi
    
    # Create additional files
    create_env_template
    create_usage_example
    
    # Show final instructions
    show_final_instructions
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "Vite Dev Server Proxy Setup Script"
        echo
        echo "Usage: $0 [options]"
        echo
        echo "Options:"
        echo "  --help, -h     Show this help message"
        echo "  --version, -v  Show version information"
        echo
        echo "This script will interactively configure a Vite dev server proxy"
        echo "to handle CORS issues during development."
        exit 0
        ;;
    --version|-v)
        echo "Vite Proxy Setup Script v1.0.0"
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac
