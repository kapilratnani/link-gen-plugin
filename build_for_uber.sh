#!/bin/bash

# Build script for Uber Link Generator Chrome Extension
# This script creates a zip file containing all necessary files for Chrome extension installation

set -e  # Exit on any error

# Configuration
EXTENSION_NAME="uber-link-generator"
BUILD_DIR="build"
ZIP_NAME="${EXTENSION_NAME}-$(date +%Y%m%d-%H%M%S).zip"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to update version in manifest.json
update_version() {
    print_status "Updating version in manifest.json..."
    
    # Read current version from manifest.json
    if command -v jq &> /dev/null; then
        # Use jq if available (more reliable)
        local current_version=$(jq -r '.version' manifest.json)
        print_status "Current version: $current_version"
        
        # Parse version components (supports x.y and x.y.z format)
        if [[ $current_version =~ ^([0-9]+)\.([0-9]+)\.?([0-9]*)$ ]]; then
            local major=${BASH_REMATCH[1]}
            local minor=${BASH_REMATCH[2]}
            local patch=${BASH_REMATCH[3]:-0}  # Default to 0 if not present
            
            # Increment patch version
            patch=$((patch + 1))
            local new_version="$major.$minor.$patch"
        else
            print_error "Invalid version format: $current_version"
            exit 1
        fi
        
        # Update manifest.json with new version
        jq --arg version "$new_version" '.version = $version' manifest.json > manifest.json.tmp
        mv manifest.json.tmp manifest.json
        
    else
        # Fallback to sed if jq is not available
        local current_version=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' manifest.json | sed 's/.*"\([^"]*\)".*/\1/')
        print_status "Current version: $current_version"
        
        # Parse version components
        if [[ $current_version =~ ^([0-9]+)\.([0-9]+)\.?([0-9]*)$ ]]; then
            local major=${BASH_REMATCH[1]}
            local minor=${BASH_REMATCH[2]}
            local patch=${BASH_REMATCH[3]:-0}  # Default to 0 if not present
            
            # Increment patch version
            patch=$((patch + 1))
            local new_version="$major.$minor.$patch"
        else
            print_error "Invalid version format: $current_version"
            exit 1
        fi
        
        # Update manifest.json with new version using sed
        sed -i.bak "s/\"version\"[[:space:]]*:[[:space:]]*\"[^\"]*\"/\"version\": \"$new_version\"/" manifest.json
        rm -f manifest.json.bak 2>/dev/null
    fi
    
    print_success "Version updated: $current_version → $new_version"
    
    # Update ZIP_NAME to include the new version
    ZIP_NAME="${EXTENSION_NAME}-v${new_version}-$(date +%Y%m%d-%H%M%S).zip"
}

# Function to check if required files exist
check_required_files() {
    print_status "Checking required files..."
    
    local required_files=(
        "manifest.json"
        "background.js"
        "content.js"
        "templates.js"
        "styles.css"
        "icons/icon16.png"
        "icons/icon32.png"
        "icons/icon48.png"
        "icons/icon128.png"
    )
    
    local missing_files=()
    
    for file in "${required_files[@]}"; do
        if [[ ! -f "$file" ]]; then
            missing_files+=("$file")
        fi
    done
    
    if [[ ${#missing_files[@]} -gt 0 ]]; then
        print_error "Missing required files:"
        for file in "${missing_files[@]}"; do
            echo "  - $file"
        done
        exit 1
    fi
    
    print_success "All required files found"
}

# Function to clean build directory
clean_build_dir() {
    if [[ -d "$BUILD_DIR" ]]; then
        print_status "Cleaning existing build directory..."
        rm -rf "$BUILD_DIR"
    fi
    
    mkdir -p "$BUILD_DIR"
    print_success "Build directory created: $BUILD_DIR"
}

# Function to copy extension files
copy_extension_files() {
    print_status "Copying extension files..."
    
    # Copy main extension files
    cp manifest.json "$BUILD_DIR/"
    cp background.js "$BUILD_DIR/"
    cp content.js "$BUILD_DIR/"
    cp templates.js "$BUILD_DIR/"
    cp styles.css "$BUILD_DIR/"
    
    # Copy icons directory
    cp -r icons "$BUILD_DIR/"
    
    print_success "Extension files copied to build directory"
}

# Function to create zip file
create_zip_file() {
    print_status "Creating zip file: $ZIP_NAME"
    
    # Change to build directory to create zip with correct structure
    cd "$BUILD_DIR"
    
    # Create zip file with all contents
    zip -r "../$ZIP_NAME" . -x "*.DS_Store" "*.git*" "*.zip"
    
    # Go back to original directory
    cd ..
    
    print_success "Zip file created: $ZIP_NAME"
}

# Function to validate zip contents
validate_zip() {
    print_status "Validating zip file contents..."
    
    # List contents of the zip file
    echo "Zip file contents:"
    unzip -l "$ZIP_NAME" | grep -E "\.(json|js|css|png)$" || true
    
    # Check zip file size
    local zip_size=$(du -h "$ZIP_NAME" | cut -f1)
    print_success "Zip file size: $zip_size"
}

# Function to display installation instructions
show_installation_instructions() {
    # Get current version for display
    local current_version=""
    if command -v jq &> /dev/null; then
        current_version=$(jq -r '.version' manifest.json)
    else
        current_version=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' manifest.json | sed 's/.*"\([^"]*\)".*/\1/')
    fi
    
    echo ""
    print_success "Build completed successfully!"
    echo ""
    print_status "Extension version: $current_version"
    print_status "Build output: $ZIP_NAME"
    echo ""
    echo "To install the extension in Chrome:"
    echo "1. Open Chrome and go to chrome://extensions/"
    echo "2. Enable 'Developer mode' in the top right"
    echo "3. Click 'Load unpacked'"
    echo "4. Select the '$BUILD_DIR' folder or extract the '$ZIP_NAME' file"
    echo ""
    echo "Files included in the build:"
    echo "  - manifest.json (extension configuration - v$current_version)"
    echo "  - background.js (background script)"
    echo "  - content.js (content script)"
    echo "  - templates.js (template definitions)"
    echo "  - styles.css (styling)"
    echo "  - icons/ (extension icons)"
    echo ""
}

# Main execution
main() {
    echo "=========================================="
    echo "  Uber Link Generator - Build Script"
    echo "=========================================="
    echo ""
    
    # Check if we're in the correct directory
    if [[ ! -f "manifest.json" ]]; then
        print_error "manifest.json not found. Please run this script from the extension root directory."
        exit 1
    fi
    
    # Execute build steps
    check_required_files
    update_version
    clean_build_dir
    copy_extension_files
    create_zip_file
    validate_zip
    show_installation_instructions
}

# Run main function
main "$@" 