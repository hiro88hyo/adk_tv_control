# Bravia MCP

本リポジトリは、Sony Bravia TVの制御を目的としたマルチコンテナプロジェクトです。
Node.jsベースのMCP（bravia_mcp）と、PythonベースのTVコントロールエージェント（tv_control_agent）で構成されています。

## ディレクトリ構成

- `bravia_mcp/` : Node.jsによるMCP本体。
- `tv_control_agent/` : Python製のTVコントロールエージェント。

## セットアップ

### 前提条件
- Docker / Docker Compose
- VS Code（DevContainer推奨）

### 開発環境の起動

1. リポジトリをクローン
2. VS Codeで開き、DevContainerで再オープン
3. `docker-compose up` で全サービスを起動

## ライセンス

本リポジトリはMITライセンスの下で公開されています。詳細はLICENSEファイルを参照してください。 