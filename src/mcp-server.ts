import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequest,
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { GmailService } from "./gmail-service.js";
import { GmailHandlers } from "./handlers.js";
import {
  SearchEmailsSchema,
  ReadEmailSchema,
  SendEmailSchema,
  ModifyLabelsSchema,
  BatchOperationSchema,
  CreateLabelSchema,
  validateArgs,
} from "./schemas.js";

// init services
const gmailService = new GmailService();
const handlers = new GmailHandlers(gmailService);

// create MCP server
const server = new Server(
  {
    name: "gmail-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "search_emails",
      description: "Search for emails using Gmail query syntax",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              'Gmail search query (e.g., "is:unread from:example@gmail.com")',
          },
          maxResults: {
            type: "number",
            description: "Maximum number of results to return",
            default: 10,
          },
        },
        required: ["query"],
      },
    },
    {
      name: "read_email",
      description: "Read the full content of an email",
      inputSchema: {
        type: "object",
        properties: {
          messageId: {
            type: "string",
            description: "The ID of the email message",
          },
        },
        required: ["messageId"],
      },
    },
    {
      name: "send_email",
      description: "Send a new email or reply to a thread",
      inputSchema: {
        type: "object",
        properties: {
          to: {
            type: "array",
            items: { type: "string" },
            description: "Recipient email addresses",
          },
          subject: {
            type: "string",
            description: "Email subject",
          },
          body: {
            type: "string",
            description: "Email body content",
          },
          cc: {
            type: "array",
            items: { type: "string" },
            description: "CC recipients",
          },
          threadId: {
            type: "string",
            description: "Thread ID for replies",
          },
        },
        required: ["to", "subject", "body"],
      },
    },
    {
      name: "modify_labels",
      description: "Add or remove labels from emails",
      inputSchema: {
        type: "object",
        properties: {
          messageIds: {
            type: "array",
            items: { type: "string" },
            description: "Email message IDs to modify",
          },
          addLabels: {
            type: "array",
            items: { type: "string" },
            description: "Label IDs to add",
          },
          removeLabels: {
            type: "array",
            items: { type: "string" },
            description: "Label IDs to remove",
          },
        },
        required: ["messageIds"],
      },
    },
    {
      name: "batch_operation",
      description: "Perform batch operations on emails matching a query",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Gmail search query to find emails",
          },
          operation: {
            type: "string",
            enum: [
              "archive",
              "delete",
              "markRead",
              "markUnread",
              "star",
              "unstar",
            ],
            description: "Operation to perform",
          },
        },
        required: ["query", "operation"],
      },
    },
    {
      name: "list_labels",
      description: "List all available Gmail labels",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "create_label",
      description: "Create a new Gmail label",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Name for the new label",
          },
        },
        required: ["name"],
      },
    },
  ],
}));

// handle tool execution
server.setRequestHandler(
  CallToolRequestSchema,
  async (request: CallToolRequest) => {
    const { name, arguments: args } = request.params;

    if (!args || typeof args !== "object") {
      return {
        content: [
          {
            type: "text",
            text: "Error: Missing or invalid arguments",
          },
        ],
        isError: true,
      };
    }

    try {
      // ensure Gmail service is initialized
      if (!gmailService["gmail"]) {
        await gmailService.initialize();
      }

      switch (name) {
        case "search_emails": {
          const validArgs = validateArgs(SearchEmailsSchema, args);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  await handlers.searchEmails(validArgs),
                  null,
                  2
                ),
              },
            ],
          };
        }

        case "read_email": {
          const validArgs = validateArgs(ReadEmailSchema, args);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  await handlers.readEmail(validArgs),
                  null,
                  2
                ),
              },
            ],
          };
        }

        case "send_email": {
          const validArgs = validateArgs(SendEmailSchema, args);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  await handlers.sendEmail(validArgs),
                  null,
                  2
                ),
              },
            ],
          };
        }

        case "modify_labels": {
          const validArgs = validateArgs(ModifyLabelsSchema, args);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  await handlers.modifyLabels(validArgs),
                  null,
                  2
                ),
              },
            ],
          };
        }

        case "batch_operation": {
          const validArgs = validateArgs(BatchOperationSchema, args);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  await handlers.batchOperation(validArgs),
                  null,
                  2
                ),
              },
            ],
          };
        }

        case "list_labels":
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(await handlers.listLabels(), null, 2),
              },
            ],
          };

        case "create_label": {
          const validArgs = validateArgs(CreateLabelSchema, args);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  await handlers.createLabel(validArgs),
                  null,
                  2
                ),
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Gmail MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
