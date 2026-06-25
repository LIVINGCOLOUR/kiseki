# やさいの背景 開発引き継ぎ

このファイルは、次回以降のChatGPT/Codexスレッドに貼れば開発を再開できるようにするための引き継ぎメモです。

最終更新: 2026-06-25

## プロジェクト概要

「やさいの背景」は、売場の野菜に添えたQRから、消費者がその野菜が育った今日の畑を約30秒で見られる運用実証用プロトタイプです。

目的は、野菜の背景を動画で体感できることで、知覚価値、QR閲覧、動画再生、販売率に変化があるかを検証することです。

## 正本リポジトリ

- GitHub: `https://github.com/LIVINGCOLOUR/yasai-no-haikei`
- ローカル: `C:\Users\HOME\yasai-no-haikei`
- ブランチ: `main`
- 直近commit: `8755cf5 Create Yasai no Haikei prototype app`

今後の「やさいの背景」の開発は、この独立repoを正本として進めます。

## 既存repoとの関係

既存の「自然派やさいマップ」repo:

- `https://github.com/LIVINGCOLOUR/shizenha-yasai-map.git`
- ローカル: `C:\Users\HOME\taneto-hatake-map`

この既存repo内に一時的に `yasai-no-haikei/` フォルダを作っていましたが、現在は独立repo `LIVINGCOLOUR/yasai-no-haikei` に切り出し済みです。

既存repo側の `poc-video-composer-audio-test` ブランチはバックアップ扱いです。ユーザー確認なしに削除しないでください。

## 実装済み内容

画面:

- `index.html`: トップ
- `login.html`: 農園ログイン
- `dashboard.html`: 農園ダッシュボード
- `profile.html`: 農園プロフィール編集
- `harvest-admin.html`: 動画・写真・ひとこと登録、QR発行
- `harvest.html?id={recordId}`: 消費者向けQR先
- `farmer.html?id=farm-01`: 消費者向け農園プロフィール
- `analytics.html`: 簡易アクセス解析

Functions/API:

- auth: login / logout / me
- farmer: profile取得・保存、harvest一覧
- harvest: record取得・保存、upload
- media: R2 media配信
- analytics: track / summary

データ:

- D1 migration: `migrations/0001_init.sql`
- tables: `farmers`, `harvest_records`, `analytics_events`
- R2 bucket想定: `yasai-no-haikei-media`

動画:

- `harvest-admin.html` で `js/video-composer.js` を読み込み
- `vendor/ffmpeg/` のffmpeg.wasmを遅延利用
- 推奨3本、最大5本
- 約30秒、720×1280、30fps、H.264/AAC、faststart
- 元動画音声を使う
- 元動画クリップは保存しない
- 完成MP4と写真のみ保存する

## 重要な設計判断

- 「自然派やさいマップ」とは別アプリとして扱う
- `yasai-no-haikei` repoを正本にする
- 消費者アカウントは作らない
- 農園アカウントは農園ID + 管理キーの簡易ログイン
- 管理キーは `FARM_ADMIN_KEYS_JSON` 環境変数で管理
- Secrets、`.dev.vars`、`.wrangler/` はコミットしない
- QR先ではログイン不要
- QR先で計測用リダイレクトや待機画面を挟まない
- QR先では `ffmpeg.wasm` を読み込まない
- Phase 1ではBGM、自動字幕、AI見どころ判定、高度編集、SNS投稿は作らない

## 確認済み

新規repo `C:\Users\HOME\yasai-no-haikei` で以下を確認済みです。

- `git status`: clean
- JS `node --check`: OK
- D1 migration local適用: OK
- 静的配信で主要ページ200: OK
- `wrangler pages dev` で主要API疎通: OK
  - `GET /api/auth/me`
  - `GET /api/farmer/farm-01`
  - `GET /api/harvest/farm-01-demo-2026-06-21`
  - `POST /api/analytics/track`

## 未確認事項

- 実機スマホでの動画3本生成
- 実機スマホでの音声付き完成MP4確認
- 実ファイルのR2アップロード
- QRを別端末で読んだ確認
- analytics画面で実イベントが期待通り見えること
- 本番Cloudflare D1/R2へのremote反映
- 本番用Secrets設定
- `ffmpeg.wasm` および同梱ライブラリのライセンス表記・NOTICE要否

## 次にCodexへ投げるべき作業

まずは実機確認に進む前に、必要ならローカル用 `.dev.vars` を作ります。ただし `.dev.vars` は絶対にコミットしません。

次の依頼例:

```text
作業対象: C:\Users\HOME\yasai-no-haikei

やさいの背景の実機確認準備をしてください。
実装追加はせず、ローカル用 .dev.vars を作成し、wrangler pages dev でログインから収穫記録保存まで確認できる状態にしてください。
.dev.vars はコミットしないでください。
実機スマホ確認用URLと、確認手順を報告してください。
```

その次にやること:

- 実機スマホで3本動画生成
- 完成MP4の音声確認
- R2実ファイルアップロード確認
- 別端末QR確認
- analytics確認
- 本番Cloudflare D1/R2反映

## 絶対に触ってはいけないもの

- 既存 `C:\Users\HOME\taneto-hatake-map` の自然派やさいマップ本体
- 既存repo側の未コミット差分
- 既存repo側のブランチ削除
- `.dev.vars` のコミット
- `.wrangler/` のコミット
- Secrets、APIキー、Cloudflareトークンのコミット
- 元動画クリップを保存する仕様変更
- 消費者アカウント、SNSログイン、決済、地図検索などPhase 1外の機能追加

## commit / push 方針

- 小さな作業単位でcommitする
- pushはユーザー確認後に行う
- docsだけの更新と実装変更をできるだけ混ぜない
- 実機確認で問題が出た場合は、最小修正に絞る
- 大きな仕様変更が必要な場合は実装せず、課題として報告する
