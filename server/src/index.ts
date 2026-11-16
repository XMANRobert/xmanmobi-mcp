import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createXmanmobiServer } from './server.js';

async function main() {
  const server = createXmanmobiServer(process.env.ADVANBI_API_TOKEN);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Failed to start Xmanmobi MCP stdio server:', error);
  process.exit(1);
});
