# ADK TV Control

🎬 **Sony Bravia TV制御のためのマルチコンテナプロジェクト**

Node.js製のMCP（Model Context Protocol）サーバーとGoogle ADK + LLMを組み合わせたPythonエージェントにより、自然言語でTVを操作できるシステムです。

## 🏗️ アーキテクチャ

```
┌─────────────────────┐    MCP    ┌─────────────────────┐    JSON-RPC    ┌─────────────────────┐
│                     │  ◄─────►  │                     │   ◄─────────►  │                     │
│  TV Control Agent   │           │    Bravia MCP       │                │    Sony Bravia TV   │
│   (Python + ADK)    │           │  (Node.js Server)   │                │                     │
│                     │           │                     │                │                     │
└─────────────────────┘           └─────────────────────┘                └─────────────────────┘
```

## 📁 プロジェクト構成

```
adk_tv_control/
├── bravia_mcp/           # Node.js MCP サーバー
│   ├── index.ts          # メインサーバーロジック
│   ├── package.json      # Node.js依存関係
│   ├── tests/            # テストスイート
│   └── Dockerfile        # Node.js環境
├── tv_control_agent/     # Python TV制御エージェント
│   ├── agent.py          # Google ADK エージェント
│   ├── pyproject.toml    # Python依存関係
│   └── Dockerfile        # Python環境
├── docker-compose.yml    # マルチコンテナ構成
└── README.md
```

## ✨ 主な機能

### 🎮 MCP サーバー機能（bravia_mcp）
- **電源制御**: オン/オフ、状態確認
- **チャンネル操作**: 地上波・BS・CS対応
- **音量制御**: 音量調整、ミュート機能
- **システム情報**: デバイス情報取得
- **複数トランスポート**: StreamableHTTP / SSE対応

### 🤖 AI エージェント機能（tv_control_agent）
- **自然言語処理**: 「テレビつけて」「5チャンネルにして」等
- **Google ADK統合**: LLMによる高度な意図理解
- **MCP連携**: シームレスなTV制御

## 🚀 クイックスタート

### 前提条件
- Docker & Docker Compose
- Sony Bravia TV（JSON-RPC API対応）
- VS Code（DevContainer推奨）

### 1. 環境設定

```bash
# リポジトリクローン
git clone https://github.com/hiro88hyo/adk_tv_control.git
cd adk_tv_control

# 環境変数設定（.envファイル作成）
echo "TV_IP=192.168.1.100" >> .env
echo "TV_PSK=your_preshared_key" >> .env
echo "MCP_SERVER_URL=http://localhost:3000/sse" >> .env
echo "LLM_MODEL=gemini-1.5-flash" >> .env
```

### 2. TV設定
Sony Bravia TVでリモートコントロール設定を有効化し、PSK（Pre-Shared Key）を設定してください。

### 3. システム起動

```bash
# 全サービス起動
docker-compose up

# または開発モード（VS Code DevContainer推奨）
code .  # VS Codeで開く
# -> "Reopen in Container"
```

### 4. 利用開始

```bash
# Python エージェント経由でTV制御
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "テレビをつけて5チャンネルにして"}'

# 直接MCP API呼び出し
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"method": "tools/call", "params": {"name": "setPowerStatus", "arguments": {"status": "on"}}}'
```

## 🛠️ 開発

### ローカル開発環境

```bash
# bravia_mcp開発
cd bravia_mcp
npm install
npm run build
npm start

# tv_control_agent開発
cd tv_control_agent
uv sync
uv run adk web --host 0.0.0.0
```

### テスト実行

```bash
# MCP サーバーテスト
cd bravia_mcp
npm test

# Pythonエージェントテスト
cd tv_control_agent
# テストはまだ実装されていません
```

## 📡 API リファレンス

### MCP Tools

| Tool | 説明 | パラメータ |
|------|------|-----------|
| `getSystemInformation` | TV システム情報取得 | なし |
| `getPowerStatus` | 電源状態確認 | なし |
| `setPowerStatus` | 電源制御 | `status: "on"\|"off"` |
| `getContentList` | チャンネルリスト取得 | `source?: string` |
| `setPlayContent` | チャンネル切替 | `uri: string` |
| `getVolumeInformation` | 音量情報取得 | なし |
| `setAudioVolume` | 音量制御 | `volume?: string, mute?: boolean` |

### エンドポイント

- **MCP Server**: `http://localhost:3000`
  - StreamableHTTP: `/mcp`
  - SSE: `/sse`
- **TV Agent**: `http://localhost:8000`
  - Chat API: `/chat`

## 🔧 設定

### 環境変数

| 変数名 | 説明 | 例 |
|--------|------|-----|
| `TV_IP` | Bravia TV IPアドレス | `192.168.1.100` |
| `TV_PSK` | TV プリシェアードキー | `your_key_here` |
| `PORT` | MCP サーバーポート | `3000` |
| `MCP_SERVER_URL` | エージェント接続先 | `http://localhost:3000/sse` |
| `LLM_MODEL` | 使用するLLMモデル | `gemini-1.5-flash` |

### TV設定手順
1. TV設定 → ネットワーク → リモート開始 → オン
2. 認証 → 事前共有キー → キー設定
3. IPアドレスとPSKを`.env`に設定

## 🤝 コントリビューション

1. フォーク
2. フィーチャーブランチ作成 (`git checkout -b feature/AmazingFeature`)
3. コミット (`git commit -m 'Add some AmazingFeature'`)
4. プッシュ (`git push origin feature/AmazingFeature`)
5. プルリクエスト作成

## 📄 ライセンス

MIT License - 詳細は[LICENSE](LICENSE)ファイルを参照

## 🙏 謝辞

- [Model Context Protocol](https://modelcontextprotocol.io/) - MCP仕様
- [Google ADK](https://github.com/google/adk-python) - Python LLMフレームワーク
- Sony Bravia API - TV制御インターフェース

---

**Made with ❤️ by [hiro88hyo](https://github.com/hiro88hyo)**