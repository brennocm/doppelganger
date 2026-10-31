"""Window framing with the same semantics as the TypeScript Windower (detection-core 1.1).

A signal of N samples yields max(0, floor((N - W) / H) + 1) windows; window i is the
slice [i * H, i * H + W). Golden vectors keep both implementations equal.
"""

from __future__ import annotations

import numpy as np
import numpy.typing as npt

Audio = npt.NDArray[np.float32]


def window_count(samples: int, window: int, hop: int) -> int:
    """Number of full windows in a signal of the given length."""
    if window < 1 or hop < 1:
        msg = "window and hop must be at least 1"
        raise ValueError(msg)
    return max(0, (samples - window) // hop + 1)


def frame(audio: Audio, window: int, hop: int) -> npt.NDArray[np.float32]:
    """Return an array of shape (count, window) with every full window, copied."""
    count = window_count(audio.shape[0], window, hop)
    if count == 0:
        return np.zeros((0, window), dtype=np.float32)
    starts = np.arange(count) * hop
    return np.stack([audio[s : s + window] for s in starts]).astype(np.float32)
