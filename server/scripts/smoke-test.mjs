import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const serverEntry = new URL('../dist/index.js', import.meta.url);
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverEntry.pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1))],
  env: {
    ...process.env,
    ADVANBI_API_TOKEN: '',
  },
});
const client = new Client({ name: 'xmanmobi-smoke-test', version: '1.0.0' });

try {
  await client.connect(transport);
  const tools = await client.listTools();
  const diagnosticTool = tools.tools.find((tool) => tool.name === 'diagnose_ad_campaigns');
  if (!diagnosticTool) throw new Error('diagnose_ad_campaigns was not registered');
  if (!tools.tools.some((tool) => tool.name === 'analyze_ad_creatives')) {
    throw new Error('analyze_ad_creatives was not registered');
  }
  for (const name of ['list_customers', 'list_delivery_projects', 'get_ad_overview', 'list_products', 'get_campaign_performance', 'compare_ad_periods', 'analyze_google_search_terms', 'list_ad_accounts', 'get_ad_group_performance', 'get_ad_performance', 'get_google_keyword_performance', 'analyze_conversion_funnel', 'check_data_quality']) {
    if (!tools.tools.some((tool) => tool.name === name)) throw new Error(`${name} was not registered`);
  }
  if (tools.tools.length !== 15) throw new Error(`Expected 15 tools, received ${tools.tools.length}`);
  for (const tool of tools.tools) {
    if (!tool.description?.trim()) throw new Error(`${tool.name} is missing a description`);
    for (const hint of ['readOnlyHint', 'destructiveHint', 'openWorldHint']) {
      if (typeof tool.annotations?.[hint] !== 'boolean') throw new Error(`${tool.name} is missing boolean ${hint}`);
    }
    for (const [property, schema] of Object.entries(tool.inputSchema?.properties || {})) {
      if (!schema.description?.trim()) throw new Error(`${tool.name}.${property} is missing an input description`);
    }
  }

  const result = await client.callTool({
    name: diagnosticTool.name,
    arguments: { platform: 'google' },
  });
  if (!result.isError) throw new Error('Expected missing-token call to return an MCP tool error');

  console.log(`MCP smoke test passed: ${tools.tools.length} tool(s) registered.`);
} finally {
  await client.close();
}
