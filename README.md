# Link Generator Chrome Extension

A Chrome extension that helps you generate and open links from predefined templates using selected text from web pages.

## Features

- Generate links from predefined templates
- Use selected text from web pages as template parameters
- Keyboard shortcut (Ctrl+Shift+L or Command+Shift+L) to trigger the extension
- Clean and intuitive user interface
- Support for multiple templates

## Installation

1. Clone this repository or download the files
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the directory containing the extension files

## Usage

1. Browse any webpage
2. Press Ctrl+Shift+L (Windows/Linux) or Command+Shift+L (Mac) to activate the extension
3. Select a template from the popup
4. Click on text in the webpage to fill in the template parameters
5. Once all parameters are filled, the link will automatically open in a new tab

## Templates

The extension comes with some predefined templates:

- JIRA Ticket: `https://your-domain.atlassian.net/browse/{ticket}`
- GitHub PR: `https://github.com/{owner}/{repo}/pull/{pr_number}`
- Confluence Page: `https://your-domain.atlassian.net/wiki/spaces/{space}/pages/{page_id}`

You can modify the templates in `templates.js` to add your own templates.

## Development

To modify the extension:

1. Edit the files as needed
2. Go to `chrome://extensions/`
3. Find the extension and click the refresh icon
4. The changes will be applied

## Files

- `manifest.json`: Extension configuration
- `background.js`: Background script for handling keyboard shortcuts
- `content.js`: Content script for handling text selection
- `templates.js`: Template definitions
- `styles.css`: Styling for the popup
- `icons/`: Directory containing extension icons

## Note

You'll need to replace the template URLs in `templates.js` with your actual URLs before using the extension. 