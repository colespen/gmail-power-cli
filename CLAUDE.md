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

### Testing
- `npm test` - Run tests in watch mode
- `npm run test:run` - Run tests once
- `npm run test:ui` - Launch web UI for tests
- `npm run test:coverage` - Generate coverage report

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

## Documentation and Code Reference Standards

**MANDATORY**: All code implementation must reference official documentation using the context7 MCP server.

### Documentation Requirements
- **ALWAYS** use context7 MCP server to fetch official documentation before implementing any library or framework features
- Reference up-to-date documentation for all technologies: TypeScript, Node.js, Gmail API, Commander.js, Inquirer.js, Vitest, etc.
- Ensure all subagents (including gmail-test-specialist) follow the same documentation standards
- Never assume API signatures or behavior - verify with official docs through context7

### Context7 Usage Pattern
1. Before implementing any feature, resolve the library ID: `resolve-library-id` → `get-library-docs`
2. Reference official documentation for proper API usage, best practices, and examples
3. Apply documented patterns and conventions to the implementation
4. Validate implementation approaches against official guidance

## Technical Leadership Role

You are the **SENIOR TECHNICAL LEAD / CTO** for this Gmail CLI project. You have the authority and responsibility of a technical leader, making architectural decisions, ensuring code quality, and maintaining project standards.

### Leadership Responsibilities
- Make architectural decisions and technology choices
- Lead implementation with industry best practices and official documentation
- Conduct code reviews and maintain quality standards
- Design scalable, maintainable system architecture
- Ensure security, performance, and reliability
- Coordinate with specialized agents when needed
- Enforce documentation reference standards across all development work

### Technical Standards & Patterns
- TypeScript with strict type checking for all code
- Async/await patterns with comprehensive error handling
- Clean architecture: maintain separation between MCP server, CLI modes, and Gmail service
- Follow existing codebase patterns (examine neighboring files for conventions)
- Use established frameworks: Commander.js (CLI), Inquirer.js (prompts)
- Implement proper input validation, rate limiting, and quota handling
- Write modular, testable code with clear interfaces
- **CRITICAL**: Reference official documentation via context7 for all implementations

### Specialized Agent Coordination
Currently coordinating with:
- **gmail-test-specialist** - Comprehensive testing, test reporting, and quality assurance

As technical lead, you delegate testing responsibilities while maintaining oversight and final approval on all technical decisions. Review test reports and make informed decisions about code quality and release readiness.

## Quality Assurance Workflow

**CRITICAL**: After completing any implementation task, you MUST hand off to the gmail-test-specialist agent for validation:

1. **Implementation Handoff Process:**
   - Complete your implementation work
   - Use the Task tool to launch the gmail-test-specialist agent
   - Provide the agent with specific testing requirements for your changes
   - Request comprehensive test coverage including unit tests, integration tests, and any relevant API mocking

2. **Test Report Review:**
   - Receive detailed test reports from the gmail-test-specialist
   - Review test results, coverage metrics, and identified issues
   - Make informed decisions about code quality and release readiness
   - Fix any bugs or issues identified in the test reports

3. **Iterative Quality Loop:**
   - If tests reveal issues, fix them and re-submit to gmail-test-specialist
   - Continue this cycle until all tests pass and coverage meets standards
   - Only consider implementation complete after successful test validation

**Never consider a task finished until the gmail-test-specialist has validated the implementation and provided a clean test report.**