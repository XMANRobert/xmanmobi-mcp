import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const apiUrl = (process.env.ADVANBI_API_URL || 'https://bis.joinaws.xyz').replace(/\/$/, '');
const configuredTimeout = Number(process.env.ADVANBI_REQUEST_TIMEOUT_MS || 30_000);
const requestTimeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 30_000;

export function createXmanmobiServer(defaultToken?: string) {
  const server = new McpServer({ name: 'xmanmobi-ad-tools', version: '1.0.0' });

  server.registerTool('diagnose_ad_campaigns', {
    title: 'Diagnose advertising campaigns',
    description: 'Analyze authorized Facebook and Google campaign performance in Xmanmobi and return metrics plus campaign-level diagnostic findings. This tool is read-only and never changes campaigns.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      platform: z.enum(['all', 'facebook', 'google']).default('all').describe('Advertising platform to analyze.'),
      customer_id: z.coerce.number().int().positive().optional().describe('Optional Xmanmobi customer ID visible to the connected user.'),
      delivery_id: z.coerce.number().int().positive().optional().describe('Optional delivery/project ID.'),
      start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Start date in YYYY-MM-DD format.'),
      end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('End date in YYYY-MM-DD format.'),
    },
  }, async (input, extra) => {
    const token = extra.authInfo?.token || defaultToken?.trim();
    if (!token) return toolError('A Xmanmobi Bearer token is required.');
    if (input.start_date && input.end_date && input.start_date > input.end_date) {
      return toolError('start_date must be earlier than or equal to end_date.');
    }

    const query = new URLSearchParams({ platform: input.platform });
    if (input.customer_id !== undefined) query.set('customer_id', String(input.customer_id));
    if (input.delivery_id !== undefined) query.set('delivery_id', String(input.delivery_id));
    if (input.start_date) query.set('start_date', input.start_date);
    if (input.end_date) query.set('end_date', input.end_date);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetch(`${apiUrl}/ai-tools/ad-diagnosis?${query}`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      const body = await readResponse(response);
      if (!response.ok) {
        return toolError(`Xmanmobi API request failed (${response.status} ${response.statusText}).`, body);
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(body, null, 2) }],
        structuredContent: normalizeStructuredContent(body),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return toolError(error instanceof Error && error.name === 'AbortError'
        ? `Xmanmobi API request timed out after ${requestTimeoutMs} ms.`
        : `Unable to reach the Xmanmobi API: ${message}`);
    } finally {
      clearTimeout(timer);
    }
  });

  server.registerTool('analyze_ad_creatives', {
    title: 'Analyze advertising creatives',
    description: 'Analyze the authorized Xmanmobi creative library and matched Google/Facebook performance, including metadata completeness, CTR, CPC, CPA, ROAS, issues, and recommendations. This tool is read-only.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      platform: z.enum(['all', 'facebook', 'google']).default('all').describe('Advertising platform to analyze.'),
      customer_id: z.coerce.number().int().positive().optional().describe('Optional Xmanmobi customer ID visible to the connected user.'),
      delivery_id: z.coerce.number().int().positive().optional().describe('Optional delivery/project ID.'),
      start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Start date in YYYY-MM-DD format.'),
      end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('End date in YYYY-MM-DD format.'),
      limit: z.coerce.number().int().min(1).max(100).default(30).describe('Maximum creatives and issues to return.'),
    },
  }, async (input, extra) => {
    const token = extra.authInfo?.token || defaultToken?.trim();
    if (!token) return toolError('A Xmanmobi Bearer token is required.');
    if (input.start_date && input.end_date && input.start_date > input.end_date) {
      return toolError('start_date must be earlier than or equal to end_date.');
    }
    return callAdvanbi('/ai-tools/material-analysis', input, token);
  });

  server.registerTool('list_customers', {
    title: 'List authorized customers',
    description: 'List Xmanmobi customers visible to the connected user, with product, delivery-project, and platform counts. Results are limited by the user\'s customer permissions.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      search: z.string().max(100).optional().describe('Optional customer-name search.'),
      limit: z.coerce.number().int().min(1).max(100).default(50).describe('Maximum customers to return.'),
    },
  }, async (input, extra) => {
    const token = extra.authInfo?.token || defaultToken?.trim();
    if (!token) return toolError('A Xmanmobi Bearer token is required.');
    return callAdvanbi('/ai-tools/customers', input, token);
  });

  server.registerTool('list_delivery_projects', {
    title: 'List advertising delivery projects',
    description: 'List authorized Xmanmobi delivery projects, their customer/product, platform, account count, conversion event, and latest report date. This tool is read-only.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      customer_id: z.coerce.number().int().positive().optional().describe('Optional Xmanmobi customer ID visible to the connected user.'),
      product_id: z.coerce.number().int().positive().optional().describe('Optional Xmanmobi product ID within the authorized customer scope.'),
      platform: z.enum(['all', 'facebook', 'google']).default('all').describe('Advertising platform.'),
      status: z.union([z.string(), z.number()]).optional().describe('Optional project status value.'),
      search: z.string().max(100).optional().describe('Optional project-name search.'),
      limit: z.coerce.number().int().min(1).max(100).default(50).describe('Maximum projects to return.'),
    },
  }, async (input, extra) => {
    const token = extra.authInfo?.token || defaultToken?.trim();
    if (!token) return toolError('A Xmanmobi Bearer token is required.');
    return callAdvanbi('/ai-tools/delivery-projects', input, token);
  });

  server.registerTool('get_ad_overview', {
    title: 'Get advertising performance overview',
    description: 'Return an authorized Facebook/Google advertising overview with totals, daily trend, platform summaries, top campaigns/projects, and data freshness.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      platform: z.enum(['all', 'facebook', 'google']).default('all').describe('Advertising platform.'),
      customer_id: z.coerce.number().int().positive().optional().describe('Optional Xmanmobi customer ID visible to the connected user.'),
      delivery_id: z.coerce.number().int().positive().optional().describe('Optional delivery/project ID.'),
      start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Start date in YYYY-MM-DD format; defaults to seven days ago.'),
      end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('End date in YYYY-MM-DD format; defaults to today.'),
    },
  }, async (input, extra) => {
    const token = extra.authInfo?.token || defaultToken?.trim();
    if (!token) return toolError('A Xmanmobi Bearer token is required.');
    if (input.start_date && input.end_date && input.start_date > input.end_date) return toolError('start_date must be earlier than or equal to end_date.');
    return callAdvanbi('/ai-tools/ad-overview', input, token);
  });

  server.registerTool('list_products', {
    title: 'List authorized products',
    description: 'List Xmanmobi products visible to the connected user, including their customer, delivery-project count, and advertising platforms. This tool is read-only.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      customer_id: z.coerce.number().int().positive().optional().describe('Optional Xmanmobi customer ID visible to the connected user.'),
      search: z.string().max(100).optional().describe('Optional product-name search.'),
      limit: z.coerce.number().int().min(1).max(100).default(50).describe('Maximum products to return.'),
    },
  }, async (input, extra) => {
    const token = extra.authInfo?.token || defaultToken?.trim(); if (!token) return toolError('A Xmanmobi Bearer token is required.');
    return callAdvanbi('/ai-tools/products', input, token);
  });

  server.registerTool('get_campaign_performance', {
    title: 'Get campaign performance',
    description: 'Return authorized Facebook and Google campaign metrics, searchable and sortable by common performance indicators.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      platform: z.enum(['all', 'facebook', 'google']).default('all').describe('Advertising platform to include.'),
      customer_id: z.coerce.number().int().positive().optional().describe('Optional Xmanmobi customer ID visible to the connected user.'),
      product_id: z.coerce.number().int().positive().optional().describe('Optional product ID within the authorized customer scope.'),
      delivery_id: z.coerce.number().int().positive().optional().describe('Optional delivery/project ID within the authorized customer scope.'),
      start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Start date in YYYY-MM-DD format; defaults to seven days ago.'),
      end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('End date in YYYY-MM-DD format; defaults to today.'),
      search: z.string().max(100).optional().describe('Optional campaign-name search.'),
      sort_by: z.enum(['spend', 'impressions', 'clicks', 'conversions', 'conversion_value', 'ctr', 'cpc', 'cpa', 'roas']).default('spend').describe('Metric used to sort results in descending order.'),
      limit: z.coerce.number().int().min(1).max(100).default(30).describe('Maximum campaigns to return.'),
    },
  }, async (input, extra) => {
    const token = extra.authInfo?.token || defaultToken?.trim(); if (!token) return toolError('A Xmanmobi Bearer token is required.');
    if (input.start_date && input.end_date && input.start_date > input.end_date) return toolError('start_date must be earlier than or equal to end_date.');
    return callAdvanbi('/ai-tools/campaign-performance', input, token);
  });

  server.registerTool('compare_ad_periods', {
    title: 'Compare advertising periods',
    description: 'Compare an authorized advertising date range with the immediately preceding range of equal length and calculate metric changes.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      platform: z.enum(['all', 'facebook', 'google']).default('all').describe('Advertising platform to compare.'),
      customer_id: z.coerce.number().int().positive().optional().describe('Optional Xmanmobi customer ID visible to the connected user.'),
      product_id: z.coerce.number().int().positive().optional().describe('Optional product ID within the authorized customer scope.'),
      delivery_id: z.coerce.number().int().positive().optional().describe('Optional delivery/project ID within the authorized customer scope.'),
      start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Start date in YYYY-MM-DD format; defaults to seven days ago.'),
      end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('End date in YYYY-MM-DD format; defaults to today.'),
    },
  }, async (input, extra) => {
    const token = extra.authInfo?.token || defaultToken?.trim(); if (!token) return toolError('A Xmanmobi Bearer token is required.');
    if (input.start_date && input.end_date && input.start_date > input.end_date) return toolError('start_date must be earlier than or equal to end_date.');
    return callAdvanbi('/ai-tools/period-comparison', input, token);
  });

  server.registerTool('analyze_google_search_terms', {
    title: 'Analyze Google search terms',
    description: 'Analyze authorized Google Ads search terms and flag converting terms, possible negative keywords, and terms needing more data. This tool never changes keywords.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      customer_id: z.coerce.number().int().positive().optional().describe('Optional Xmanmobi customer ID visible to the connected user.'),
      product_id: z.coerce.number().int().positive().optional().describe('Optional product ID within the authorized customer scope.'),
      delivery_id: z.coerce.number().int().positive().optional().describe('Optional delivery/project ID within the authorized customer scope.'),
      start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Start date in YYYY-MM-DD format; defaults to seven days ago.'),
      end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('End date in YYYY-MM-DD format; defaults to today.'),
      search: z.string().max(100).optional().describe('Optional search-term or campaign-name search.'),
      min_clicks: z.coerce.number().int().min(0).default(1).describe('Minimum clicks required for a search term to be included.'),
      min_spend: z.coerce.number().min(0).default(0).describe('Minimum spend required for a search term to be included.'),
      limit: z.coerce.number().int().min(1).max(100).default(30).describe('Maximum search terms to return.'),
    },
  }, async (input, extra) => {
    const token = extra.authInfo?.token || defaultToken?.trim(); if (!token) return toolError('A Xmanmobi Bearer token is required.');
    if (input.start_date && input.end_date && input.start_date > input.end_date) return toolError('start_date must be earlier than or equal to end_date.');
    return callAdvanbi('/ai-tools/google-search-terms', input, token);
  });

  const performanceInput = {
    platform: z.enum(['all', 'facebook', 'google']).default('all').describe('Advertising platform to include.'),
    customer_id: z.coerce.number().int().positive().optional().describe('Optional Xmanmobi customer ID visible to the connected user.'),
    product_id: z.coerce.number().int().positive().optional().describe('Optional product ID within the authorized customer scope.'),
    delivery_id: z.coerce.number().int().positive().optional().describe('Optional delivery/project ID within the authorized customer scope.'),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Start date in YYYY-MM-DD format; defaults to seven days ago.'),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('End date in YYYY-MM-DD format; defaults to today.'),
    search: z.string().max(100).optional().describe('Optional entity-name or keyword search.'),
    sort_by: z.enum(['spend', 'impressions', 'clicks', 'conversions', 'conversion_value', 'ctr', 'cpc', 'cpa', 'roas']).default('spend').describe('Metric used to sort results in descending order.'),
    limit: z.coerce.number().int().min(1).max(100).default(30).describe('Maximum rows to return.'),
  };
  const { platform: _platform, ...googlePerformanceInput } = performanceInput;
  const runReadOnly = (path: string) => async (input: Record<string, unknown>, extra: { authInfo?: { token?: string } }) => {
    const token = extra.authInfo?.token || defaultToken?.trim(); if (!token) return toolError('A Xmanmobi Bearer token is required.');
    if (typeof input.start_date === 'string' && typeof input.end_date === 'string' && input.start_date > input.end_date) return toolError('start_date must be earlier than or equal to end_date.');
    return callAdvanbi(path, input, token);
  };

  server.registerTool('list_ad_accounts', {
    title: 'List authorized advertising accounts', description: 'List bound Facebook and Google advertising accounts, project association, status, currency, and latest report date without exposing credentials.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      platform: z.enum(['all', 'facebook', 'google']).default('all').describe('Advertising platform to include.'),
      customer_id: z.coerce.number().int().positive().optional().describe('Optional Xmanmobi customer ID visible to the connected user.'),
      product_id: z.coerce.number().int().positive().optional().describe('Optional product ID within the authorized customer scope.'),
      delivery_id: z.coerce.number().int().positive().optional().describe('Optional delivery/project ID within the authorized customer scope.'),
    },
  }, runReadOnly('/ai-tools/ad-accounts'));

  server.registerTool('get_ad_group_performance', {
    title: 'Get ad group performance', description: 'Analyze Facebook ad sets and Google ad groups using authorized reporting data.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }, inputSchema: performanceInput,
  }, runReadOnly('/ai-tools/ad-group-performance'));

  server.registerTool('get_ad_performance', {
    title: 'Get individual ad performance', description: 'Analyze authorized Facebook and Google ads below the campaign/ad-group level.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }, inputSchema: performanceInput,
  }, runReadOnly('/ai-tools/ad-performance'));

  server.registerTool('get_google_keyword_performance', {
    title: 'Get Google keyword performance', description: 'Analyze authorized Google keywords including match type, quality score, cost, conversions, CPA, and ROAS.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: googlePerformanceInput,
  }, runReadOnly('/ai-tools/google-keywords'));

  server.registerTool('analyze_conversion_funnel', {
    title: 'Analyze conversion funnel', description: 'Analyze impressions, clicks, conversions, conversion value, and reported platform events for authorized projects.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      platform: z.enum(['all', 'facebook', 'google']).default('all').describe('Advertising platform to include.'),
      customer_id: z.coerce.number().int().positive().optional().describe('Optional Xmanmobi customer ID visible to the connected user.'),
      product_id: z.coerce.number().int().positive().optional().describe('Optional product ID within the authorized customer scope.'),
      delivery_id: z.coerce.number().int().positive().optional().describe('Optional delivery/project ID within the authorized customer scope.'),
      start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Start date in YYYY-MM-DD format; defaults to seven days ago.'),
      end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('End date in YYYY-MM-DD format; defaults to today.'),
    },
  }, runReadOnly('/ai-tools/conversion-funnel'));

  server.registerTool('check_data_quality', {
    title: 'Check advertising data quality', description: 'Find unbound accounts, missing reports, stale synchronization, and missing conversion values within the authorized customer scope.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      platform: z.enum(['all', 'facebook', 'google']).default('all').describe('Advertising platform to check.'),
      customer_id: z.coerce.number().int().positive().optional().describe('Optional Xmanmobi customer ID visible to the connected user.'),
      product_id: z.coerce.number().int().positive().optional().describe('Optional product ID within the authorized customer scope.'),
      delivery_id: z.coerce.number().int().positive().optional().describe('Optional delivery/project ID within the authorized customer scope.'),
      start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Start date in YYYY-MM-DD format; defaults to seven days ago.'),
      end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('End date in YYYY-MM-DD format; defaults to today.'),
    },
  }, runReadOnly('/ai-tools/data-quality'));

  server.registerTool('propose_ad_change', {
    title: 'Propose an advertising change',
    description: 'Create an audited, short-lived proposal to change an authorized Google or Facebook advertising resource. This does not modify the platform. Show the exact proposal to the user and obtain explicit confirmation before calling execute_ad_change.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    inputSchema: {
      platform: z.enum(['google', 'facebook']).describe('Advertising platform containing the resource.'),
      resource_type: z.enum(['campaign', 'adset', 'ad']).default('campaign').describe('Local BI resource type. Google currently supports campaign only.'),
      resource_id: z.coerce.number().int().positive().describe('Local Xmanmobi BI resource ID returned by an authorized listing or performance tool.'),
      action_type: z.enum(['set_daily_budget', 'set_status']).describe('Narrow change to propose. Individual ads support status only.'),
      new_value: z.union([z.string(), z.number()]).describe('New daily budget in account currency, or ENABLED/ACTIVE/PAUSED status.'),
      reason: z.string().min(1).max(1000).describe('Human-readable reason for the proposed change.'),
      evidence: z.record(z.unknown()).optional().describe('Optional metrics and analysis supporting the proposal; do not include credentials or personal data.'),
    },
  }, async (input, extra) => {
    const token = extra.authInfo?.token || defaultToken?.trim(); if (!token) return toolError('A Xmanmobi Bearer token is required.');
    return callAdvanbiJson('/ai-tools/ad-actions/propose', 'POST', input, token);
  });

  server.registerTool('execute_ad_change', {
    title: 'Execute a confirmed advertising change',
    description: 'Execute one previously proposed advertising change after the user explicitly confirms the exact platform, resource, old value, and new value. Requires the short-lived confirmation token and records an audit log.',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: {
      proposal_id: z.coerce.number().int().positive().describe('Proposal ID returned by propose_ad_change.'),
      confirmation_token: z.string().min(20).describe('Short-lived confirmation token returned by propose_ad_change. Never request or accept an OAuth access token here.'),
      confirm: z.literal(true).describe('Must be true only after the user explicitly confirms the exact proposed change.'),
    },
  }, async (input, extra) => {
    const token = extra.authInfo?.token || defaultToken?.trim(); if (!token) return toolError('A Xmanmobi Bearer token is required.');
    return callAdvanbiJson('/ai-tools/ad-actions/execute', 'POST', input, token);
  });

  server.registerTool('list_ad_change_audit', {
    title: 'List advertising change audit records',
    description: 'List the connected user\'s recent Xmanmobi advertising change proposals, rejections, executions, before/after values, and outcomes.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      platform: z.enum(['google', 'facebook']).optional().describe('Optional platform filter.'),
      resource_type: z.enum(['campaign', 'adset', 'ad']).optional().describe('Optional resource-type filter.'),
      status: z.enum(['success', 'failed', 'rejected']).optional().describe('Optional audit outcome filter.'),
      limit: z.coerce.number().int().min(1).max(100).default(30).describe('Maximum audit records to return.'),
    },
  }, async (input, extra) => {
    const token = extra.authInfo?.token || defaultToken?.trim(); if (!token) return toolError('A Xmanmobi Bearer token is required.');
    return callAdvanbi('/ai-tools/ad-actions/audit-logs', input, token);
  });

  return server;
}

async function callAdvanbiJson(path: string, method: 'POST', input: Record<string, unknown>, token: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(`${apiUrl}${path}`, {
      method,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    const body = await readResponse(response);
    if (!response.ok) return toolError(`Xmanmobi API request failed (${response.status} ${response.statusText}).`, body);
    return { content: [{ type: 'text' as const, text: JSON.stringify(body, null, 2) }], structuredContent: normalizeStructuredContent(body) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toolError(error instanceof Error && error.name === 'AbortError'
      ? `Xmanmobi API request timed out after ${requestTimeoutMs} ms.`
      : `Unable to reach the Xmanmobi API: ${message}`);
  } finally {
    clearTimeout(timer);
  }
}

async function callAdvanbi(path: string, input: Record<string, unknown>, token: string) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(`${apiUrl}${path}?${query}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    const body = await readResponse(response);
    if (!response.ok) return toolError(`Xmanmobi API request failed (${response.status} ${response.statusText}).`, body);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(body, null, 2) }],
      structuredContent: normalizeStructuredContent(body),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toolError(error instanceof Error && error.name === 'AbortError'
      ? `Xmanmobi API request timed out after ${requestTimeoutMs} ms.`
      : `Unable to reach the Xmanmobi API: ${message}`);
  } finally {
    clearTimeout(timer);
  }
}

function normalizeStructuredContent(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : { result: value };
}

async function readResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text) as unknown; } catch { return text; }
}

function toolError(message: string, details?: unknown) {
  const text = details === undefined ? message : `${message}\n${typeof details === 'string' ? details : JSON.stringify(details, null, 2)}`;
  return { isError: true, content: [{ type: 'text' as const, text }] };
}
