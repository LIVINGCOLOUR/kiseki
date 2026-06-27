# 軌跡 todo

## 掲載・公開URL

- GitHub掲載URLは `https://yasai-no-haikei.pages.dev/` に統一済み
- `https://yasai-no-haikei.pages.dev/` のトップが200で表示されることを確認済み
- `https://kiseki.dev/` を使う場合はCloudflare SSL 525を解消し、疎通確認後にREADME/docs/GitHub掲載URLを差し替える
- `https://kiseki.pages.dev/` は別サイトなので使わない

## 優先度 高

- ローカル `wrangler pages dev` で `id-01` ログイン確認
- 1本動画のMP4変換確認
- 3本動画生成確認
- 実MP4アップロード確認
- 写真ギャラリーのR2保存確認
- QRを別端末で読んだ確認
- `harvest.html` で動画、写真ギャラリー、プロフィールボタンの順に見えることを確認
- `records.html?id=id-01` の日別一覧を確認

## 優先度 中

- analytics画面でPV、動画再生、動画完了、プロフィール遷移を確認
- `profile_click` が記録されることを確認
- 390px幅で登録画面、QR先、プロフィール、日別一覧を確認
- `harvest.html` で `ffmpeg.wasm` / `js/video-composer.js` が読み込まれないことを確認

## 本番反映前

- Cloudflare Pages Secret `FARM_ADMIN_KEYS_JSON` を `id-01`〜`id-05` に更新するか判断
- remote D1の既存 `farm-01` 系データを `id-01` 系へ移行するか判断
- production D1 migrationまたは手動SQLの方針を決める
- ffmpeg同梱ファイルのライセンス表記確認

## 後回し

- 保持期間、課金、容量制限の設計
- 事業者別テンプレート
- 複数プロフィール管理
- analyticsの詳細イベント追加