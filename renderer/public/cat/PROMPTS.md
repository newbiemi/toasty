# Toasty — Sprite Prompts (nano-banana-pro)

**Base style (prepend to every prompt):**
> Pixel art, 16-bit cozy game sprite, a small round chubby cream/orange tabby cat,
> transparent background, single character centered, consistent palette, crisp pixels,
> no anti-aliasing, front-facing, 4 animation frames in a horizontal strip, ~64×64 px per frame.

---

## States

| State | Subfolder | Append to base style |
|-------|-----------|----------------------|
| **idle** | `idle/` | sitting calmly, tail swishing slowly, occasional blink — gentle breathing loop |
| **thinking** | `thinking/` | tilting head with a tiny floating `?` and a paw to chin, curious look |
| **alert** | `alert/` | ears perked up, wide eyes, small `!` above head, sitting upright and attentive |
| **happy** | `happy/` | eyes closed in a happy smile, tail up, a little sparkle, bouncing slightly |
| **sleep** | `sleep/` | curled up asleep, `Zzz` above head, slow breathing |

---

## Drop folder structure

```
renderer/public/cat/
  idle/       idle_01.png … idle_04.png
  thinking/   thinking_01.png …
  alert/      alert_01.png …
  happy/      happy_01.png …
  sleep/      sleep_01.png …
```

Generate as a horizontal strip or individual frames. Transparent background (PNG).
Same cat, same palette, same camera angle across all states.
