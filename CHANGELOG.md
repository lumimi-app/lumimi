# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- Added UTF-8 editor configuration to prevent Japanese text from opening as mojibake in local tools.
- Fixed normal Whisper transcription failing after the cancel feature was added by replacing the unsafe callback wrapper with callback state that remains valid for the full inference call.

### Added
- Added a confirmed cancel flow for subtitle generation so users can stop long-running transcription or rendering without closing the app.
- Added a privacy-conscious support log for subtitle generation errors and Rust panics under the app data folder.

### Changed
- Split panel resizer logic into `src/panel-resizer.js` and video/thumbnail/output-folder logic into `src/video-ui.js`; reduced `src/main.js` from 517 to 380 lines.
- Eliminated redundant `getSettings()` calls in preview rendering hot path; settings object is now fetched once per frame and passed to all drawing functions.
- Extracted `emit_build_left_line` and `emit_build_line` from `subtitle.rs::generate`; added unit tests for `format_ass_time`, `with_alpha`, `split_into_lines`, and `words_to_karaoke` (11 tests pass).
- Updated the application icon from `lumimiicon.png`.
- Changed package publisher/author metadata from the old personal identifier to `stk108`.
- Changed the Tauri application identifier from the old personal identifier to `app.lumimi.lumimi` before public distribution.
- Added system requirements and disclaimer wording for release documentation and the BOOTH product page.

<!-- 調査中: リリースビルドでの Whisper 推論が開発ビルド比 ~6倍遅い問題（dev=9.8s, release=57s）。
  - CMAKE_BUILD_TYPE=RelWithDebInfo env var → 効果なし（VS マルチコンフィグジェネレーターは CMAKE_BUILD_TYPE 無視）
  - vendor/whisper-rs-sys-0.15.0 で config.profile("RelWithDebInfo") パッチ → 効果なし（57秒のまま）
  - 次の仮説: devキャッシュが旧 whisper-rs-sys-0.13.x 由来の古いwhisper.cppを使用している可能性。
    target/debug/build/whisper-rs-sys-*/out/whisper.lib のタイムスタンプを確認して検証すること。
-->

## [1.0.0] - 2026-05-08

### Fixed
- リリースビルドが `CARGO_MANIFEST_DIR`（コンパイル時の開発ディレクトリパス）を参照し、開発環境のモデルファイルを「利用可能」として誤検出していた問題を修正（`#[cfg(debug_assertions)]` でデバッグビルド限定のフォールバックに変更）

### Changed
- 高精度モデル未ダウンロード時のドロップダウン表示を「高精度モデル（低速…）」→「高精度（低速…）」に変更
- 英語版の文字起こし言語ラベルを "Language" → "Transcription language" に変更（アプリ言語設定との混同を防止）

### Added
- BOOTH販売準備メモ、FFmpeg同梱販売チェック、第三者ライセンスnotice下書きを追加
- FFmpeg同梱配布向けにGPLv3本文とFFmpegソース入手案内を追加
- Lumimi本体のGPLv3 `LICENSE` とGitHub公開準備メモを追加
- バイリンガル字幕機能を追加。日本語音声を文字起こしと同時に英語翻訳し、原語字幕の上に英語訳を重ねて表示（Whisper translate タスクを BeamSearch で実行）
- 開発用ポートを 3000 → 14200 に変更し他アプリとの衝突を回避

### Changed
- private GitHubリポジトリへの初回push完了を販売準備タスクに記録
- GitHubリポジトリを販売準備中はprivate、BOOTH販売開始直前にpublicへ切り替える運用として記録
- GitHub公開予定URLを `https://github.com/lumimi-app/lumimi` に確定し、ライセンス/ソースコード導線の仮URLを置換
- 高精度Whisperモデルが未ダウンロードの場合、モデル選択欄と無料DL確認画面で容量と標準モデルの精度改善方法を案内するよう変更
- BOOTH販売版はFFmpeg同梱を前提にし、Lumimi本体をGitHub公開してライセンス/ソースコード導線を置く方針に変更
- 販売用ビルドの初期同梱モデルを `ggml-medium.bin` のみに絞り、`ggml-large-v3-turbo.bin` は任意ダウンロード扱いに変更
- 翻訳字幕のハイライトを廃止し、プレーンな1行表示に変更
- 縦書き積み上げ字幕の1列あたりの最大文字数を画面高さの66%基準に変更（従来90%→過長列が画面上端から始まる問題を修正）
- ユーザー指定の最大文字数も縦書きモードでは画面高さ上限でキャップするよう変更
- 縦長動画で縦書き字幕＋翻訳を同時表示する場合、翻訳を上端（alignment 8）に配置するよう変更
- 縦書き積み上げ字幕が画面外まで蓄積した場合、完全に画面外になる列から旧列を消して最右列から積み直すエラーリセット動作に変更

### Fixed
- 縦書き積み上げモードで列数が増えると完全に画面外へ押し出されて非表示になっていた問題を修正
- MERGE_SUFFIXES に「てる」「てた」「でる」「でた」を追加し、「空いてるんですよ」のような縮約形が列をまたいで分断されていた問題を修正

### Changed
- 未使用のフロントエンド断片とテンプレート由来の未使用 SVG を削除し、Rust の軽微な Clippy 指摘を整理
- フロントエンドの定数データを `src/config.js` に分離し、`src/main.js` の責務を軽量化
- プレビュー描画ロジックを `src/preview.js` に分離し、`src/main.js` を画面制御中心に整理
- カスタム辞書UIロジックを `src/dict-ui.js` に分離し、`src/main.js` の責務をさらに整理
- ライセンスモーダルを `src/license-ui.js`、モデル/フォント一覧処理を `src/resource-ui.js` に分離
- プリセットボタン生成と適用処理を `src/preset-ui.js` に分離
- 設定ロード/保存、色プレビュー、出力タイプ表示切り替えを `src/settings-ui.js` に分離
- 重複していた CSS セレクタ定義を統合し、同じ見た目を少ない定義で表現
- 日本語版の演出スタイル「カラオケfill」の表示名を「カラオケ」に変更
- 字幕スタイルプリセット「映画風フォーカス」を「Vlog」に変更し、にくまるフォント・フォーカスキープ・白文字・同時表示2行の設定に変更
- 字幕スタイルプリセット「ネオン」のフォントを源暎エムゴに変更
- 字幕スタイルプリセット「テキスト拡大」のフォントを源暎ぽっぷるに変更
- 字幕スタイルプリセット「旅テロップ」のハイライト色を白に変更
- 縦長動画で縦書き字幕を使う場合、字幕の縦位置を中央に表示するよう変更
- 字幕スタイルプリセット「バズり動画」の表示名を「スナップ」に変更
- 字幕スタイルプリセット「ゲーム配信」の表示名を「ネオン」に変更
- アプリ背景の黄色い発光を削除し、外側とレイアウト間の背景色を暗い色に統一
- フォントライセンスモーダルの表示順をフォント名の昇順に変更
- アプリ起動時のデフォルトウィンドウサイズを1600x900に変更
- ウィンドウ横幅拡大時、プレビュー見出しが2行で収まる左パネル幅に達した以降は右パネル（字幕デザイン設定）の幅を優先して広げるようグリッド列を `min(360px, 50%) 1fr` に変更
- UI を左右2分割レイアウトに変更。左パネルに動画選択・プレビュー・アクションを固定表示し、右パネルで設定をスクロール可能に変更
- 字幕スタイルプリセット「弾むテキスト」の表示名を「テキスト拡大」に変更
- 字幕スタイルプリセット「バズり動画」のフォントを Montserrat に変更
- プレビュー画面を2番、アクション画面を3番に変更し、大きいウインドウでは動画選択の右側にプレビューを表示
- プレビュー拡大時も比率を維持し、横長16:9とスマホ向け縦長9:16を切り替え可能に変更
- プレビューを常に動画選択の右側へ2分割表示し、詳細設定へ少ないスクロールで到達できるように変更
- 縦長動画では下3分の1を避けるように字幕位置を自動調整
- 縦長動画の字幕位置を下3分の1のすぐ上へ調整
- 動画選択とプレビューの横並び比率を5:5に変更
- 動画選択カード内を、上に大きい選択エリア、下に細い動画名バーの上下配置に変更
- バズり動画プリセットを源暎きわみゴ、同時表示1行、1単語ずつ切り替わる字幕スタイルに変更
- 字幕の出し方を選ぶ表示モードを追加し、1単語ずつ表示を演出スタイルから独立
- 積み重ねチェックボックスを削除し、積み上げを表示モードに統合
- フォントサイズ、太字、縦書きの設定を1行にまとめて省スペース化
- プレビュー拡大中はボタン文言を「プレビューを縮小」に切り替えるように変更
- 表示モードにワードポップとワードビルドを追加し、1単語ずつ表示の名称を整理

### Added
- プレビュー背景に選択動画のサムネイルを表示。H.264/VP9/AV1 はネイティブ再生で取得し、HEVC（iPhone動画）など非対応コーデックはバンドル FFmpeg で1フレーム抽出してフォールバック
- カスタム辞書機能を追加。音声→表示テキストの置換ルールを登録・削除でき、字幕生成時に自動適用される（AppData/dict.json に永続保存）
- 字幕位置を自動/手動で切り替え、横位置・縦位置をスライダーで調整できる設定を追加
- 演出スタイルに、単語ごとに濃くなり変化後の濃さを保持する「フォーカスキープ」を追加
- 851チカラヨワク、縦書き、積み上げを使う字幕スタイルプリセット「旅テロップ」を追加
- Zen Kaku Gothic New とカラーキープを使う字幕スタイルプリセット「ハイライト」を追加
- 演出スタイルに、単語ごとに色が変わり変化後の色を保持する「カラーキープ」を追加
- 左右パネルの幅をドラッグで調整できるリサイズハンドルを追加
- アプリ右下に `© 2026 stk108` のコピーライト表記を追加
- 表示モードに「ワードビルド（左固定）」を追加。単語が増えても既存の単語位置が動かず、完成行の左端から右に積み上がる
- 基本設定に「文字起こし言語」セレクトを追加（日本語・英語・中文・韓国語など12言語 + 自動検出）。日本語以外は Whisper トークンを直接使用
- 基本設定に「出力形式」セレクトを追加（MP4 / MKV / MOV / WebM）。WebM は libvpx-vp9 + libopus で出力（他形式より処理時間が長い）
- 基本設定に「出力タイプ」セレクトを追加（焼き込み動画のみ / 字幕ファイルのみ / 両方）
- 字幕ファイル出力に対応（SRT / VTT / TXT）。字幕ファイルのみの場合は FFmpeg レンダリングをスキップ
- 字幕スタイルのプリセット機能を追加（シンプル・スナップ・弾むテキスト・ド派手インパクト・Vlog・ハイライト・ネオン・バラエティTV・旅テロップ・カラオケ・トーク動画）
- 演出スタイル設定を追加（なし・色変更・カラオケfill・フォーカス・スケール・グロー）
- UI の日本語/英語切り替え機能を追加（`lang-toggle` ボタン）
- 使用フォントのライセンスモーダルを追加（Licenses ボタン → SIL OFL 1.1 一覧表示）
- 出力ファイル名をユーザーが変更できる入力欄を追加（デフォルト: `{動画名}_subtitled`）
- 「表示保持 秒」設定を追加（デフォルト 0.5 秒、最後の単語が終わったあとも字幕を表示し続ける）
- Anton / Montserrat / Noto Sans JP / Zen Kaku Gothic New の Bold・ExtraBold・Black ウェイトをバンドル
- 各フォントの OFL.txt を `src-tauri/licenses/` にバンドル
- Whisper モデルのダウンロード進捗オーバーレイを追加

### Fixed
- 字幕スタイルプリセット適用時のフォント候補選択を改善し、「旅テロップ」で851チカラヨワクが選択されるよう修正
- 英語版でセクション見出しとプレビュー比率ボタンが日本語のままになる問題を修正
- 英語版で演出スタイルと表示モードのプルダウン項目が日本語のままになる問題を修正
- プレビューセクションの高さが足りない時にプレビュー画面が見切れる問題を修正
- ライセンスモーダルが画面高不足時に見切れる問題を修正
- バズり動画プリセット適用後に他プリセットへ切り替えても1単語表示設定が残る問題を修正
- カラオケプレビューで歌い終わった単語の色が残るように修正
- インパクトプリセットの表示名と使用フォントを修正
- プレビューのデフォルト表示を小さくし、不要なシークバーと秒数表示を削除
- ライセンスモーダルの源暎エムゴの表示名を修正
- 新 UI の後ろに残った旧 CSS ルールが、設定パネル・ドロップゾーン・ボタン・入力欄・プレビューの見た目を上書きする問題を修正
- フォントサイズの +/- ボタン、動画メタ情報表示、プレビュー拡大ボタンが UI と連動するように修正
- Tauri イベントリスナーの解除、字幕プレビューの非表示時停止、ASS 色変換、設定移行時の太字判定を修正
- packaged build に Whisper モデルが同梱されるよう `models/*` の bundle resource 設定を復元
- FFmpeg `fontsdir` に Windows 絶対パス（コロン含む）を渡すとパース失敗する問題を修正（ASS ファイルと同ディレクトリの `lumi_fonts/` にコピーして相対パス渡しに変更）
- 前の行と新しい行が同時に表示されて被る問題を修正（`prev_ends` 2要素配列を `last_diag_end` 単一変数に変更し、直前の行が終了するまで次行を開始しないよう制約を強化）
- 「弾むテキスト」（スケール）スタイルが横方向にのみ伸びていた問題を修正（`\fscx` + `\fscy` の均等115%スケールに変更）
- `output_filename.unwrap_or(&format!(...))` の一時値ライフタイムエラーを修正（`let default_name` に束縛）

### Changed
- 「字幕を生成」ボタンを詳細設定の直上に移動
- 進捗バーを「字幕を生成」ボタンの直下に移動
- 「太字チェックボックス」を「文字の太さ（通常/太字）」セレクトに変更（ASS の Bold フィールドはブーリアン仕様）
- `generate_subtitles` コマンドに `output_dir` / `output_filename` 引数を追加

### Fixed
- アプリアイコンがビルドキャッシュにより更新されない問題を修正 (`cargo clean` 後にフルビルドすることで解決)
- アプリアイコンを PNG-inside-ICO 形式に変更 (BMP 形式の AND マスク問題を根本解決、DWM による透過が正常動作)
- 設定パネルの行全体がクリック可能になる問題を修正（`<label>` → `<div>` に統一、チェックボックスは `justify-self: start` で固定）
- 〜した・〜いた・〜てる 等の語尾が前の単語から切り離される問題を修正（MERGE_SUFFIXES に「た」「だ」「る」を追加）

### Added
- 詳細設定に「1行の最大文字数」入力欄を追加（デフォルト15文字、増やすと1行に長い文章を表示可能）
- 詳細設定に「太字 (Bold)」チェックボックスを追加（デフォルト OFF）
- Montserrat フォントをアプリにバンドル（`src-tauri/fonts/`）、OS 未インストール環境でも使用可能
- FFmpeg の `ass` フィルターに `fontsdir` を渡しバンドルフォントで字幕を焼き込めるように

### Changed
- アプリアイコンを新デザイン (`lumimiiconnoglow222.png`) に更新、全プラットフォーム向けサイズを再生成
- Windows SDK を 10.0.26100 → 10.0.28000 に更新 (rc.exe 10.0.28000.1721)
- デフォルトフォントを 源ノ角ゴシック → Montserrat に変更

---

### Fixed
- ドラッグ＆ドロップで動画が選択できない問題を修正 (WebView2 では `File.path` が取れないため `tauri://drag-drop` イベントに移行)
- FFmpeg render でパスエスケープが誤解釈される問題を修正 (`current_dir` + ファイル名のみ渡す方式に変更)
- Apple 系動画 (iPhone/MOV) で音声コーデック非互換エラー → `-c:a aac` に変更
- エラーメッセージに FFmpeg バージョンバナーが含まれ長すぎる問題を修正 (関連行のみ抽出)
- dev モードで画面が真っ黒になる問題を修正 (`beforeDevCommand` + `devUrl` を設定)
- WebView2 でボタンにシステムカラーが適用される問題を修正 (background/border を明示)
- 詳細設定パネルのラベル・インプットが低コントラストで読みにくい問題を修正
- Whisper 内部ログが文字化けしてコンソールに出力される問題を修正 (`whisper_log_set` で無効化)
- favicon 404 エラーを修正 (`<link rel="icon" href="data:,">` で空アイコンを設定)
- 字幕テキストが動画幅からはみ出す問題を修正 (ASS `WrapStyle: 0` + `MarginL`/`MarginR` を `PlayResX/20` に設定)
- 字幕の横マージンを調整し表示幅を画面の約80%に変更 (`MarginL`/`MarginR` を `PlayResX/10` に変更)
- 字幕が2行以上同時表示されて映像が隠れる問題を修正 (1セグメントを1行ずつ別 Dialogue に分割して同時表示を防止)

### Added
- 出力先フォルダを詳細設定から選択できるように (未選択時は動画と同フォルダの `output/` に出力)
- フォント名をプルダウンで選択できるように (fontdb でシステムフォントを列挙)
- 文字起こし精度モデルを詳細設定から切り替えられるように (標準/高精度の2種類)
- 「話しているテーマ・キーワード」入力欄を追加 (Whisper `initial_prompt` として渡すことで文字起こし精度を向上)
- アプリアイコンをカスタム画像に変更 (BMP-inside-ICO 形式で生成、MSVC rc.exe 互換)
- アイコン小サイズ（16/32px）にシャープネス補正を適用してぼやけを改善

### Removed
- 詳細設定からモデルパス設定を削除 (バンドルモデルを自動解決するため不要)

### Changed
- エラー表示エリアをスクロール可能・テキスト選択可能に変更 (3.5行分表示)
- 詳細設定パネルの「出力先フォルダ」行をクリック判定が選択ボタンのみに限定 (`<label>` → `<div>` に変更)
- 先行表示の最小ステップを 0.05 秒に変更
- 単語区切りにれる/られる/〜ください/記号類を前の単語に結合するルールを追加 (Lindera MERGE_SUFFIXES)

## [0.1.0] - 2026-05-03

### Added
- Tauri 2 + plain HTML/CSS/JS フロントエンド初期実装
- Whisper (whisper-rs) による音声書き起こし
- Lindera による形態素解析・単語分割
- ASS 字幕ファイル生成
- FFmpeg による字幕焼き込み動画出力
- リソースパス解決 (Tauri resource_dir / 実行ファイルディレクトリ / CARGO_MANIFEST_DIR)
- `generate_subtitles` / `open_folder` Tauri コマンド
- 詳細設定パネル (フォント・色・先行表示秒数・モデルパス)
- 進捗バー (`progress` イベント)

### Changed
- Whisper モデルを `src-tauri/target/` 外の `src-tauri/models/` へ移動 (容量削減)
- FFmpeg を `src-tauri/bin/` に配置しバンドル対応
- `tauri.conf.json` に `bundle.resources = ["models/*", "bin/*"]` 追加
