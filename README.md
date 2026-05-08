# Lumimi

Lumimi is a Windows-focused Tauri app for generating subtitles from videos.

It uses Whisper-compatible models for transcription and FFmpeg for local video
processing. BOOTH release builds are intended to provide a ready-to-use Windows
package with the standard model, FFmpeg, bundled subtitle fonts, and license
notices included.

## Features

- Generate burned-in subtitle videos.
- Export subtitle files such as SRT, VTT, and TXT.
- Use bundled subtitle fonts and style presets.
- Improve transcription with custom dictionary entries and topic/keyword hints.
- Optionally download a higher accuracy Whisper model.

## Development

```sh
npm run dev
npm run tauri dev
```

Large runtime assets are not stored in this repository. For local development,
place FFmpeg at `src-tauri/bin/ffmpeg.exe` and Whisper models under
`src-tauri/models/` when needed.

## Distribution Notes

- First paid distribution target: BOOTH Windows build.
- Standard model `models/ggml-medium.bin` is bundled for release builds.
- High accuracy model `models/ggml-large-v3-turbo.bin` remains an optional free
  in-app download.
- FFmpeg is bundled for the Windows build. See `src-tauri/licenses/` for
  third-party notices, GPLv3 text, and FFmpeg source-access notes.

## License

Lumimi is licensed under the GNU General Public License v3.0 only. See
`LICENSE`.

Third-party components, model files, fonts, and FFmpeg have their own licenses
and notices under `src-tauri/licenses/`.

## Source Code

https://github.com/lumimi-app/lumimi
