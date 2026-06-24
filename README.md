# やさいの背景

「やさいの背景」は、売場の野菜に添えたQRから、消費者がその野菜が育った今日の畑を30秒で見るためのプロトタイプです。

既存の「自然派やさいマップ」とは別アプリです。このフォルダ `yasai-no-haikei/` を Cloudflare Pages のプロジェクトルートとして扱う想定です。

## 中核体験

1. 農園がスマホで短い動画を3本程度撮る
2. 管理画面で動画を選ぶ
3. ブラウザ内で約30秒のMP4へ自動結合する
4. 完成MP4と写真だけをCloudflare R2へ保存する
5. D1に商品・出荷日ごとの収穫記録を保存する
6. QRを発行する
7. 消費者はログインなしでQR先の動画を見る
8. page_view / video_play / video_ended / profile_click をD1へ記録する

## アカウント方針

消費者アカウントは作りません。農園アカウントのみ、最初は5個です。

- `farm-01`
- `farm-02`
- `farm-03`
- `farm-04`
- `farm-05`

ログインは農園ID + 管理キーです。管理キーは `FARM_ADMIN_KEYS_JSON` 環境変数で管理します。実キーはリポジトリにコミットしません。

## 必要な環境変数

`.dev.vars.example` を `.dev.vars` にコピーし、ローカル用の値を設定してください。

```env
SESSION_SECRET="replace-with-long-random-session-secret"
FARM_ADMIN_KEYS_JSON='{"farm-01":"dummy-key-01","farm-02":"dummy-key-02","farm-03":"dummy-key-03","farm-04":"dummy-key-04","farm-05":"dummy-key-05"}'
APP_BASE_URL="http://localhost:8788"
ENVIRONMENT="development"
```

本番では Cloudflare Pages の環境変数・Secrets に設定し、実キーを `.dev.vars` やコードへコミットしないでください。`ENVIRONMENT=production` のとき、農園ログイン用Cookieに `Secure` が付きます。

## Cloudflare設定

`wrangler.toml` では以下を想定しています。

- D1 binding: `DB`
- R2 binding: `MEDIA_BUCKET`

D1作成後、`database_id` を実値に差し替えてください。

Cloudflare Pages では、この `yasai-no-haikei/` フォルダをプロジェクトルートとして扱ってください。既存の「自然派やさいマップ」とは別アプリとして分けます。

## D1 migration

```powershell
cd C:\Users\HOME\taneto-hatake-map\yasai-no-haikei
npx wrangler d1 migrations apply yasai-no-haikei-db --local
```

本番適用時は `--remote` を使います。

```powershell
cd C:\Users\HOME\taneto-hatake-map\yasai-no-haikei
npx wrangler d1 migrations apply yasai-no-haikei-db --remote
```

## ローカル起動

静的表示だけなら:

```powershell
cd C:\Users\HOME\taneto-hatake-map\yasai-no-haikei
python -m http.server 8000
```

Functions / D1 / R2 を含めて確認する場合:

```powershell
cd C:\Users\HOME\taneto-hatake-map\yasai-no-haikei
npx wrangler pages dev . --compatibility-date=2024-06-01
```

## 主なページ

- `index.html`: トップ
- `login.html`: 農園ログイン
- `dashboard.html`: 農園ダッシュボード
- `profile.html`: 農園プロフィール編集
- `harvest-admin.html`: 動画・写真・ひとこと登録、QR発行
- `harvest.html?id={recordId}`: 消費者向けQR先
- `farmer.html?id=farm-01`: 消費者向け農園プロフィール
- `analytics.html`: 簡易アクセス解析

## 動画生成仕様

- 推奨3本、最大5本
- 完成尺は約30秒
- 720×1280
- 30fps
- H.264 / AAC / yuv420p
- `movflags +faststart`
- 映像はクロスフェード
- 音声は元動画音声を使用
- 音声は単純連結 + 短いフェード
- BGM、自動字幕、AI見どころ判定は未実装
- 元動画は保存しない
- 保存するのは完成MP4のみ

## 運用実証で見る指標

- page_view数
- video_play数
- video_ended数
- profile_click数
- 動画再生率
- 動画完了率
- プロフィール遷移率

## 注意

このアプリは運用実証用の最小プロトタイプです。メール認証、パスワード再発行、SNSログイン、決済、消費者アカウント、地図検索、農家検索は実装していません。

## 本番反映前チェック

Cloudflareへ反映する前に、最低限以下を確認してください。

- D1 `yasai-no-haikei-db` を作成し、`wrangler.toml` の `database_id` を本番IDへ差し替える
- R2 `yasai-no-haikei-media` を作成し、Pages Functions の `MEDIA_BUCKET` binding を設定する
- Pages Functions の `DB` binding が本番D1を指していることを確認する
- `SESSION_SECRET` は十分長いランダム文字列を Cloudflare 側のSecretに設定する
- `FARM_ADMIN_KEYS_JSON` は5農園分の実キーを Cloudflare 側のSecretに設定する
- `APP_BASE_URL` は本番URLに設定する
- `ENVIRONMENT=production` を設定し、Cookieに `Secure` が付く状態にする
- `npx wrangler d1 migrations apply yasai-no-haikei-db --remote` を実行する
- `.dev.vars`、実キー、R2/D1の認証情報、Cloudflareトークンがコミットされていないことを確認する
- QR先 `harvest.html?id=...` はログインなしで開き、計測用リダイレクトや待機画面を挟まないことを確認する

## 実機確認チェックリスト

本番反映前に、スマホ実機で以下を確認します。

- iPhone / Android の両方、または少なくとも実証で使う端末で `harvest-admin.html` を開く
- 農園ID + 管理キーでログインできる
- 6〜10秒程度の縦動画3本から完成MP4を生成できる
- 完成MP4に映像と元動画の音声が入っている
- 5本選択時は、処理時間が長くなる可能性を許容できるか確認する
- 完成MP4と写真をアップロードし、R2に保存される
- 元動画ファイルがR2へ保存されていない
- QR画像を表示・保存できる
- 別端末でQRを読み、`harvest.html?id=...` がログインなしで開く
- QR先ページで `vendor/ffmpeg/` と `js/video-composer.js` が読み込まれていない
- QR先ページで動画が再生でき、写真・ひとこと・農園リンクが表示される
- `page_view` / `video_play` / `video_ended` / `profile_click` が閲覧を止めずに記録される
- `analytics.html` で対象レコードの数値が確認できる
- farm-01 の記録が farm-02 など別農園に混ざらない
- 390px幅で横スクロールやボタン欠けがない
- Consoleに未処理例外がない

## 既知のリスク

- `ffmpeg-core.wasm` は約23MiBで、Cloudflare Pagesの単一静的ファイル上限25MiBに近いです。差し替え時は必ずサイズを確認してください。
- 動画生成は端末性能に依存します。運用実証では推奨3本、最大5本の方針を維持します。
- 実ファイルのR2アップロード、本番D1/R2、別端末QR確認は実機・本番環境での確認が必要です。
- Functionsの本番Cookie安全性は `ENVIRONMENT=production` 設定に依存します。
- `vendor/ffmpeg/` の同梱ライブラリは、本番公開前にライセンス表記・NOTICEの要否を確認してください。
- この段階では、管理キー漏えい時の再発行UIや監査ログは未実装です。
