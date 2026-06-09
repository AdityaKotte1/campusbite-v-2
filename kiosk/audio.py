"""
AudioManager — plays WAV sound effects via pygame.mixer.

Sounds directory layout:
  assets/sounds/startup.wav
  assets/sounds/success.wav
  assets/sounds/error.wav

If the WAV files are missing, a silent placeholder is generated using
the standard library's wave module so the first run never crashes.
"""

import logging
import os
import struct
import threading
import wave
from typing import Optional

log = logging.getLogger("audio")


def _create_silent_wav(path: str, duration_ms: int = 200, sample_rate: int = 22050) -> None:
    """Write a minimal silent WAV file (mono, 16-bit PCM)."""
    n_frames = int(sample_rate * duration_ms / 1000)
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with wave.open(path, "w") as wf:
            wf.setnchannels(1)       # mono
            wf.setsampwidth(2)       # 16-bit
            wf.setframerate(sample_rate)
            wf.writeframes(b"\x00\x00" * n_frames)
        log.info("Created silent placeholder WAV: %s", path)
    except Exception as exc:
        log.warning("Could not create silent WAV at %s: %s", path, exc)


class AudioManager:
    """Loads and plays kiosk sound effects."""

    SOUND_NAMES = ("startup", "success", "error")

    def __init__(self, sounds_dir: str, config: dict) -> None:
        self.sounds_dir = sounds_dir
        self.enabled = config.get("enabled", True)
        self.volume = float(config.get("volume", 0.8))
        self._sounds: dict = {}
        self._pygame_ok = False
        self._lock = threading.Lock()

        if self.enabled:
            self._init_pygame()
        else:
            log.info("Audio disabled by config.")

    # ------------------------------------------------------------------
    # Initialisation
    # ------------------------------------------------------------------

    def _init_pygame(self) -> None:
        try:
            import pygame  # type: ignore
            pygame.mixer.pre_init(frequency=22050, size=-16, channels=1, buffer=512)
            pygame.mixer.init()
            self._pygame = pygame
            self._pygame_ok = True
            log.info("pygame.mixer initialised.")
        except Exception as exc:
            log.warning("pygame.mixer could not initialise: %s — audio disabled.", exc)
            self._pygame_ok = False
            return

        for name in self.SOUND_NAMES:
            self._load_sound(name)

    def _load_sound(self, name: str) -> None:
        path = os.path.join(self.sounds_dir, f"{name}.wav")

        # Create a silent placeholder if file is missing
        if not os.path.exists(path):
            _create_silent_wav(path)

        try:
            sound = self._pygame.mixer.Sound(path)
            sound.set_volume(self.volume)
            self._sounds[name] = sound
            log.debug("Loaded sound: %s → %s", name, path)
        except Exception as exc:
            log.warning("Could not load sound %s: %s", name, exc)

    # ------------------------------------------------------------------
    # Playback
    # ------------------------------------------------------------------

    def play(self, sound_name: str) -> None:
        """Play a named sound asynchronously.  Silently ignores missing sounds."""
        if not self.enabled or not self._pygame_ok:
            return

        with self._lock:
            sound = self._sounds.get(sound_name)

        if sound is None:
            log.debug("Sound not loaded: %s", sound_name)
            return

        # Play in a thread so we never block the caller
        threading.Thread(
            target=self._play_blocking,
            args=(sound,),
            name=f"audio_{sound_name}",
            daemon=True,
        ).start()

    def _play_blocking(self, sound) -> None:
        try:
            channel = sound.play()
            if channel:
                while channel.get_busy():
                    self._pygame.time.wait(20)
        except Exception as exc:
            log.debug("Audio playback error: %s", exc)
