import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const source = await readFile(new URL('../js/modules/mcp/protocol.js', import.meta.url), 'utf8');
const calls = [];
const termuxEndpoint = 'http://127.0.0.1:8765/mcp';
let sessionNumber = 0;
let expireToolSessionOnce = true;

const jsonResponse = (body, status = 200, headers = {}) => new Response(
  body == null ? '' : JSON.stringify(body),
  { status, headers: { 'Content-Type': 'application/json', ...headers } }
);

const fetchMock = async (url, options = {}) => {
  const request = options.body ? JSON.parse(options.body) : null;
  calls.push({ url, options, request });
  if (options.method === 'DELETE') return jsonResponse(null, 204);
  if (request.method === 'initialize') {
    if (url === termuxEndpoint && request.params.protocolVersion !== '2025-06-18') {
      return jsonResponse({
        jsonrpc: '2.0', id: request.id,
        error: { code: -32000, message: 'Unsupported protocol version' }
      });
    }
    sessionNumber += 1;
    return jsonResponse({
      jsonrpc: '2.0', id: request.id,
      result: {
        protocolVersion: request.params.protocolVersion,
        serverInfo: { name: 'Mock MCP' },
        capabilities: { tools: { listChanged: true }, resources: { subscribe: true }, prompts: {} }
      }
    }, 200, { 'Mcp-Session-Id': `session-${sessionNumber}` });
  }
  if (request.method === 'notifications/initialized') return jsonResponse(null, 202);
  if (request.method === 'tools/list') {
    const result = request.params?.cursor
      ? { tools: [{ name: 'second', inputSchema: { type: 'object' } }] }
      : { tools: [{ name: 'first', inputSchema: { type: 'object' } }], nextCursor: 'page-2' };
    return jsonResponse({ jsonrpc: '2.0', id: request.id, result });
  }
  if (request.method === 'resources/list') return jsonResponse({ error: 'broken resource listing' }, 500);
  if (request.method === 'resources/templates/list') return jsonResponse({ jsonrpc: '2.0', id: request.id, result: { resourceTemplates: [] } });
  if (request.method === 'prompts/list') return jsonResponse({ jsonrpc: '2.0', id: request.id, result: { prompts: [{ name: 'draft' }] } });
  if (request.method === 'tools/call' && expireToolSessionOnce) {
    expireToolSessionOnce = false;
    return jsonResponse({ error: 'expired' }, 410);
  }
  if (request.method === 'tools/call') return jsonResponse({ jsonrpc: '2.0', id: request.id, result: { content: [{ type: 'text', text: 'done' }] } });
  throw new Error(`Unexpected method: ${request?.method}`);
};

const context = {
  window: { crypto: webcrypto },
  crypto: webcrypto,
  fetch: fetchMock,
  Response,
  Headers,
  AbortController,
  TextDecoder,
  URL,
  setTimeout,
  clearTimeout,
  console
};
vm.createContext(context);
vm.runInContext(source, context, { filename: 'protocol.js' });

const connection = {
  id: 'mock', endpoint: 'https://mcp.example.test/rpc', authType: 'bearer',
  customHeaders: { 'X-Client': 'OVO' }
};
const client = context.window.McpProtocol.createClient({ connection, getSecret: async () => 'secret-token', getTimeout: () => 5000 });
await client.initialize();
assert.equal(connection.sessionId, 'session-1');
assert.equal(connection.serverInfo.name, 'Mock MCP');
assert.equal(calls[0].request.params.protocolVersion, '2025-11-25');

const discovered = await client.discover();
assert.deepEqual(Array.from(discovered.tools, item => item.name), ['first', 'second']);
assert.deepEqual(Array.from(discovered.prompts, item => item.name), ['draft']);
assert.match(discovered.errors.resources, /500/);
assert.equal(discovered.resourceTemplates.length, 0);

const result = await client.request('tools/call', { name: 'first', arguments: {} });
assert.equal(result.content[0].text, 'done');
assert.equal(connection.sessionId, 'session-2');
assert.equal(sessionNumber, 2);

const authorizedCall = calls.find(item => item.request?.method === 'tools/call');
assert.equal(authorizedCall.options.headers.Authorization, 'Bearer secret-token');
assert.equal(authorizedCall.options.headers['X-Client'], 'OVO');
assert.ok(authorizedCall.options.headers['MCP-Protocol-Version']);

const events = context.window.McpProtocol.parseSseEvents('id: 7\nevent: message\ndata: {"jsonrpc":"2.0","method":"notifications/tools/list_changed"}\n\n');
assert.equal(events[0].id, '7');
assert.equal(events[0].data.method, 'notifications/tools/list_changed');
assert.throws(() => context.window.McpProtocol.normalizeHeaders({ Authorization: 'forbidden' }), /不允许覆盖/);

await client.close();

const termuxConnection = { id: 'termux', type: 'termux', transport: 'bridge', endpoint: termuxEndpoint };
const termuxClient = context.window.McpProtocol.createClient({ connection: termuxConnection });
await termuxClient.initialize();
const termuxCapabilities = await termuxClient.discover();
assert.deepEqual(Array.from(termuxCapabilities.tools, tool => tool.name), ['first', 'second']);
const termuxResult = await termuxClient.request('tools/call', { name: 'first', arguments: {} });
assert.equal(termuxResult.content[0].text, 'done');
const termuxCalls = calls.filter(call => call.url === termuxEndpoint);
assert.equal(termuxCalls[0].request.params.protocolVersion, '2025-06-18');
assert.equal(termuxCalls.find(call => call.request.method === 'tools/call').options.headers['MCP-Protocol-Version'], '2025-06-18');

const orchestratorSource = await readFile(new URL('../js/modules/chat-ai/mcp-orchestrator.js', import.meta.url), 'utf8');
const executed = [];
context.window.mcpManager = {
  getToolsForChat: () => [{
    connectionId: 'mock', connectionName: 'Mock MCP', toolName: 'lookup', title: 'Lookup',
    description: 'Read a record', inputSchema: { type: 'object', properties: { id: { type: 'string' } } },
    permissionSettings: { mode: 'required' }, required: true
  }],
  getChatSettings: () => ({ maxCallsPerTurn: 3 }),
  getSettings: () => ({ maxResultLength: 30000 }),
  executeTool: async input => { executed.push(input); return { ok: true, text: 'record found' }; }
};
vm.runInContext(orchestratorSource, context, { filename: 'mcp-orchestrator.js' });
const modelTurns = [];
const orchestrated = await context.window.McpChatOrchestrator.run({
  chat: { id: 'chat', history: [{ role: 'user', content: 'find record 42' }] },
  messages: [{ role: 'user', content: 'find record 42' }],
  send: async input => {
    modelTurns.push(input);
    if (modelTurns.length === 1) {
      return { text: '', toolCalls: [{ id: 'call-1', name: 'mcp_tool_1', arguments: '{"id":"42"}' }] };
    }
    assert.equal(input.messages.at(-1).role, 'tool');
    assert.match(input.messages.at(-1).content, /不可信数据/);
    return { text: 'completed', toolCalls: [] };
  }
});
assert.equal(orchestrated, 'completed');
assert.equal(modelTurns[0].requireTool, true);
assert.equal(executed[0].arguments.id, '42');
console.log('MCP protocol and orchestration tests passed.');
