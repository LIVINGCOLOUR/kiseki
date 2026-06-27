# 軌跡 current state

## 正本

- 表示名: 軌跡
- GitHub: `https://github.com/LIVINGCOLOUR/kiseki`
- 公開URL: `https://yasai-no-haikei.pages.dev/`
- ローカルパス例: `C:\Users\HOME\kiseki`
- Cloudflare project / D1 / R2名: 当面 `yasai-no-haikei` を維持
- `https://kiseki.dev/`: 2026-06-27時点でCloudflare SSL 525のため掲載URLとして使わない
- `https://kiseki.pages.dev/`: 別サイトのため使わない

## 目的

売場や作品に添えたQRから、作り手がその日に残した動画・写真・プロフィールを見られる運用実証プロトタイプ。野菜・魚・陶芸・工芸品・農産物などに広げられる汎用アプリとして扱う。

## 実装済み

- 作り手ログイン
- 動画登録画面
- ブラウザ内動画変換・結合
- 写真ギャラリー登録
- QR先ページ
- プロフィールページ
- 日別記録一覧 `records.html`
- アクセス解析の基礎
- Cloudflare Pages Functions / D1 / R2 連携

## 現在のID方針

画面・ローカル初期データ・サンプルは `id-01`〜`id-05` を使う。内部API/DB名には互換性維持のため `farmer` / `farmers` / `farmer_id` が残る。

本番Cloudflare Secretsとremote D1の既存データ移行は今回未実施。

## QR先構造

`harvest.html?id={recordId}` は、動画、写真ギャラリー、プロフィールボタンの順に表示する。QR先では `ffmpeg.wasm` と `js/video-composer.js` を読み込まない。

## 保存方針

- 完成MP4: R2
- 写真ギャラリー: R2 + `photo_urls_json`
- サムネイル/ポスター: `video_thumbnail_url`
- 元動画: 保存しない
- プロフィール・記録・analytics: D1

## 確認済み

- Cloudflare初回deploy済み
- `https://yasai-no-haikei.pages.dev/` のトップが200で表示されることを確認済み
- D1/R2/Pages Functionsの基本疎通済み
- 小さな画像アップロードと記録保存は確認済み

## 未確認

- 実機スマホでの1本動画変換
- 実機スマホでの3本動画生成
- 実MP4アップロード
- QR別端末確認
- analytics画面での集計確認
- 本番Secrets/D1を `id-01` 系へ移行するかの判断