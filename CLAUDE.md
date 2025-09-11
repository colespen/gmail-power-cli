# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

### Development
- `npm run build` - Compile TypeScript to JavaScript
- `npm run dev` - Run MCP server in development mode
- `npm run start` - Start the compiled MCP server
- `npm run auth` - Set up Gmail authentication (creates token.json)

### CLI Usage
- `npm run gmail` - Run the Groq-powered CLI interface
- `npm run gmail:debug` - Run CLI with Gemini debug mode
- `npm run cli` - Run basic CLI (legacy)

## Architecture

This is a Gmail CLI tool with dual interfaces:

### Core Components

**MCP Server Mode** (`src/mcp-server.ts`)
- Exposes Gmail functionality through Model Context Protocol
- Used by Claude Desktop for AI-powered email management
- Provides tools: search_emails, read_email, send_email, modify_labels, batch_operation, list_labels, create_label

**CLI Mode** (`src/cli-groq.ts`, `src/cli-gemini*.ts`)
- Interactive command-line interface with AI assistance
- Multiple AI provider integrations (Groq, Gemini, Anthropic)
- Conversation history and context management

**Gmail Service** (`src/gmail-service.ts`)
- Core Gmail API wrapper with methods for all email operations
- Handles authentication, email CRUD, label management, filters
- Centralized service used by both MCP server and CLI modes

**Authentication** (`src/auth.ts`)
- OAuth2 flow for Gmail API access
- Requires `credentials.json` and generates `token.json`
- Scopes: `gmail.modify` and `gmail.settings.basic`

### Required Files
- `credentials.json` - OAuth2 credentials from Google Cloud Console
- `token.json` - Generated after successful authentication
- `.env` - Environment variables (GROQ_API_KEY, GEMINI_API_KEY)

## Gmail API Integration

The service supports:
- Email search with Gmail query syntax
- Full email reading with attachments
- Label management and bulk operations  
- Email sending and thread replies
- Filter creation and management
- Batch operations (archive, delete, mark read/unread, star)

All Gmail operations require proper OAuth2 authentication with gmail.modify scope.