# LUMINA — a dragon flythrough

An interactive Three.js scene: a real glTF dragon lit by a torch that follows your
cursor, with the camera flying a keyframed cinematic orbit as you scroll.

**Live:** https://raman365.github.io/lumina-dragon/

## Highlights

- **Real glTF model** — the full 306k-vertex dragon with PBR base color, normal, and
  roughness maps, lit by an environment probe and tone-mapped with ACES.
- **Cursor torchlight** — a warm point light rides a ray from the camera through your
  pointer, hovering just in front of the dragon so the lighting follows you around her.
- **Scroll cinematography** — the camera flies a keyframed, azimuth-continuous orbit
  (one framing per section) so the whole page reads as a single unbroken shot.
- **Fresnel aura** — a second mesh over the same geometry renders an additive rim that
  pulses, flares on arrival, and shifts from cyan to ember-gold at the finale.
- Drifting embers that scatter from the torch, a slow starfield, tilt cards, and
  scroll-reveal sections.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build to dist/
npm run preview  # preview the production build
```

## Deploy

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds the site and
publishes `dist/` to GitHub Pages. Vite's `base` is set to `/lumina-dragon/` for the
project-page subpath (see [vite.config.ts](vite.config.ts)).

Built with React, Three.js, and Vite.
