# 軌跡 handoff

## 概要

このリポジトリは、表示名 `軌跡` の運用実証プロトタイプです。GitHubリポジトリ名は `kiseki`、Cloudflare側の技術名は当面 `yasai-no-haikei` のままです。

QRから、作り手がその日に残した動画・写真・プロフィールを見せます。対象は野菜・魚・陶芸・工芸品・農産物などに広げる前提です。

## 正本リポジトリ・公開URL

- GitHub: `https://github.com/LIVINGCOLOUR/kiseki`
- 公開URL: `https://yasai-no-haikei.pages.dev/`
- ローカルパス例: `C:\Users\HOME\kiseki`
- Cloudflare project: `yasai-no-haikei`
- D1: `yasai-no-haikei-db`
- R2: `yasai-no-haikei-media`

`https://kiseki.dev/` は2026-06-27時点でCloudflare SSL 525のため、掲載URLとして使わない。`https://kiseki.pages.dev/` は別サイトなので使わない。

既存の `shizenha-yasai-map` は触らない。

## 重要な現状

- 画面上は `軌跡` に変更済み。
- ローカル・初期データは `id-01`〜`id-05` 方針。
- 内部API/DB名の `farmer` は互換性維持のため残っている。
- `.dev.vars` はローカル専用でGit追跡対象外。
- 本番Cloudflare Secretsとremote D1のID移行はまだ行っていない。

## 実装済み導線

- `login.html`: 作り手ログイン
- `dashboard.html`: 管理画面
- `harvest-admin.html`: 動画・写真登録
- `harvest.html?id=...`: QR先
- `farmer.html?id=id-01`: プロフィール
- `records.html?id=id-01`: 最近の様子一覧
- `profile.html`: プロフィール編集
- `analytics.html`: アクセス解析

## 次にCodexへ投げるべき作業

1. `wrangler pages dev` で `id-01` ログイン確認。
2. 1本動画変換と3本動画生成をPC/実機で確認。
3. 写真ギャラリー保存とQR先拡大表示を確認。
4. `records.html` から日別記録へ進めるか確認。
5. 本番Secrets/D1を `id-01` 系へ移行するか判断して、必要なら別作業として安全に実施。
6. `kiseki.dev` を使う場合はCloudflare SSL 525を解消し、疎通確認後に掲載URLを差し替える。

## 絶対に避けること

- Secrets値をREADME/docs/gitに書かない。
- `.dev.vars` をcommitしない。
- `.wrangler/` をcommitしない。
- 既存 `shizenha-yasai-map` を編集しない。
- Cloudflare本番Secretやremote D1を確認なしで変更しない。
- QR先ページでffmpegを読み込まない。

## commit / push 方針

通常はユーザー確認後に必要な範囲だけstageする。掲載情報の更新は2026-06-27にGitHubへ反映済み。

## 管理キー固定方針

ユーザー指定の管理キーを正とし、Codex側で勝手に再生成・変更しない。値そのものはREADME/docs/gitに書かない。repo外の `C:\Users\HOME\yasai-no-haikei-secrets\production-admin-keys.txt` と Cloudflare Pages Secret `FARM_ADMIN_KEYS_JSON` を正として扱う。

旧 `farm-01`〜`farm-05` と新 `id-01`〜`id-05` は、移行期間中は同じ管理キーで入れるようにする。