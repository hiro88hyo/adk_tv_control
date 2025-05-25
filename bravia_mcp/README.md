# bravia_mcp

Sony Bravia TVの制御用MCP(Model Context protocol)です。Node.js環境で動作し、DevContainerに対応しています。

## 機能
- Bravia TVのリモート制御
- DevContainerによる開発環境の即時構築
- Git連携

## セットアップ

1. ディレクトリに移動
2. 依存パッケージをインストール
   ```sh
   npm install
   ```
3. アプリを起動
   ```sh
   npm start
   ```

## コマンドラインオプション

- `--transport=streamable`（デフォルト）: StreamableHTTPトランスポートで起動します。
- `--transport=sse` : SSE（Server-Sent Events）トランスポートで起動します。

例：
```sh
node build/index.js --transport=sse
```

## 環境変数

- `TV_IP` : 制御対象のBravia TVのIPアドレス（必須）
- `TV_PSK` : Bravia TVのプリシェアードキー（必須）
- `PORT` : MCPサーバーの待ち受けポート（省略時は3000）

`.env`ファイルなどで設定してください。

## 開発環境（DevContainer）
VS Codeで「Reopen in Container」を選択することで、開発環境が自動構築されます。

## ライセンス
MIT License（リポジトリルートのLICENSE参照）