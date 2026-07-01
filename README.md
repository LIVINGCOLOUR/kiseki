# 軌跡

公開URL: https://yasai-no-haikei.pages.dev/
GitHub: https://github.com/LIVINGCOLOUR/kiseki

`軌跡` は、売場や作品に添えたQRから、作り手がその日に残した動画・写真・プロフィールを見られる運用実証用プロトタイプです。

GitHubリポジトリ名は `kiseki` です。Cloudflare Pages project、D1名、R2名は当面 `yasai-no-haikei` のまま維持します。ユーザーに見せるアプリ名を `軌跡` として扱います。

`https://kiseki.dev/` は現在の掲載URLではありません。2026-06-27時点ではCloudflare SSL 525で正常公開されていないため、復旧確認までは `https://yasai-no-haikei.pages.dev/` を正とします。`https://kiseki.pages.dev/` は別サイトです。

## 目的

野菜、魚、陶芸、工芸品、農産物などに使える汎用の背景共有アプリとして、以下を検証します。

- QR閲覧率
- 動画再生率
- 動画完了率
- プロフィール遷移
- 写真ギャラリーの見られ方

## ID方針

ローカルと新規初期データでは、作り手IDを以下に統一します。

- `id-01`
- `id-02`
- `id-03`
- `id-04`
- `id-05`

内部APIやDBテーブル名には、互換性維持のため `farmer` / `farmers` / `farmer_id` が一部残っています。

本番Cloudflareの `FARM_ADMIN_KEYS_JSON` と既存D1データは、必要なタイミングで別途 `id-01` 系へ移行します。今回は本番Secretsやremote D1は変更しません。

## ログイン情報の扱い

作り手ログインでは、上記の作り手IDと管理キーを使います。

GitHubのREADME、docs、説明欄、Issue、Pull Requestには、本番管理キーやログインパスワードを記載しません。公開リポジトリでは、IDだけを説明し、管理キーはCloudflare Pages Secret `FARM_ADMIN_KEYS_JSON` とリポジトリ外の非公開控えで管理します。

`.dev.vars.example` の値はローカル開発用のダミーです。本番や公開デモの管理キーとして使わないでください。

## 主なページ

- `index.html`: トップ
- `login.html`: 作り手ログイン
- `dashboard.html`: 管理画面
- `harvest-admin.html`: 動画・写真登録、QR発行
- `harvest.html?id={recordId}`: QR先ページ
- `farmer.html?id=id-01`: プロフィール
- `records.html?id=id-01`: 日ごとの記録一覧
- `profile.html`: プロフィール編集
- `analytics.html`: アクセス解析

## QR先の構造

QRで開く `harvest.html` は、以下の順で表示します。

1. その日の動画
2. 写真ギャラリー
3. プロフィールを見るボタン

QR先ページでは `ffmpeg.wasm` や `js/video-composer.js` を読み込みません。

## 動画登録

`harvest-admin.html` では、1〜5本の動画を選べます。

- 1本: 再生しやすいMP4へ整える用途
- 複数本: 選んだ順につなぐ用途
- 推奨: 3本
- 最大: 5本
- 元動画は保存しません
- 保存するのは完成MP4、写真、サムネイル相当の写真URLです

写真ギャラリーは `photo_urls_json` を使います。`video_thumbnail_url` はサムネイル/ポスター用として残します。

## ローカル開発

`.dev.vars.example` を参考に、ローカル用 `.dev.vars` を作成してください。`.dev.vars` はGit追跡対象外です。

```powershell
cd C:\Users\HOME\kiseki
npx wrangler d1 migrations apply yasai-no-haikei-db --local
npx wrangler pages dev . --ip 0.0.0.0 --port 8788
```

静的表示だけ見る場合:

```powershell
python -m http.server 8000
```

## QA

```powershell
node --check js/main.js
node --check js/video-composer.js
node --check js/auth.js
node --check js/analytics.js
node --check functions/_utils.js
```

## 未確認・次工程

- 本番Cloudflare Secretsを `id-01` 系へ更新するか判断
- 本番D1の既存 `farm-01` 系データ移行
- 実機スマホで1本動画変換、3本動画生成、5本時の重さを確認
- 実MP4と写真のR2アップロード確認
- QRを別端末で読んだ確認
- analytics画面でPV/動画再生/動画完了/プロフィール遷移を確認
- ffmpeg同梱ファイルのライセンス表記確認
