# tv_control_agent

Sony Bravia TVの制御を行うPython製エージェントです。

## 機能
- Google ADKを利用したTV制御
- Web APIサーバとして動作

## セットアップ

1. Python 3.12以上を用意
2. 依存パッケージをインストール
   ```sh
   uv sync
   ```
   または
   ```sh
   pip install -r requirements.txt
   ```
   ※`pyproject.toml`/`uv.lock`を利用

## Dockerでの起動

```sh
docker build -t tv_control_agent .
docker run -p 8000:8000 tv_control_agent
```

## 開発用エントリポイント

```sh
uv run adk web --host 0.0.0.0
```

## ライセンス
MIT License（リポジトリルートのLICENSE参照）
