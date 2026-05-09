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

## System Requirements

Lumimi is intended for Windows 10 / 11 64-bit PCs. The current release runs
transcription on the user's CPU, so processing speed depends heavily on the
machine.

Recommended:

- Windows 11 64-bit
- Recent Intel Core i5 / AMD Ryzen 5 class CPU or better
- 16 GB RAM or more
- SSD storage
- 6 GB or more free disk space

Minimum:

- Windows 10 / 11 64-bit
- 64-bit CPU
- 8 GB RAM or more
- 4 GB or more free disk space

Very old CPUs, low-power CPUs, and virtualized environments may be extremely
slow or may not work correctly. Additional model downloads require an internet
connection.

## Disclaimer

Lumimi is a helper tool for generating subtitle files and burned-in subtitle
videos. Transcription accuracy depends on audio quality, noise, background
music, speaker pronunciation, specialized vocabulary, and input format. Generated
subtitles should be reviewed and corrected by the user.

Operation is not guaranteed for every PC environment, video format, codec, or
audio condition. The developer is not responsible for damage, lost work time,
data loss, or third-party disputes caused by using this software.

## Privacy / Data Handling

Subtitle generation and video processing run locally on the user's PC. Lumimi
does not upload selected videos, extracted audio, generated subtitles, custom
dictionary entries, or topic/keyword hints to a server by default.

App settings such as language, subtitle style, panel width, and output options
are stored locally by the app. Custom dictionary entries and optional downloaded
model files are stored under the app data folder. Internet access is used when
the user downloads an optional Whisper model, and by BOOTH or other distribution
services outside the app when purchasing or downloading the installer.

## License

Lumimi is licensed under the GNU General Public License v3.0 only. See
`LICENSE`.

Third-party components, model files, fonts, and FFmpeg have their own licenses
and notices under `src-tauri/licenses/`.

## Source Code

https://github.com/lumimi-app/lumimi
