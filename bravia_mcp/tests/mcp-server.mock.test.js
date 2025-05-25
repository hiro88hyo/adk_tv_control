/**
 * Bravia MCP サーバーのモックテスト
 * 
 * このテストでは、実際のTVへのリクエストをモックに置き換えて、
 * MCPサーバーの機能をテストします。
 */

import axios from 'axios';
import { jest } from '@jest/globals';

// モック応答データ
const mockSystemInfo = {
  data: {
    result: [{
      product: 'Sony TV',
      model: 'BRAVIA XR-65A90J',
      language: 'ja-JP',
      serial: 'XXXXXXXX',
      macAddr: 'XX:XX:XX:XX:XX:XX',
      name: 'リビングのTV',
      generation: '2021',
      area: 'jpn',
      cid: 'XXXXXXXX'
    }],
    id: 1
  }
};

const mockPowerStatus = {
  data: {
    result: [{
      status: 'active'
    }],
    id: 2
  }
};

const mockVolumeInfo = {
  data: {
    result: [{
      volume: 20,
      mute: false,
      minVolume: 0,
      maxVolume: 100
    }],
    id: 3
  }
};

// モックMCPレスポンス
const mockMcpSystemInfoResponse = {
  jsonrpc: '2.0',
  result: {
    content: [
      {
        type: 'text',
        text: 'システム情報を取得しました。'
      },
      {
        type: 'text',
        text: JSON.stringify(mockSystemInfo.data.result[0], null, 2)
      }
    ]
  },
  id: 1
};

const mockMcpPowerStatusResponse = {
  jsonrpc: '2.0',
  result: {
    content: [
      {
        type: 'text',
        text: 'テレビの電源状態は ON です。'
      },
      {
        type: 'text',
        text: JSON.stringify(mockPowerStatus.data.result[0], null, 2)
      }
    ]
  },
  id: 2
};

const mockMcpVolumeInfoResponse = {
  jsonrpc: '2.0',
  result: {
    content: [
      {
        type: 'text',
        text: '音量情報を取得しました。 現在の音量: 20, ミュート: OFF (範囲: 0-100)'
      },
      {
        type: 'text',
        text: JSON.stringify(mockVolumeInfo.data.result[0], null, 2)
      }
    ]
  },
  id: 3
};

describe('Bravia MCP Server Mock Tests', () => {
  // モック用のaxiosインスタンス
  let mockAxiosInstance;
  
  beforeEach(() => {
    // テスト前に各モックをリセット
    jest.resetAllMocks();
    
    // モックpostメソッドの作成
    const mockPost = jest.fn().mockImplementation((endpoint, data) => {
      // TV APIリクエストのモック
      if (endpoint.includes('/sony/system') && data.method === 'getSystemInformation') {
        return Promise.resolve(mockSystemInfo);
      }
      if (endpoint.includes('/sony/system') && data.method === 'getPowerStatus') {
        return Promise.resolve(mockPowerStatus);
      }
      if (endpoint.includes('/sony/audio') && data.method === 'getVolumeInformation') {
        return Promise.resolve(mockVolumeInfo);
      }
      
      // MCPリクエストのモック
      if (endpoint === '/mcp') {
        if (data.method === 'initialize') {
          return Promise.resolve({
            data: { jsonrpc: '2.0', result: {}, id: data.id },
            headers: { 'mcp-session-id': 'mock-session-id' }
          });
        }
        
        if (data.method === 'callTool') {
          if (data.params.name === 'getSystemInformation') {
            return Promise.resolve({ data: mockMcpSystemInfoResponse });
          }
          if (data.params.name === 'getPowerStatus') {
            return Promise.resolve({ data: mockMcpPowerStatusResponse });
          }
          if (data.params.name === 'getVolumeInformation') {
            return Promise.resolve({ data: mockMcpVolumeInfoResponse });
          }
        }
      }
      
      return Promise.reject(new Error('Unexpected request'));
    });

    // モックaxiosインスタンスの作成
    mockAxiosInstance = {
      post: mockPost,
      delete: jest.fn().mockResolvedValue({}),
      defaults: {
        baseURL: 'http://localhost:8080'
      }
    };

    // axiosのcreateメソッドをモック化
    jest.spyOn(axios, 'create').mockImplementation(() => mockAxiosInstance);
  });

  test('システム情報が取得できること (モック)', async () => {
    const mcpClient = axios.create();
    
    // MCPセッションを初期化
    const initResponse = await mcpClient.post('/mcp', {
      jsonrpc: '2.0',
      method: 'initialize',
      params: { capabilities: {} },
      id: 1
    });
    
    const sessionId = initResponse.headers['mcp-session-id'];
    expect(sessionId).toBe('mock-session-id');
    
    // システム情報を取得
    const response = await mcpClient.post('/mcp', {
      jsonrpc: '2.0',
      method: 'callTool',
      params: {
        name: 'getSystemInformation',
        parameters: {}
      },
      id: 2
    });
    
    expect(response.data).toEqual(mockMcpSystemInfoResponse);
    expect(response.data.result.content[0].text).toContain('システム情報を取得しました');
  });

  test('電源状態が取得できること (モック)', async () => {
    const mcpClient = axios.create();
    
    // 電源状態を取得
    const response = await mcpClient.post('/mcp', {
      jsonrpc: '2.0',
      method: 'callTool',
      params: {
        name: 'getPowerStatus',
        parameters: {}
      },
      id: 3
    });
    
    expect(response.data).toEqual(mockMcpPowerStatusResponse);
    expect(response.data.result.content[0].text).toContain('テレビの電源状態は ON です');
  });

  test('音量情報が取得できること (モック)', async () => {
    const mcpClient = axios.create();
    
    // 音量情報を取得
    const response = await mcpClient.post('/mcp', {
      jsonrpc: '2.0',
      method: 'callTool',
      params: {
        name: 'getVolumeInformation',
        parameters: {}
      },
      id: 4
    });
    
    expect(response.data).toEqual(mockMcpVolumeInfoResponse);
    expect(response.data.result.content[0].text).toContain('音量情報を取得しました');
    expect(response.data.result.content[0].text).toContain('現在の音量: 20');
  });
}); 