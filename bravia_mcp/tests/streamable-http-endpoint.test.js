/**
 * StreamableHTTPエンドポイントのテスト
 * 
 * 注意: このテストを実行するには、.envファイルに正しいTV_IPとTV_PSKが設定されている必要があります
 * また、ローカルでMCPサーバーが起動している必要があります
 */

import axios from 'axios';
import { jest } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { spawn } from 'child_process';
import 'dotenv/config';

// テスト用のMCPクライアント
const mcpClient = axios.create({
  baseURL: 'http://localhost:3000',
  headers: {
    'Content-Type': 'application/json',
  },
});

// StreamableHTTPエンドポイントのテスト
describe('StreamableHTTP Endpoint Tests', () => {
  let sessionId;
  let serverProcess;

  // テスト前にサーバーを起動
  beforeAll(async () => {
    return new Promise((resolve, reject) => {
      serverProcess = spawn('node', ['build/index.js', '--transport=streamable'], {
        env: { ...process.env, PORT: '3000', TV_IP: '192.168.6.158', TV_PSK: '0000' }
      });

      let serverStarted = false;
      let serverReady = false;

      serverProcess.stdout.on('data', (data) => {
        console.log(`Server: ${data}`);
        const output = data.toString();
        if (output.includes('MCP Server listening')) {
          serverStarted = true;
        }
        if (serverStarted && output.includes('Protocol version: 2025-03-26')) {
          serverReady = true;
          // サーバーが完全に起動するまで少し待機
          setTimeout(resolve, 1000);
        }
      });

      serverProcess.stderr.on('data', (data) => {
        console.error(`Server Error: ${data}`);
      });

      serverProcess.on('error', (error) => {
        console.error('Failed to start server:', error);
        reject(error);
      });

      // タイムアウト設定
      setTimeout(() => {
        if (!serverReady) {
          reject(new Error('Server startup timeout'));
        }
      }, 5000);
    });
  });

  // テスト後にサーバーを停止
  afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill();
    }
  });

  // テスト前にセッションを初期化
  beforeAll(async () => {
    try {
      // 初期化リクエストを送信
      const initMessage = {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          version: '2025-03-26',
          capabilities: {}
        },
        id: 1
      };

      const response = await mcpClient.post('/mcp', initMessage);
      expect(response.status).toBe(200);
      expect(response.headers.get('x-protocol-version')).toBe('2025-03-26');
      expect(response.data).toHaveProperty('jsonrpc', '2.0');
      expect(response.data).toHaveProperty('result');
      expect(response.data.result).toHaveProperty('sessionId');
      
      sessionId = response.data.result.sessionId;
      console.log(`テスト用StreamableHTTPセッションID: ${sessionId}`);
    } catch (error) {
      console.error('StreamableHTTPセッションの初期化に失敗しました:', error.message);
      throw error;
    }
  });

  // テスト後にセッションを終了
  afterAll(async () => {
    if (sessionId) {
      try {
        await mcpClient.delete('/mcp', {
          headers: {
            'mcp-session-id': sessionId
          }
        });
        console.log('StreamableHTTPセッションを終了しました');
      } catch (error) {
        console.error('セッション終了に失敗しました:', error.message);
      }
    }
  });

  test('初期化リクエストが正しく処理されること', async () => {
    const initMessage = {
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        version: '2025-03-26',
        capabilities: {}
      },
      id: 1
    };

    const response = await mcpClient.post('/mcp', initMessage);
    expect(response.status).toBe(200);
    expect(response.headers.get('x-protocol-version')).toBe('2025-03-26');
    expect(response.data).toHaveProperty('jsonrpc', '2.0');
    expect(response.data).toHaveProperty('result');
    expect(response.data.result).toHaveProperty('sessionId');
  });

  test('GETリクエストでSSEストリームが確立されること', async () => {
    const response = await fetch('http://localhost:3000/mcp', {
      headers: {
        'mcp-session-id': sessionId
      }
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    expect(response.headers.get('x-protocol-version')).toBe('2025-03-26');
  });

  test('POSTリクエストが正しく処理されること', async () => {
    const testMessage = {
      jsonrpc: '2.0',
      method: 'test',
      params: { test: 'data' },
      id: 1
    };

    const response = await mcpClient.post('/mcp', testMessage, {
      headers: {
        'mcp-session-id': sessionId
      }
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('x-protocol-version')).toBe('2025-03-26');
    expect(response.data).toHaveProperty('jsonrpc', '2.0');
    expect(response.data).toHaveProperty('result');
  });

  test('無効なセッションIDでエラーが返されること', async () => {
    const invalidSessionId = 'invalid-session-id';
    const testMessage = {
      jsonrpc: '2.0',
      method: 'test',
      params: { test: 'data' },
      id: 1
    };

    try {
      await mcpClient.post('/mcp', testMessage, {
        headers: {
          'mcp-session-id': invalidSessionId
        }
      });
      fail('エラーが発生するはずでした');
    } catch (error) {
      expect(error.response.status).toBe(400);
      expect(error.response.data).toHaveProperty('jsonrpc', '2.0');
      expect(error.response.data).toHaveProperty('error');
      expect(error.response.data.error).toHaveProperty('code', -32000);
      expect(error.response.data.error).toHaveProperty('message', 'Bad Request: No valid session ID provided for non-initialization request');
    }
  });

  test('DELETEリクエストでセッションが終了すること', async () => {
    const response = await mcpClient.delete('/mcp', {
      headers: {
        'mcp-session-id': sessionId
      }
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('x-protocol-version')).toBe('2025-03-26');
    expect(response.data).toHaveProperty('jsonrpc', '2.0');
    expect(response.data).toHaveProperty('result', null);
  });

  test('SSEエンドポイントが無効化されていること', async () => {
    try {
      await mcpClient.post('/messages', {
        jsonrpc: '2.0',
        method: 'test',
        params: { test: 'data' },
        id: 1
      });
      fail('エラーが発生するはずでした');
    } catch (error) {
      expect(error.response.status).toBe(404);
      expect(error.response.data).toBe('SSE message endpoint not enabled (transport type is not SSE)');
    }
  });
}); 