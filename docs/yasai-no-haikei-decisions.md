# 軌跡 decisions

## 決定事項

- 表示名は `軌跡` とする。
- GitHubリポジトリは `LIVINGCOLOUR/kiseki` とする。
- 公開URLは `https://yasai-no-haikei.pages.dev/` を正とする。
- Cloudflare project、D1/R2名は当面 `yasai-no-haikei` のまま維持する。
- `https://kiseki.dev/` はCloudflare SSL 525が解消するまで掲載URLとして使わない。
- `https://kiseki.pages.dev/` は別サイトなので使わない。
- 既存の「自然派やさいマップ」とは別アプリとして扱う。
- 消費者アカウントは作らない。
- 作り手だけが簡易ログインする。
- 作り手IDは新規方針として `id-01`〜`id-05` を使う。
- 内部API/DB名の `farmer` / `farmers` / `farmer_id` は互換性維持のため当面残す。
- 動画は1〜5本。推奨は3本。
- 1本動画はMP4へ整える用途として扱う。
- 元動画は保存しない。
- QR先では計測用リダイレクトや待機画面を挟まない。
- QR先では動画、写真ギャラリー、プロフィール導線の順に見せる。
- 写真ギャラリーはサムネイル/ポスターとは別物として扱う。
- `photo_urls_json` を写真ギャラリー、`video_thumbnail_url` をサムネイル/ポスターとして使う。

## Phase 1で作らないもの

- 消費者アカウント
- メール認証
- SNSログイン
- 決済
- 地図検索
- 作り手検索
- 飲食店検索
- SNS自動投稿
- BGM
- 自動字幕
- AI見どころ判定
- 高度な動画編集
- コメント
- DM