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

## Default Templates

The extension comes with the following predefined templates:

### Quark Fare Visualization Templates
- **Quark Fare Viz Prod**: `https://fares.uberinternal.com/fares?lifecycleId={lifecycleId}&contextId={contextId}&requestId={requestId}&environment=Production`
  - Parameters: `lifecycleId`, `contextId`, `requestId`
- **Quark Fare Viz Shadow**: `https://fares.uberinternal.com/fares?lifecycleId={lifecycleId}&contextId={contextId}&requestId={requestId}&environment=Shadow`
  - Parameters: `lifecycleId`, `contextId`, `requestId`
- **Quark Fare Viz Staging**: `https://fares.uberinternal.com/fares?lifecycleId={lifecycleId}&contextId={contextId}&requestId={requestId}&environment=Staging`
  - Parameters: `lifecycleId`, `contextId`, `requestId`

### Wayfare Fares Inspector
- **Wayfare Fares Inspector**: `https://fares.uberinternal.com/inspect/production/{sessionId}/{flowId}/{requestId}`
  - Parameters: `sessionId`, `flowId`, `requestId`

### Chronicle
- **Chronicle**: `https://chronicle.uberinternal.com/trip/{tripId}/overview`
  - Parameters: `tripId`

## Customizing Templates

The extension includes a built-in template management system that allows you to add, edit, and delete templates directly through the UI. All templates are saved in Chrome's local storage and persist between sessions.

### Adding New Templates via UI

1. **Open the Template Manager**: 
   - Press Ctrl+Shift+L (Windows/Linux) or Command+Shift+L (Mac) to activate the extension
   - Look for a "Manage Templates" or "Add Template" option in the popup

2. **Fill in Template Details**:
   - **Template Name**: Enter a descriptive name that will appear in the template list
   - **URL Template**: Enter your URL with placeholders in `{parameterName}` format
   - **Parameters**: Add the parameter names that users need to select from the webpage

3. **Template URL Examples**:
   - **Simple Path**: `https://example.com/users/{userId}/profile`
   - **Query Parameters**: `https://example.com/search?q={query}&type={type}`
   - **Mixed**: `https://example.com/projects/{projectId}/issues/{issueId}?status={status}`

4. **Save the Template**: Click "Save" or "Add Template" to store your new template

### Template Management Features

The extension's UI allows you to:

- **Add Templates**: Create new templates with custom parameters
- **Edit Templates**: Modify existing template URLs, names, or parameters
- **Delete Templates**: Remove templates you no longer need
- **Reorder Templates**: Arrange templates in your preferred order

### Best Practices for Template Creation

1. **Use Clear Names**: Choose descriptive template names that indicate the purpose
2. **Meaningful Parameters**: Use parameter names that clearly indicate what data is needed (e.g., `ticketId`, `userId`, `projectName`)
3. **Test Your Templates**: Always test new templates to ensure they generate correct URLs
4. **URL Encoding**: The extension automatically handles URL encoding of parameter values

### Template URL Patterns

**Path Parameters:**
```
https://your-domain.com/path/{param1}/{param2}
```

**Query Parameters:**
```
https://your-domain.com/search?query={searchTerm}&filter={filterType}
```

**Mixed Parameters:**
```
https://your-domain.com/projects/{projectId}/issues/{issueId}?status={status}&priority={priority}
```

### Troubleshooting

**Template Not Appearing:**
- Ensure all required fields are filled in the template form
- Check that the template name is unique
- Try refreshing the extension popup

**Parameters Not Working:**
- Verify parameter names in the template URL are enclosed in `{}`
- Ensure parameter names match exactly (case-sensitive)
- Check that all required parameters are included in the parameters list

**URL Not Opening:**
- Test the generated URL manually in your browser
- Verify the base URL is correct and accessible
- Check that all required parameters are being provided by the user

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

The default templates are configured for Uber internal services. You'll need to replace the template URLs in `templates.js` with your actual URLs before using the extension in your environment. 