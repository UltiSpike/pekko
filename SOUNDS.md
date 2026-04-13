# Obtaining Keyboard Sounds

Keeby requires `.ogg` audio files for each keyboard switch profile. Here's how to get them:

## Option 1: Freesound.org (Recommended)
1. Visit https://freesound.org
2. Search for "mechanical keyboard" + switch name (e.g., "Gateron Red")
3. Download CC0 or CC-BY licensed files
4. Convert to OGG Vorbis format (if needed):
   ```bash
   ffmpeg -i input.wav -q:a 8 output.ogg
   ```

## Option 2: Mechvibes (Open Source)
1. Visit https://mechvibes.com
2. Find community sound packs
3. Extract the `.ogg` files from the pack
4. Place in the appropriate folder

## Option 3: Personal Recording
1. Record your mechanical keyboard with a good quality microphone
2. Separate the keydown and keyup sounds (or use a single file for both)
3. Normalize to -3 dB
4. Export as OGG Vorbis mono, 44.1 kHz

## Directory Structure

```
assets/sounds/
├── gateron-red/
│   ├── keydown.ogg
│   └── keyup.ogg
├── holy-panda/
│   ├── keydown.ogg
│   └── keyup.ogg
├── alps-blue/
│   ├── keydown.ogg
│   └── keyup.ogg
└── cream/
    ├── keydown.ogg
    └── keyup.ogg
```

## Audio Specifications

- **Format:** OGG Vorbis (vorbis codec)
- **Sample Rate:** 44100 Hz (any rate works, but 44.1 kHz is standard)
- **Channels:** Mono (stereo is fine, will be panned at runtime)
- **Duration:** 60–120 ms for keydown, 40–80 ms for keyup
- **Level:** Normalized to -3 dB

## Adding New Profiles

1. Create a new folder: `assets/sounds/your-switch-name/`
2. Add `keydown.ogg` and `keyup.ogg`
3. Edit `profiles/index.json` to add an entry:
   ```json
   {
     "id": "your-switch-name",
     "name": "Your Switch Name",
     "description": "Description here",
     "type": "linear|tactile|clicky",
     "sounds": {
       "down": "./assets/sounds/your-switch-name/keydown.ogg",
       "up": "./assets/sounds/your-switch-name/keyup.ogg"
     }
   }
   ```
4. Done! The profile will appear in the app UI automatically.
