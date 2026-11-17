import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const port = 20_000 + Math.floor(Math.random() * 20_000);
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, [new URL('../dist/http.js', import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1))], {
  env: {
    ...process.env,
    MCP_HOST: '127.0.0.1',
    MCP_PORT: String(port),
    MCP_ALLOWED_HOSTS: '127.0.0.1,localhost',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stderr = '';
let stdout = '';
child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });

try {
  await waitForHealth(`${origin}/health`, child);
  const metadata = await fetch(`${origin}/.well-known/oauth-protected-resource/mcp`).then((response) => response.json());
  if (metadata.resource !== 'https://ai.xmanmobi.com/mcp') throw new Error('OAuth protected-resource metadata is invalid');
  const unauthorized = await fetch(`${origin}/mcp`, { method: 'POST' });
  if (unauthorized.status !== 401) throw new Error(`Expected HTTP 401, received ${unauthorized.status}`);
  if (!unauthorized.headers.get('www-authenticate')?.includes('resource_metadata=')) {
    throw new Error('OAuth resource metadata is missing from WWW-Authenticate');
  }

  const client = new Client({ name: 'xmanmobi-http-smoke-test', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
    requestInit: { headers: { Authorization: 'Bearer smoke-test-token' } },
  });
  try {
    await client.connect(transport);
    const result = await client.listTools();
    if (!result.tools.some((tool) => tool.name === 'diagnose_ad_campaigns')) {
      throw new Error('diagnose_ad_campaigns was not registered over HTTP');
    }
    if (!result.tools.some((tool) => tool.name === 'analyze_ad_creatives')) {
      throw new Error('analyze_ad_creatives was not registered over HTTP');
    }
    for (const name of ['list_customers', 'list_delivery_projects', 'get_ad_overview', 'list_products', 'get_campaign_performance', 'compare_ad_periods', 'analyze_google_search_terms', 'list_ad_accounts', 'get_ad_group_performance', 'get_ad_performance', 'get_google_keyword_performance', 'analyze_conversion_funnel', 'check_data_quality', 'propose_ad_change', 'execute_ad_change', 'list_ad_change_audit', 'create_google_search_campaign', 'create_google_ad_group', 'create_google_responsive_search_ad', 'create_google_keyword', 'create_google_campaign_targeting']) {
      if (!result.tools.some((tool) => tool.name === name)) throw new Error(`${name} was not registered over HTTP`);
    }
    if (result.tools.length !== 23) throw new Error(`Expected 23 HTTP tools, received ${result.tools.length}`);
    console.log('HTTP smoke test passed: authentication and MCP initialization work.');
  } finally {
    await client.close();
  }
} finally {
  if (child.exitCode === null) {
    child.kill();
    await new Promise((resolve) => child.once('exit', resolve));
  }
  if (stderr) process.stderr.write(stderr);
}

async function waitForHealth(url, process) {
  let lastResult = 'no response';
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (process.exitCode !== null) {
      throw new Error(`HTTP MCP server exited with code ${process.exitCode}.\nstdout: ${stdout}\nstderr: ${stderr}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastResult = `HTTP ${response.status}: ${await response.text()}`;
    } catch (error) {
      lastResult = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`HTTP MCP server did not become healthy at ${url}. Last result: ${lastResult}\nstdout: ${stdout}\nstderr: ${stderr}`);
}
