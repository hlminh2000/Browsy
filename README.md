# Browsy - Your AI Browser Assistant

Browsy is a powerful Chrome extension that brings AI-powered browsing assistance directly to your browser. Built with React and WXT, it helps you perform various browser tasks efficiently using natural language commands.

## Features

- 🤖 AI-powered browser automation
- 💬 Natural language interaction
- 🔒 Secure local storage of settings
- 🎯 Task automation (booking flights, finding restaurants, etc.)
- 🔄 Conversation history management
- 🌐 Seamless webpage interaction

## Installation

1. Clone this repository
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Build the extension:
   ```bash
   pnpm build
   ```
4. Load the extension in Chrome:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` directory from the project

## Configuration

1. After installation, click on the extension icon
2. Go to the options page
3. Enter your OpenAI API key
4. Save the settings

## Development

### Prerequisites

- Node.js
- pnpm
- Chrome browser

### Development Commands

```bash
# Start development server
pnpm dev

# Build for production
pnpm build

# Create distribution zip
pnpm zip

# Type checking
pnpm compile
```

### Project Structure

- `/entrypoints` - Extension entry points (background, content scripts, popup)
- `/common` - Shared utilities and hooks
- `/assets` - Static assets
- `/public` - Public assets (icons, etc.)

## Tech Stack

- React
- TypeScript
- WXT (Chrome Extension Framework)
- TailwindCSS
- PouchDB (for local storage)
- OpenAI API

## License

MIT
