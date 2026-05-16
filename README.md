# Lumimi

Lumimi is a Windows-focused subtitle generation app built with Tauri.
Developed by stk108.

---

- [日本語](#日本語)
- [English](#english)

---

# 日本語

## Lumimiとは

Lumimi は、動画から字幕を生成する Windows 向けアプリです。
Tauri を使用して開発されています。

Whisper 互換モデルを利用した音声認識と、FFmpeg によるローカル動画処理を組み合わせ、字幕付き動画や字幕ファイルを簡単に生成できます。

BOOTH 向け配布版は、標準モデル、FFmpeg、字幕用フォント、ライセンス表記などを同梱した、すぐ使えるパッケージです。

---

## 名前について

Lumimi は、“Lumi” の「光る・照らす」というイメージをベースに、
字幕がテンポよく流れる軽やかさを加えて作った名前です。

話している場所が自然に光る、このアプリの特徴にも繋がっています。

---

## 特徴

- 動画から自動で字幕ファイルを生成
- 話している単語の自動ハイライト
- 字幕焼き込み動画を書き出し
- SRT / VTT / TXT 出力
- MP4 / MOV / MKV / AVI / WebM 入力対応
- 字幕フォント・スタイルプリセットを利用可能
- 文字色、フォント、位置、表示スタイルの調整
- カスタム辞書による表記ゆれ補正
- トピック/キーワード指定による認識補助
- 英語訳の同時表示
- 高精度Whisperモデルの任意追加ダウンロード
- ユーザー PC 上でローカル処理

---

## 開発

```sh
npm run dev
npm run tauri dev
```

大容量ランタイムファイルはリポジトリに含まれていません。

ローカル開発時は必要に応じて以下へ配置してください。

- FFmpeg
  `src-tauri/bin/ffmpeg.exe`

- Whisper モデル
  `src-tauri/models/`

---

## 配布について

- Windows 版は BOOTH で配布
- 標準モデル `models/ggml-medium-q5_0.bin` を同梱
- 高精度モデル `models/ggml-large-v3-turbo.bin` は任意ダウンロード方式
- Windows 版には FFmpeg を同梱
- サードパーティライセンス表記は `src-tauri/licenses/` に収録

---

## 動作環境

Lumimi は Windows 10 / 11 64-bit 向けです。

現在のバージョンでは、文字起こし処理はユーザー PC の CPU 上で実行されるため、処理速度は環境に大きく依存します。

### 推奨環境

- Windows 11 64-bit
- Intel Core i5 / AMD Ryzen 5 クラス以上
- メモリ 16 GB 以上
- SSD ストレージ
- 空き容量 6 GB 以上

### 最低動作環境

- Windows 10 / 11 64-bit
- 64-bit CPU
- メモリ 8 GB 以上
- 空き容量 4 GB 以上

古い CPU、省電力 CPU、仮想環境などでは極端に遅くなる、または正常動作しない場合があります。

追加モデルのダウンロードにはインターネット接続が必要です。

---

## 免責事項

Lumimi は字幕生成支援ツールです。

音声認識精度は、音質、ノイズ、BGM、話者の発音、専門用語、入力形式などの影響を受けます。
生成された字幕は、ユーザー自身で確認・修正してください。

すべての PC 環境、動画形式、コーデック、音声状態での動作を保証するものではありません。

本ソフトウェアの利用によって発生した損害、作業損失、データ損失、第三者とのトラブル等について、開発者は責任を負いません。

---

## プライバシー / データ取り扱い

字幕生成および動画処理は、基本的にユーザー PC 上でローカル実行されます。

Lumimiは、選択した動画、抽出音声、生成字幕、辞書登録内容、キーワード指定などを外部サーバーへ送信しません。

言語設定、字幕スタイル、出力設定などのアプリ設定はローカル保存されます。

追加モデルのダウンロード時、および BOOTH など外部配布サービス利用時にはインターネット接続を使用します。

---

## ライセンス

Copyright (C) 2026 stk108.

Lumimi は GNU General Public License v3.0 only のもとで公開されています。

詳細は `LICENSE` を参照してください。

サードパーティコンポーネント、モデル、フォント、FFmpeg には、それぞれ独自のライセンスがあります。
詳細は `src-tauri/licenses/` を参照してください。

---

## ソースコード

https://github.com/lumimi-app/lumimi

---

## リリースノート

`RELEASE_NOTES.md` を参照してください。

---

# English

## About Lumimi

Lumimi is a Windows-focused subtitle generation app built with Tauri.
Developed by stk108.

It combines Whisper-compatible speech recognition models with local FFmpeg video processing to generate subtitle videos and subtitle files easily.

Release builds distributed through BOOTH provide a ready-to-use package including the standard model, FFmpeg, subtitle fonts, and license notices.

---

## About the Name

The name “Lumimi” is based on the image of “Lumi” meaning light or glow, combined with the smooth rhythm of subtitles flowing naturally across the screen.

It also reflects one of the app’s features: highlighting the currently spoken words naturally.

---

## Features

- Automatically generate subtitle files from video
- Automatic word highlighting during playback
- Export burned-in subtitle videos
- SRT / VTT / TXT output
- MP4 / MOV / MKV / AVI / WebM input supported
- Built-in subtitle font and style presets
- Customize text color, font, position, and display style
- Custom dictionary for consistent spelling and wording corrections
- Topic and keyword hints to improve transcription accuracy
- Optionally download higher accuracy Whisper models
- Fully local processing on the user’s PC

---

## Development

```sh
npm run dev
npm run tauri dev
```

Large runtime assets are not included in this repository.

For local development, place the following files when needed:

- FFmpeg
  `src-tauri/bin/ffmpeg.exe`

- Whisper models
  `src-tauri/models/`

---

## Distribution Notes

- Windows release distribution: BOOTH
- Standard model `models/ggml-medium-q5_0.bin` is bundled
- High accuracy model `models/ggml-large-v3-turbo.bin` is an optional download
- FFmpeg is bundled with the Windows release
- Third-party licenses and notices are included under `src-tauri/licenses/`

---

## System Requirements

Lumimi is intended for Windows 10 / 11 64-bit PCs.

The current version performs transcription on the user’s CPU, so processing speed depends heavily on hardware performance.

### Recommended

- Windows 11 64-bit
- Recent Intel Core i5 / AMD Ryzen 5 class CPU or better
- 16 GB RAM or more
- SSD storage
- 6 GB or more free disk space

### Minimum

- Windows 10 / 11 64-bit
- 64-bit CPU
- 8 GB RAM or more
- 4 GB or more free disk space

Very old CPUs, low-power CPUs, and virtualized environments may be extremely slow or may not work correctly.

An internet connection is required when downloading additional models.

---

## Disclaimer

Lumimi is a helper tool for subtitle generation.

Transcription accuracy depends on factors such as audio quality, noise, background music, pronunciation, specialized vocabulary, and input format.

Generated subtitles should always be reviewed and corrected by the user.

Operation is not guaranteed for every PC environment, video format, codec, or audio condition.

The developer is not responsible for any damage, lost work time, data loss, or third-party disputes caused by using this software.

---

## Privacy / Data Handling

Subtitle generation and video processing run locally on the user’s PC.

Lumimi does not upload selected videos, extracted audio, generated subtitles, custom dictionary entries, or keyword hints to external servers.

Application settings such as language, subtitle style, and output preferences are stored locally.

Internet access is used when downloading optional models or when using external distribution services such as BOOTH.

---

## License

Copyright (C) 2026 stk108.

Lumimi is licensed under the GNU General Public License v3.0 only.

See `LICENSE` for details.

Third-party components, models, fonts, and FFmpeg have their own licenses and notices under `src-tauri/licenses/`.

---

## Source Code

https://github.com/lumimi-app/lumimi

---

## Release Notes

See `RELEASE_NOTES.md`.
