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

## Link-preview card

`render-share-image.mjs` draws `site/public/og.png` (1200x630), the image that Discord, Reddit and
Facebook show beside a link to the site. The card carries no counts: those sites keep the image for
days or weeks, so a number on it would go out of date. The counts are in the page descriptions, which
the site build takes from the data. A site test (`site/src/html-facts.test.ts`) fails if a count is
typed into the script, or if the card names an aircraft or a kind of flying the data no longer has.

The workflow "Screenshots and page checks" renders the card on every run (artifact `share-image`) and
its summary says whether the committed image still matches. To change the card: edit the script, push
a branch named `shots/<anything>`, download the artifact and commit its `og.png` as
`site/public/og.png`. Rendering on the GitHub runner gives everyone the same pixels; a local render
uses another browser build and can differ slightly.

```bash
node render-share-image.mjs <node_modules with playwright> <@fontsource/barlow-condensed/files> [output.png]
```
