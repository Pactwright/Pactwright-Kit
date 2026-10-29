import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Pactwright } from "@pactwright/agent";
import { tools } from "./index.ts";
import type { ToolContext } from "./tool.ts";

export interface ServerOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transport?: any;
  agent?: Pactwright;
}

export function createServer(options?: ServerOptions): Server {
  const server = new Server(
    {
      name: "pactwright-mcp",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  const context: ToolContext = {
    agent: options?.agent,
  };

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema ?? {
          type: "object",
          properties: {},
        },
      })),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = tools.find((t) => t.name === request.params.name);
    if (!tool) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: `Tool not found: ${request.params.name}` }),
          },
        ],
        isError: true,
      };
    }

    try {
      const parsedArgs = tool.input.parse(request.params.arguments ?? {});
      const handler = tool.handler as (args: unknown, ctx?: ToolContext) => Promise<unknown>;
      const result = await handler(parsedArgs, context);
      return {
        content: [
          {
            type: "text",
            text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

export async function startServer(options?: ServerOptions): Promise<void> {
  const server = createServer(options);
  const transport = options?.transport ?? new StdioServerTransport();
  await server.connect(transport);
}
