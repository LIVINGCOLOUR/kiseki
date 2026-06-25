# やさいの背景 TODO

最終更新: 2026-06-25

## 優先度A: 実機確認前に済ませること

- [x] 新規repo側でローカル静的配信を確認する
- [x] D1 migrationをlocal適用する
- [x] `wrangler pages dev` で主要APIを確認する
- [x] QR先 `harvest.html?id=farm-01-demo-2026-06-21` が表示できることを確認する
- [ ] README内のローカルパス表記が独立repo向けになっているか確認する
- [ ] 実機テスト用の `.dev.vars` をローカルだけに作る
- [ ] 実機テスト用の農園ID・管理キーを決める

## 優先度A: 実機スマホで確認すること

- [ ] iPhoneで `harvest-admin.html` を開く
- [ ] Androidで `harvest-admin.html` を開く
- [ ] 農園ID + 管理キーでログインできる
- [ ] 6〜10秒程度の縦動画3本を選択できる
- [ ] ブラウザ内で約30秒の完成MP4を生成できる
- [ ] 完成MP4に映像が入っている
- [ ] 完成MP4に元動画の音声が入っている
- [ ] 完成MP4をプレビューできる
- [ ] 完成MP4をダウンロードできる
- [ ] 5本選択時の処理時間・メモリ負荷が許容範囲か確認する
- [ ] 390px幅で横崩れがない
- [ ] Consoleに未処理例外がない

## 優先度A: Cloudflare local / 本番前確認

- [ ] 実ファイルのR2アップロードを確認する
- [ ] 完成MP4だけがR2に保存され、元動画クリップが保存されていないことを確認する
- [ ] 写真アップロードを確認する
- [ ] 収穫記録がD1に保存されることを確認する
- [ ] QR画像が生成されることを確認する
- [ ] QRを別端末で読み、ログインなしでQR先ページが開くことを確認する
- [ ] QR先ページで動画が再生されることを確認する
- [ ] QR先ページで `ffmpeg.wasm` が読み込まれていないことを確認する
- [ ] `page_view` / `video_play` / `video_ended` / `profile_click` が記録されることを確認する
- [ ] `analytics.html` で集計が見えることを確認する

## 優先度B: 本番Cloudflare反映

- [ ] Cloudflare Pages projectを作る
- [ ] D1 `yasai-no-haikei-db` を作る
- [ ] R2 `yasai-no-haikei-media` を作る
- [ ] `wrangler.toml` の `database_id` を本番D1 IDへ差し替える
- [ ] Pages Functions の `DB` bindingを設定する
- [ ] Pages Functions の `MEDIA_BUCKET` bindingを設定する
- [ ] `SESSION_SECRET` をCloudflare Secretに設定する
- [ ] `FARM_ADMIN_KEYS_JSON` をCloudflare Secretに設定する
- [ ] `APP_BASE_URL` を本番URLに設定する
- [ ] `ENVIRONMENT=production` を設定する
- [ ] `npx wrangler d1 migrations apply yasai-no-haikei-db --remote` を実行する
- [ ] 本番URLでログイン、アップロード、QR閲覧、analyticsを確認する

## 優先度B: 公開・運用前確認

- [ ] `ffmpeg.wasm` および同梱ライブラリのライセンス表記・NOTICE要否を確認する
- [ ] Secretsや `.dev.vars` がGit管理対象に入っていないことを確認する
- [ ] `.wrangler/` がGit管理対象に入っていないことを確認する
- [ ] 実証で使う農園名、商品名、動画、写真の掲載許諾を確認する
- [ ] 実証店舗でQRを掲示する位置を決める
- [ ] 販売率比較の計測方法を決める

## 優先度C: 後回しでよいこと

- [ ] 5本動画生成の高速化
- [ ] UIの細かなスマホ最適化
- [ ] 管理キー再発行UI
- [ ] 管理画面の複数ロール対応
- [ ] 詳細なアクセス解析画面
- [ ] 動画テンプレートの複数化
- [ ] サムネイル自動生成

## 既存repo側の整理

- [ ] `shizenha-yasai-map` 側の `poc-video-composer-audio-test` をいつ削除するか判断する
- [ ] 削除する場合は、独立repoで本番反映の見通しが立った後にユーザー確認を取る
- [ ] 既存repo側の未コミット差分 `CLAUDE.md` とルート `README.md` の扱いを別途確認する
