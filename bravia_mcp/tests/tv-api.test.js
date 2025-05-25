/**
 * Sony Bravia TV API テスト
 * 
 * 注意: このテストを実行するには、.envファイルに正しいTV_IPとTV_PSKが設定されている必要があります
 */

import axios from 'axios';
import { jest } from '@jest/globals';
import 'dotenv/config';

const TV_IP = process.env.TV_IP;
const TV_PSK = process.env.TV_PSK;

// テスト用のRPCクライアント
const tvRpcClient = axios.create({
  baseURL: `http://${TV_IP}`,
  headers: {
    'Content-Type': 'application/json',
    'X-Auth-PSK': TV_PSK,
  },
});

/**
 * テレビにJSON-RPCコマンドを送信するヘルパー関数
 */
async function sendTvRpcCommand(endpoint, method, version, params = []) {
  const payload = {
    method: method,
    params: params,
    version: version,
    id: Math.floor(Math.random() * (Math.pow(2, 31) - 1)) + 1,
  };

  try {
    const response = await tvRpcClient.post(endpoint, payload);
    return response.data;
  } catch (error) {
    console.error(`Failed to send RPC command (${method}):`, error.message || error);
    throw error;
  }
}

// 環境変数のチェック
beforeAll(() => {
  if (!TV_IP || !TV_PSK) {
    console.error('環境変数 TV_IP と TV_PSK が設定されていません');
    process.exit(1);
  }
});

// テレビと通信できない環境ではテストをスキップ
describe('Sony Bravia TV API Tests', () => {
  // タイムアウトを長めに設定（テレビの応答が遅い場合があるため）
  jest.setTimeout(10000);

  test('システム情報が取得できること', async () => {
    const response = await sendTvRpcCommand('/sony/system', 'getSystemInformation', '1.0');
    expect(response).toHaveProperty('result');
    expect(Array.isArray(response.result)).toBe(true);
    expect(response.result[0]).toHaveProperty('product');
    expect(response.result[0]).toHaveProperty('model');
  });

  let powerStatus;
  test('電源状態が取得できること', async () => {
    const response = await sendTvRpcCommand('/sony/system', 'getPowerStatus', '1.0');
    expect(response).toHaveProperty('result');
    expect(Array.isArray(response.result)).toBe(true);
    expect(response.result[0]).toHaveProperty('status');
    // status は 'active' または 'standby' のいずれかであること
    expect(['active', 'standby']).toContain(response.result[0].status);
    // 後続のテストで使用するために電源状態を保存
    powerStatus = response.result[0].status;
  });

  test('音量情報が取得できること', async () => {
    // テレビの電源がスタンバイ状態の場合はテストをスキップ
    if (powerStatus === 'standby') {
      console.log('テレビの電源がオフのためテストをスキップします (エラーコード40005を回避)');
      return;
    }
    
    const response = await sendTvRpcCommand('/sony/audio', 'getVolumeInformation', '1.0');
    
    // エラーコード40005（ディスプレイオフ）の場合もテストをスキップ
    if (response.error && response.error[0] === 40005) {
      console.log('テレビがディスプレイオフ状態のためテストをスキップします (エラーコード40005)');
      return;
    }
    
    expect(response).toHaveProperty('result');
    expect(Array.isArray(response.result)).toBe(true);
    expect(response.result[0]).toHaveProperty('volume');
    expect(response.result[0]).toHaveProperty('mute');
    expect(typeof response.result[0].volume).toBe('number');
    expect(typeof response.result[0].mute).toBe('boolean');
  });
}); 