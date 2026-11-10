# Brand assets

Uploaded to vAMSYS Orwell → Settings → Logo Settings on 2026-11-10.

| File | vAMSYS slot |
| --- | --- |
| `png/crossroads-logo-light-1800x400.png` | Logo for Bright Backgrounds (both) |
| `png/crossroads-logo-dark-solid-1800x400.png` | Logo for Dark Backgrounds (both) |
| `png/crossroads-logo-dark-1800x400.png` | Transparent dark version, for anywhere that keeps PNG transparency |
| `png/crossroads-icon-512.png` | Square icon |
| `png/crossroads-login-background-1706x1600.jpg` | Backgrounds (login/register pages) |

The mark is two straight routes crossing at a junction. It deliberately avoids bent,
rotationally symmetric arms, which read as a pinwheel/hooked cross at logo size.

Regenerate (needs Playwright and Chrome):

```bash
node render-logos.mjs <node_modules with playwright> <@fontsource/barlow-condensed/files>
node render-background.mjs <node_modules with playwright>
```
