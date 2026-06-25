# やさいの背景 現在状態

最終更新: 2026-06-25

## プロダクト名

やさいの背景

## プロダクト目的

売場の野菜に添えたQRから、消費者がその野菜が育った「今日の畑」を約30秒で見られる運用実証用プロトタイプです。

目的は、野菜の背景を動画で体感できる状態を作り、知覚価値、QR閲覧、動画再生、販売率に変化があるかを検証することです。

## 対象ユーザー

- 農園: スマホで撮影した短い動画と写真を登録し、QR付きの収穫記録を作る
- 消費者: 売場や商品に添えられたQRから、ログインなしで動画を見る
- 運営者: 実証結果として閲覧数、動画再生数、動画完了数、プロフィール遷移数を見る

## 現在のリポジトリ情報

- 正本リポジトリ: `https://github.com/LIVINGCOLOUR/yasai-no-haikei`
- ローカルパス: `C:\Users\HOME\yasai-no-haikei`
- ブランチ: `main`
- 直近commit: `8755cf5 Create Yasai no Haikei prototype app`
- 既存の「自然派やさいマップ」とは別アプリとして扱う

## 実装済み画面

- `index.html`: トップ
- `login.html`: 農園ログイン
- `dashboard.html`: 農園ダッシュボード
- `profile.html`: 農園プロフィール編集
- `harvest-admin.html`: 動画・写真・ひとこと登録、QR発行
- `harvest.html?id={recordId}`: 消費者向けQR先ページ
- `farmer.html?id=farm-01`: 消費者向け農園プロフィール
- `analytics.html`: 簡易アクセス解析

## 実装済み主要機能

- 農園ID + 管理キーによる簡易ログイン
- 農園プロフィールの保存
- 2〜5本の短い動画をブラウザ内で約30秒のMP4へ自動結合
- 完成MP4と写真のアップロード
- 収穫記録の保存
- QR先ページでの動画再生
- 農園プロフィールへの導線
- page_view / video_play / video_ended / profile_click の簡易計測
- analytics画面での簡易集計表示

## Cloudflare構成

- Cloudflare Pagesを想定
- Pages build output: `.`
- Pages Functions: `functions/`
- D1 binding: `DB`
- R2 binding: `MEDIA_BUCKET`
- compatibility date: `2024-06-01`

必要な環境変数:

- `SESSION_SECRET`
- `FARM_ADMIN_KEYS_JSON`
- `APP_BASE_URL`
- `ENVIRONMENT`

本番では `ENVIRONMENT=production` を設定し、ログインCookieに `Secure` を付ける想定です。

## D1設計

Migration: `migrations/0001_init.sql`

主なテーブル:

- `farmers`
  - 農園プロフィールを保存
  - 初期データとして `farm-01` 〜 `farm-05` を投入
- `harvest_records`
  - 商品・出荷日ごとの収穫記録を保存
  - 動画URL、写真URL、プロフィールURLを持つ
- `analytics_events`
  - QR先ページの閲覧・動画再生・完了・プロフィール遷移を記録

## R2設計

R2 bucket: `yasai-no-haikei-media`

保存対象:

- 完成MP4
- 写真
- プロフィール画像

保存しないもの:

- 元動画クリップ
- ブラウザ内動画生成の一時ファイル

## 動画生成仕様

- 推奨3本、最大5本
- 1本あたり6〜10秒程度の短い動画を想定
- 完成尺は約30秒
- 720×1280
- 30fps
- H.264 / AAC / yuv420p
- `movflags +faststart`
- 映像はクロスフェード
- 音声は元動画音声を使用
- 音声は単純連結 + 短いフェード
- BGM、自動字幕、AI見どころ判定は未実装
- `ffmpeg.wasm` は `harvest-admin.html` でのみ読み込む想定
- QR先の `harvest.html` では `ffmpeg.wasm` を読み込まない

## QR仕様

- QRは収穫記録ごとの `harvest.html?id={recordId}` へ誘導する
- 消費者はログイン不要
- QR先では計測用リダイレクトや待機画面を挟まない
- QR先ページで動画、写真、ひとこと、農園プロフィール導線を表示する

## アクセス解析仕様

記録するイベント:

- `page_view`
- `video_play`
- `video_ended`
- `profile_click`

計測はQR先の閲覧体験を止めない設計です。`sendBeacon` または `fetch` の `keepalive` を使い、失敗しても利用者画面を止めない方針です。

## 現在確認済みのこと

- 新規独立repoとして `LIVINGCOLOUR/yasai-no-haikei` を作成済み
- ローカル静的配信で主要ページが200を返すことを確認済み
- `node --check` によるJS構文チェックはOK
- D1 migration local適用はOK
- `wrangler pages dev` で主要API疎通はOK
  - `GET /api/auth/me`
  - `GET /api/farmer/farm-01`
  - `GET /api/harvest/farm-01-demo-2026-06-21`
  - `POST /api/analytics/track`
- `.dev.vars` は存在しない
- `.wrangler/` はlocal確認で生成されるがGit追跡対象外

## まだ未確認のこと

- 実機スマホでの動画3本生成
- 実機スマホでの音声付き完成MP4確認
- 実ファイルのR2アップロード
- QRを別端末で読んだ確認
- analytics画面で実イベントが期待通り集計されること
- 本番Cloudflare D1/R2へのremote反映
- 本番用Secrets設定
- `ffmpeg.wasm` および同梱ライブラリのライセンス表記・NOTICE要否

## 本番初回deploy状況（2026-06-25）

- Pages project `yasai-no-haikei` を本番URL `https://yasai-no-haikei.pages.dev/` へ初回deploy済み。
- D1 `yasai-no-haikei-db` を作成し、`wrangler.toml` の `database_id` に本番IDを反映済み。
- R2 `yasai-no-haikei-media` を作成済み。
- Cloudflare Pages に `SESSION_SECRET`, `FARM_ADMIN_KEYS_JSON`, `APP_BASE_URL`, `ENVIRONMENT` を設定済み。値はrepo内に保存しない。
- D1 remote migration `0001_init.sql` 適用済み。
- 本番URLで静的ページ、ログイン、`GET /api/auth/me`, `GET /api/farmer/farm-01`, `POST /api/analytics/track` を確認済み。
- Node fetch + FormData による smoke test で、R2画像アップロード、D1収穫記録保存、`GET /api/harvest/{id}`, `/api/media/...` 取得を確認済み。
- PowerShell 5.1/.NET の `MultipartFormDataContent` では Cloudflare `request.formData()` が `multipart form parse failed` になるケースを確認。ブラウザ相当の `fetch + FormData + Blob` では成功。