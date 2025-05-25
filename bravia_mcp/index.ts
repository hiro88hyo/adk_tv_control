import express, { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js"
import { z } from 'zod';
import { CallToolResult, isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { InMemoryEventStore } from '@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js';
import axios, { AxiosInstance } from 'axios'
import 'dotenv/config'

// --- Configuration ---
const TV_IP = process.env.TV_IP;
const TV_PSK = process.env.TV_PSK;
const PORT = parseInt(process.env.PORT || '3000');

// --- コマンドライン引数の処理 ---
// デフォルトはStreamableHTTP、--transport=sseでSSEを選択可能
let transportType = 'streamable';
const transportArg = process.argv.find(arg => arg.startsWith('--transport='));
if (transportArg) {
  const type = transportArg.split('=')[1];
  if (type === 'sse') {
    transportType = 'sse';
  }
}
console.log(`Using transport type: ${transportType}`);

if (!TV_IP || !TV_PSK) {
  console.error('Error: TV_IP and TV_PSK environment variables must be set.');
  process.exit(1);
}

// --- TV JSON-RPC Client ---
// Axiosインスタンスを作成し、共通の設定（ベースURL, ヘッダー）を適用
const tvRpcClient: AxiosInstance = axios.create({
  baseURL: `http://${TV_IP}`,
  headers: {
    'Content-Type': 'application/json',
    'X-Auth-PSK': TV_PSK,
  },
});

/**
 * テレビにJSON-RPCコマンドを送信するヘルパー関数
 * @param endpoint RPCエンドポイントのパス (例: '/sony/system', '/sony/avContent', '/sony/audio')
 * @param method RPCメソッド名
 * @param params RPCパラメータ (配列またはオブジェクト)
 * @returns RPCレスポンスの 'result' フィールド
 * @throws エラーが発生した場合 (ネットワークエラー, HTTPエラー, RPCエラー)
 */
async function sendTvRpcCommand(endpoint: string, method: string, version: string, params: any = []): Promise<any> {
  const payload = {
    method: method,
    params: params,
    version: version,
    id: Math.floor(Math.random() * (Math.pow(2, 31) - 1)) + 1, // リクエストIDはユニークにする
  };

  console.log(`Sending RPC to TV: ${endpoint} Method: ${method}`, payload);

  try {
    const response = await tvRpcClient.post(endpoint, payload);

    console.log(`Received RPC response from TV (${method}):`, response.data);

    if (response.data.error) {
      // TVからのRPCエラー
      const rpcError = response.data.error;
      console.error(`TV RPC Error (${method}): Code ${rpcError[0]}, Message: ${rpcError[1]}`);

      // エラーメッセージを詳細に設定
      let errorMessage = rpcError[1];
      if (rpcError[0] === 40005 && rpcError[1] === 'Display Is Turned off') {
        errorMessage = 'テレビの電源がオフです: Display Is Turned off (Code: 40005)';
      }

      throw new Error(`TV RPC Error: ${errorMessage} (Code: ${rpcError[0]})`);
    }

    // RPC成功時の 'result' を返す
    return response.data.result;

  } catch (error: any) {
    console.error(`Failed to send RPC command (${method}):`, error.message || error);
    if (error.response) {
      // HTTPエラー (例: 401 Unauthorized, 404 Not Found)
      console.error(`HTTP Error: ${error.response.status} - ${error.response.statusText}`);
      throw new Error(`HTTP Error from TV: ${error.response.status} - ${error.response.statusText}`);
    } else if (error.request) {
      // ネットワークエラー (TVに到達できないなど)
      console.error(`Network Error: Could not reach TV at ${TV_IP}`);
      throw new Error(`Network Error: Could not reach TV at ${TV_IP}`);
    } else {
      // その他のエラー
      throw new Error(`Unexpected Error: ${error.message || 'Unknown error'}`);
    }
  }
}


// --- MCP Server Setup ---
const server = new McpServer({
  name: 'BraviaControl',
  version: '0.1.0',
  description: 'A server to control a SONY Bravia TV via JSON-RPC',
}, { capabilities: { logging: {} } }); // ロギング機能を有効にする例

// --- Register TV Control Tools ---

// 1. getSystemInformation
server.tool(
  'getSystemInformation',
  'テレビのシステム情報を取得します。',
  {},
  async (_, { sendNotification }): Promise<CallToolResult> => {
    try {
      // テレビの /sony/system エンドポイントに getSystemInformation メソッドを送信
      const systemInfo = await sendTvRpcCommand('/sony/system', 'getSystemInformation', '1.0');

      return {
        content: [
          {
            type: 'text',
            text: 'システム情報を取得しました。',
          },
          {
            type: 'text',
            text: JSON.stringify(systemInfo[0], null, 2) // JSONを整形して文字列化
          }
        ],
      };
    } catch (error: any) {
      await sendNotification({
        method: "notifications/message",
        params: { level: "error", data: `システム情報の取得に失敗しました: ${error.message}` }
      });
      return {
        content: [
          {
            type: 'text',
            text: `システム情報の取得に失敗しました: ${error.message}`,
          },
        ],
      };
    }
  }
);

// 2. getPowerStatus
server.tool(
  'getPowerStatus',
  'テレビの電源状態を取得します。',
  {},
  async (_, { sendNotification }): Promise<CallToolResult> => {
    try {
      // テレビの /sony/system エンドポイントに getPowerStatus メソッドを送信
      const powerStatusResult = await sendTvRpcCommand('/sony/system', 'getPowerStatus', '1.0');

      // 結果は [{ "status": "active" | "standby" }] の形式が多い
      const status = powerStatusResult?.[0]?.status;

      let statusText = '不明';
      if (status === 'active') {
          statusText = 'ON';
      } else if (status === 'standby') {
          statusText = 'OFF';
      }

      return {
        content: [
          {
            type: 'text',
            text: `テレビの電源状態は ${statusText} です。`,
          },
           {
             type: 'text',
             text: JSON.stringify(powerStatusResult[0], null, 2) // Raw JSONも提供
           }
        ],
      };
    } catch (error: any) {
      await sendNotification({
        method: "notifications/message",
        params: { level: "error", data: `電源状態の取得に失敗しました: ${error.message}` }
      });
      return {
        content: [
          {
            type: 'text',
            text: `電源状態の取得に失敗しました: ${error.message}`,
          },
        ],
      };
    }
  }
);

// 3. setPowerStatus
server.tool(
  'setPowerStatus',
  'テレビの電源状態を設定します。',
  { // 修正後: ZodRawShapeとしてオブジェクトシェイプを渡す
    status: z.enum(['on', 'off']).describe("設定する電源状態 ('on' または 'off')")
  },
  async ({ status }, { sendNotification }): Promise<CallToolResult> => {
    try {
      // MCPの 'on'/'off' をテレビの 'active'/'standby' にマッピング
      const tvStatus = status === 'on' ? true : false;

      // テレビの /sony/system エンドポイントに setPowerStatus メソッドを送信
      // パラメータは [{ "status": "active" | "standby" }] の形式が多い
      await sendTvRpcCommand('/sony/system', 'setPowerStatus', '1.0', [{ status: tvStatus }],);

      const action = status === 'on' ? 'をON' : 'をOFF';
      return {
        content: [
          {
            type: 'text',
            text: `テレビの電源${action}にしました。`,
          },
        ],
      };
    } catch (error: any) {
      await sendNotification({
        method: "notifications/message",
        params: { level: "error", data: `電源状態の設定に失敗しました: ${error.message}` }
      });
      return {
        content: [
          {
            type: 'text',
            text: `電源状態の設定に失敗しました: ${error.message}`,
          },
        ],
      };
    }
  }
);

// 4. getContentList (チャンネルリストや入力リスト)
server.tool(
  'getContentList',
  "利用可能なチャンネルや入力のリストを取得します。TVの場合はsourceに'tv:isdbt'を指定します。BSの場合は'tv:isdbbs'、CSの場合は'tv:isdbcs'です。",
  { // 修正後: ZodRawShapeとしてオブジェクトシェイプを渡す
      source: z.string().optional().describe("取得したいソース。TVの場合はsourceに'tv:isdbt'を指定します。BSの場合は'tv:isdbbs'、CSの場合は'tv:isdbcs'です。")
  },
  async ({ source }, { sendNotification }): Promise<CallToolResult> => {
    try {
      // テレビの /sony/avContent エンドポイントに getContentList メソッドを送信
      // パラメータは [{ "source": "source_type" }] の形式が多い
      // sourceが指定されていなければ、TV側がデフォルトで返すものに依存します。
      const params = source ? [{ stIdx: 0, cnt: 100, source: source }] : [{ stIdx: 0, cnt: 100, source: 'tv:isdbt'}];
      const contentList = await sendTvRpcCommand('/sony/avContent', 'getContentList', '1.0', params);

      // contentList はコンテンツのリストを含む配列 [{ uri: "...", title: "..." }] など
      // 各アイテムの表示名とURIを抽出してリスト化する
      let listText = '利用可能なコンテンツリスト:\n';
      if (Array.isArray(contentList) && contentList.length > 0) {
          contentList[0].forEach((item: any) => {
              // item構造はAPIによるが、一般的にuriとtitleを持つ
              const uri = item?.uri || 'N/A';
              const title = item?.title || 'N/A';
              const text = item?.text || 'N/A'; // textフィールドを持つ場合もある
              listText += `- ${title !== 'N/A' ? title : text} (URI: ${uri})\n`;
          });
          listText += "\nこれらのURIを 'setPlayContent' ツールで使用してコンテンツを選択できます。";
      } else {
          listText = 'コンテンツリストは取得できませんでした。ソースを確認してください。';
          if (source) {
              listText += ` (ソース: ${source})`;
          }
      }


      return {
        content: [
          {
            type: 'text',
            text: listText,
          },
          {
              type: 'text',
              text: JSON.stringify(contentList[0], null, 2) // Raw JSONも提供
          }
        ],
      };
    } catch (error: any) {
      await sendNotification({
        method: "notifications/message",
        params: { level: "error", data: `コンテンツリストの取得に失敗しました: ${error.message}` }
      });
      return {
        content: [
          {
            type: 'text',
            text: `コンテンツリストの取得に失敗しました: ${error.message}`,
          },
        ],
      };
    }
  }
);

// 5. setPlayContent (チャンネルまたは入力を切り替え)
server.tool(
  'setPlayContent',
  '指定されたURIのコンテンツを再生（表示）します。',
  { // 修正後: ZodRawShapeとしてオブジェクトシェイプを渡す
    uri: z.string().describe("再生したいコンテンツのURI (例: 'extInput:hdmi?port=1', 'tv:dvbt?channel=1'). 'getContentList' で取得したURIを使用してください。")
  },
  async ({ uri }, { sendNotification }): Promise<CallToolResult> => {
    try {
      // テレビの /sony/avContent エンドポイントに setPlayContent メソッドを送信
      // パラメータは [{ "uri": "content_uri" }] の形式が多い
      await sendTvRpcCommand('/sony/avContent', 'setPlayContent', '1.0', [{ uri: uri }]);

      return {
        content: [
          {
            type: 'text',
            text: `コンテンツ (URI: ${uri}) に切り替えました。`,
          },
        ],
      };
    } catch (error: any) {
      await sendNotification({
        method: "notifications/message",
        params: { level: "error", data: `コンテンツの切り替えに失敗しました: ${error.message}` }
      });
      return {
        content: [
          {
            type: 'text',
            text: `コンテンツの切り替えに失敗しました: ${error.message}`,
          },
        ],
      };
    }
  }
);

// 6. getVolumeInformation
server.tool(
  'getVolumeInformation',
  'テレビの音量とミュートの状態を取得します。',
  {},
  async (_, { sendNotification }): Promise<CallToolResult> => {
    try {
      // テレビの /sony/audio エンドポイントに getVolumeInformation メソッドを送信
      // 結果は [{ "volume": ..., "minVolume": ..., "maxVolume": ..., "mute": true|false }] の形式が多い
      const volumeInfoResult = await sendTvRpcCommand('/sony/audio', 'getVolumeInformation', '1.0');

      // APIによっては結果が配列でなくオブジェクトの場合があるため、適切にアクセス
      const volumeInfo = Array.isArray(volumeInfoResult) ? volumeInfoResult[0] : volumeInfoResult;

      const volume = volumeInfo[0]?.volume;
      const mute = volumeInfo[0]?.mute;
      const minVolume = volumeInfo[0]?.minVolume;
      const maxVolume = volumeInfo[0]?.maxVolume;

      let statusText = '音量情報を取得しました。';
      if (volume !== undefined) {
          statusText += ` 現在の音量: ${volume}`;
      }
       if (mute !== undefined) {
          statusText += `, ミュート: ${mute ? 'ON' : 'OFF'}`;
      }
       if (minVolume !== undefined && maxVolume !== undefined) {
          statusText += ` (範囲: ${minVolume}-${maxVolume})`;
      } else if (minVolume !== undefined) {
          statusText += ` (最小音量: ${minVolume})`;
      } else if (maxVolume !== undefined) {
          statusText += ` (最大音量: ${maxVolume})`;
      }

      return {
        content: [
          {
            type: 'text',
            text: statusText,
          },
          {
              type: 'text',
              text: JSON.stringify(volumeInfoResult[0][0], null, 2) // Raw JSONも提供
          }
        ],
      };
    } catch (error: any) {
      // テレビのエラーコードとメッセージをチェック
      if (error.message?.includes('40005') || error.message?.includes('Display Is Turned off')) {
        const errorMsg = 'テレビの電源がオフになっているため、音量情報を取得できません。先にテレビの電源をONにしてください。';
        await sendNotification({
          method: "notifications/message",
          params: { level: "error", data: errorMsg }
        });
        return {
          content: [
            {
              type: 'text',
              text: errorMsg,
            },
          ],
        };
      }

      await sendNotification({
        method: "notifications/message",
        params: { level: "error", data: `音量情報の取得に失敗しました: ${error.message}` }
      });
      return {
        content: [
          {
            type: 'text',
            text: `音量情報の取得に失敗しました: ${error.message}`,
          },
        ],
      };
    }
  }
);

// 7. setAudioVolume
server.tool(
  'setAudioVolume',
  'テレビの音量またはミュートの状態を設定します。',
  { 
    target: z.enum(['speaker', 'headphone']).default('speaker').describe("音量を設定する対象 ('speaker' または 'headphone')"),
    volume: z.string().optional().describe("設定する音量レベル (0-100)"),
    mute: z.boolean().optional().describe("設定するミュート状態 (trueでミュートON, falseでミュートOFF)")
  },
  async ({ target, volume, mute }, { sendNotification }): Promise<CallToolResult> => {
      if (volume === undefined && mute === undefined) {
           await sendNotification({
                method: "notifications/message",
                params: { level: "warning", data: "setAudioVolumeツールには、'volume' または 'mute' のいずれか、または両方が必要です。" }
           });
           return {
                content: [{ type: 'text', text: "エラー: 設定する音量 ('volume') またはミュート状態 ('mute') を指定してください。" }]
           };
      }

    try {
        let message = '音量を設定しました。';

        // 音量レベルの設定
        if (volume !== undefined && volume !== null) {
            // volumeがオブジェクトの場合（例: { volume: 10 }）に対応
            let volumeValue: any = volume;
            if (typeof volume === 'object' && volume !== null && 'volume' in volume) {
                volumeValue = (volume as any).volume;
            }
            const volumeNum = parseInt(volumeValue, 10);
            if (isNaN(volumeNum) || volumeNum < 0 || volumeNum > 100) {
                throw new Error('音量は0から100の間の数値を指定してください。');
            }
            await sendTvRpcCommand('/sony/audio', 'setAudioVolume', '1.0', [{ volume: volumeNum.toString(), target: target }]);
            message = `${target === 'speaker' ? 'スピーカー' : 'ヘッドホン'}の音量を ${volumeNum} に設定しました。`;
            if (mute !== undefined && mute !== null) {
                message += ` そしてミュートを${mute ? 'ON' : 'OFF'}にしました。`;
            }
        }

        // ミュート状態の設定
        if (mute !== undefined && mute !== null) {
            await sendTvRpcCommand('/sony/audio', 'setAudioMute', '1.0', [{ status: mute }]);
            if (volume === undefined || volume === null) {
                message = `ミュートを${mute ? 'ON' : 'OFF'}にしました。`;
            }
        }

      return {
        content: [
          {
            type: 'text',
            text: message,
          },
        ],
      };
    } catch (error: any) {
      await sendNotification({
        method: "notifications/message",
        params: { level: "error", data: `音量/ミュートの設定に失敗しました: ${error.message}` }
      });
      return {
        content: [
          {
            type: 'text',
            text: `音量/ミュートの設定に失敗しました: ${error.message}`,
          },
        ],
      };
    }
  }
);


// --- Express Server Setup (from sample) ---
const app = express();
app.use(express.json());

// トランスポートの型によってストレージを分ける
const streamableTransports: { [sessionId: string]: StreamableHTTPServerTransport } = {};
const sseTransports: { [sessionId: string]: SSEServerTransport } = {};

// SSE用のエンドポイント
app.get('/sse', async (req: Request, res: Response) => {
  if (transportType !== 'sse') {
    res.status(404).send('SSE endpoint not enabled (transport type is not SSE)');
    return;
  }
  // CORSヘッダー追加
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Protocol-Version', '2024-11-05');
  
  //const sessionId = randomUUID();
  
  // SSEServerTransportの作成
  // エンドポイントとしてSSEから送信されるメッセージの宛先を指定
  const transport = new SSEServerTransport('/messages', res);
  console.log(`Creating new SSE connection with sessionId: ${transport.sessionId}`);
  
  // トランスポートをMCPサーバーに接続
  await server.connect(transport);
  
  // セッションIDをクライアントに知らせる
  // message-portイベントとして送信し、クライアントがPOSTリクエスト先を知るようにする
  const endpoint = `/messages?sessionId=${transport.sessionId}`;
  res.write(`event: message-port\ndata: ${JSON.stringify({ endpoint })}\n\n`);
  
  // 接続トランスポートを保存
  sseTransports[transport.sessionId] = transport;
  
  // SSEクライアントが切断したときの処理
  req.on('close', async () => {
    console.log(`SSE connection closed for session ${transport.sessionId}`);
    if (sseTransports[transport.sessionId]) {
      delete sseTransports[transport.sessionId];
    }
  });
});

// StreamableHTTP用のMCPリクエスト処理
app.post('/mcp', async (req: Request, res: Response) => {
  if (transportType !== 'streamable') {
    res.status(404).send('StreamableHTTP endpoint not enabled with current transport type');
    return;
  }
  
  res.setHeader('X-Protocol-Version', '2025-03-26');
  console.log('Received MCP POST request');
  
  try {
    // セッションIDの確認
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && streamableTransports[sessionId]) {
      // 既存のトランスポートを再利用
      transport = streamableTransports[sessionId];
      console.log(`Reusing transport for session ${sessionId}`);
    } else if (!sessionId && isInitializeRequest(req.body)) {
      // 初期化リクエスト
      const eventStore = new InMemoryEventStore();
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        eventStore,
        onsessioninitialized: (newSessionId) => {
          console.log(`Session initialized with ID: ${newSessionId}`);
          streamableTransports[newSessionId] = transport;
        }
      });

      // トランスポートがクローズされたときのクリーンアップ
      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && streamableTransports[sid]) {
          console.log(`Transport closed for session ${sid}, removing from transports map`);
          delete streamableTransports[sid];
        }
      };

      // MCPサーバーにトランスポートを接続
      await server.connect(transport);
      console.log('New transport connected to server.');

      // 初期化リクエストを処理
      await transport.handleRequest(req, res, req.body);
      return;
    } else {
      // 無効なリクエスト - セッションIDがないか、初期化リクエストではない
      console.warn('Bad Request: No valid session ID provided or not an initialization request');
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: No valid session ID provided for non-initialization request',
        },
        id: null,
      });
      return;
    }

    // 既存のトランスポートでリクエストを処理
    await transport.handleRequest(req, res, req.body);

  } catch (error) {
    console.error('Error handling StreamableHTTP POST request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  }
});

// SSE用のPOSTリクエスト処理
async function handleSsePost(req: Request, res: Response) {
  try {
    const sessionId = req.query.sessionId as string;
    if (!sessionId || !sseTransports[sessionId]) {
      console.warn(`SSE POST: Invalid or missing session ID: ${sessionId}`);
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Invalid or missing session ID',
        },
        id: null,
      });
      return;
    }
    const transport = sseTransports[sessionId];
    
    // メッセージ処理を先に行い、その後でレスポンスを送信
    await transport.handlePostMessage(req, res, req.body);
    
    // 処理が成功したことをクライアントに通知
    if (!res.headersSent) {
      res.status(202).json({
        jsonrpc: '2.0',
        result: null,
        id: req.body.id || null,
      });
    }
  } catch (error) {
    console.error('Error handling SSE POST request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  }
}

// --- 以前のGETおよびDELETEリクエストのハンドラーを変更 ---
app.get('/mcp', async (req: Request, res: Response) => {
  if (transportType !== 'streamable') {
    res.status(404).send('StreamableHTTP GET endpoint not enabled with current transport type');
    return;
  }
  
  res.setHeader('X-Protocol-Version', '2025-03-26');
  console.log('Received MCP GET request (SSE)');
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !streamableTransports[sessionId]) {
    console.warn(`SSE Request: Invalid or missing session ID: ${sessionId}`);
    res.status(400).send('Invalid or missing session ID');
    return;
  }

  const lastEventId = req.headers['last-event-id'] as string | undefined;
  if (lastEventId) {
    console.log(`Client reconnecting with Last-Event-ID: ${lastEventId} for session ${sessionId}`);
  } else {
    console.log(`Establishing new SSE stream for session ${sessionId}`);
  }

  const transport = streamableTransports[sessionId];
  try {
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error('Error handling MCP GET request (SSE):', error);
    if (!res.headersSent) {
      res.status(500).send('Error establishing SSE stream');
    }
  }
});

app.delete('/mcp', async (req: Request, res: Response) => {
  if (transportType !== 'streamable') {
    res.status(404).send('StreamableHTTP DELETE endpoint not enabled with current transport type');
    return;
  }
  
  res.setHeader('X-Protocol-Version', '2025-03-26');
  console.log('Received MCP DELETE request (Terminate Session)');
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !streamableTransports[sessionId]) {
    console.warn(`Terminate Session Request: Invalid or missing session ID: ${sessionId}`);
    res.status(400).send('Invalid or missing session ID');
    return;
  }

  console.log(`Received session termination request for session ${sessionId}`);

  try {
    const transport = streamableTransports[sessionId];
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error('Error handling session termination:', error);
    if (!res.headersSent) {
      res.status(500).send('Error processing session termination');
    }
  }
});

// SSE用のメッセージエンドポイント
app.post('/messages', async (req: Request, res: Response) => {
  if (transportType !== 'sse') {
    res.status(404).send('SSE message endpoint not enabled (transport type is not SSE)');
    return;
  }
  
  res.setHeader('X-Protocol-Version', '2024-11-05');
  await handleSsePost(req, res);
});

// --- サーバーの起動 ---
const serverInstance = app.listen(PORT, () => {
  console.log(`MCP Server listening on port ${PORT}, transport type: ${transportType}`);
  console.log(`Targeting TV at IP: ${TV_IP}`);
  
  if (transportType === 'streamable') {
    console.log(`StreamableHTTP endpoint: http://localhost:${PORT}/mcp`);
    console.log(`Protocol version: 2025-03-26`);
  } else if (transportType === 'sse') {
    console.log(`SSE endpoint: http://localhost:${PORT}/sse`);
    console.log(`SSE message endpoint: http://localhost:${PORT}/messages?sessionId=<your-session-id>`);
    console.log(`Protocol version: 2024-11-05`);
  }
  
  console.log(`Set environment variables TV_IP and TV_PSK.`);
});

// サーバーのシャットダウン処理
process.on('SIGINT', async () => {
  console.log('Shutting down server...');

  // すべてのStreamableHTTPトランスポートをクローズ
  for (const sessionId in streamableTransports) {
    try {
      console.log(`Closing StreamableHTTP transport for session ${sessionId}`);
      await streamableTransports[sessionId].close();
    } catch (error) {
      console.error(`Error closing StreamableHTTP transport for session ${sessionId}:`, error);
    }
  }
  
  // SSEトランスポートのセッションをクリア
  Object.keys(sseTransports).forEach(sessionId => {
    console.log(`Removing SSE transport for session ${sessionId}`);
    delete sseTransports[sessionId];
  });

  // MCPサーバーをクローズ
  try {
    await server.close();
    console.log('MCP server closed.');
  } catch (error) {
    console.error('Error closing MCP server:', error);
  }

  // HTTPサーバーをクローズ
  serverInstance.close((err) => {
    if (err) {
      console.error('Error closing HTTP server:', err);
      process.exit(1);
    }
    console.log('HTTP server closed.');
    console.log('Server shutdown complete');
    process.exit(0);
  });
});