/**
 * SSEエンドポイントのテスト
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

// SSEエンドポイントのテスト
describe('SSE Endpoint Tests', () => {
  let sessionId;
  let endpoint;
  let serverProcess;

  // テスト前にサーバーを起動
  beforeAll(async () => {
    return new Promise((resolve, reject) => {
      serverProcess = spawn('node', ['build/index.js', '--transport=sse'], {
        env: { ...process.env, PORT: '3000' }
      });

      serverProcess.stdout.on('data', (data) => {
        console.log(`Server: ${data}`);
        if (data.toString().includes('MCP Server listening')) {
          resolve();
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
        reject(new Error('Server startup timeout'));
      }, 5000);
    });
  });

  // テスト後にサーバーを停止
  afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill();
    }
  });

  // テスト前にSSE接続を確立
  beforeAll(async () => {
    try {
      // SSEエンドポイントに接続
      const response = await fetch('http://localhost:3000/sse');
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/event-stream');
      expect(response.headers.get('cache-control')).toBe('no-cache, no-transform');
      expect(response.headers.get('connection')).toBe('keep-alive');
      expect(response.headers.get('x-protocol-version')).toBe('2024-11-05');
      
      // message-portイベントを待機
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let messagePortData;
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('event: message-port')) {
            const dataLine = lines[lines.indexOf(line) + 1];
            if (dataLine.startsWith('data: ')) {
              messagePortData = JSON.parse(dataLine.slice(6));
              break;
            }
          }
        }
        
        if (messagePortData) break;
      }
      
      expect(messagePortData).toBeDefined();
      expect(messagePortData).toHaveProperty('endpoint');
      endpoint = messagePortData.endpoint;
      
      // セッションIDを抽出
      const match = endpoint.match(/sessionId=([^&]+)/);
      expect(match).toBeDefined();
      sessionId = match[1];
      
      console.log(`テスト用SSEセッションID: ${sessionId}`);
      console.log(`テスト用SSEエンドポイント: ${endpoint}`);
    } catch (error) {
      console.error('SSE接続の確立に失敗しました:', error.message);
      throw error;
    }
  });

  // テスト後に接続を終了
  afterAll(async () => {
    if (sessionId) {
      console.log('SSEセッションを終了しました');
    }
  });

  test('SSEエンドポイントが正しく応答すること', async () => {
    const response = await fetch('http://localhost:3000/sse');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    expect(response.headers.get('cache-control')).toBe('no-cache, no-transform');
    expect(response.headers.get('connection')).toBe('keep-alive');
    expect(response.headers.get('x-protocol-version')).toBe('2024-11-05');
  });

  test('message-portイベントが正しく送信されること', async () => {
    const response = await fetch('http://localhost:3000/sse');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let messagePortData;
    
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('event: message-port')) {
          const dataLine = lines[lines.indexOf(line) + 1];
          if (dataLine.startsWith('data: ')) {
            messagePortData = JSON.parse(dataLine.slice(6));
            break;
          }
        }
      }
      
      if (messagePortData) break;
    }
    
    expect(messagePortData).toBeDefined();
    expect(messagePortData).toHaveProperty('endpoint');
    expect(messagePortData.endpoint).toMatch(/^\/messages\?sessionId=[a-f0-9-]+$/);
  });

  test('POSTリクエストが正しく処理されること', async () => {
    const testMessage = {
      jsonrpc: '2.0',
      method: 'test',
      params: { test: 'data' },
      id: 1
    };

    const response = await mcpClient.post(`/messages?sessionId=${sessionId}`, testMessage);
    expect(response.status).toBe(202);
    expect(response.headers.get('x-protocol-version')).toBe('2024-11-05');
    expect(response.data).toBe('Accepted');
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
      await mcpClient.post(`/messages?sessionId=${invalidSessionId}`, testMessage);
      fail('エラーが発生するはずでした');
    } catch (error) {
      expect(error.response.status).toBe(400);
      expect(error.response.data).toHaveProperty('jsonrpc', '2.0');
      expect(error.response.data).toHaveProperty('error');
      expect(error.response.data.error).toHaveProperty('code', -32000);
      expect(error.response.data.error).toHaveProperty('message', 'Invalid or missing session ID');
    }
  });

  test('StreamableHTTPエンドポイントが無効化されていること', async () => {
    const testMessage = {
      jsonrpc: '2.0',
      method: 'test',
      params: { test: 'data' },
      id: 1
    };

    try {
      await mcpClient.post('/mcp', testMessage);
      fail('エラーが発生するはずでした');
    } catch (error) {
      expect(error.response.status).toBe(404);
      expect(error.response.data).toBe('StreamableHTTP endpoint not enabled with current transport type');
    }
  });
}); 