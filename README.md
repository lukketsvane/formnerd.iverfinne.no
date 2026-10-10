# FormNerd

The entropy narrative and the complete A11, Canon TV-16 50 mm and A8 studio share one deployment at https://formnerd.iverfinne.no.

`/` opens the 13-scene narrative. `/kamera`, `/canon50mm` and `/a8` open the original interactive studio components with shared navigation and a return to `/#kameraet`.

Run `npm run build` and `npm test` with Node 22 or later. There are no installation dependencies. The build downloads the project's existing camera models, lens environment and fallback renders from the original public studio, verifies their pinned SHA-256 hashes, and includes them in `dist`. The deployed site serves these files locally and does not proxy the studio.

Narrative source: FormNerd Sites version 17, commit `9c5787deafdfd208d60f2ef2be51684fa22b94b4`.

Studio source: https://formnerd-kamerastudio.lukketsvane.chatgpt.site, retrieved 2026-10-10. Retained distribution modules include the original camera, lens and caustic renderers, React components, Three.js loaders, controls and styles. Changes to these modules are limited to navigation adaptation and enabling pinch zoom. The editable integration lives in `public/studio/studio.js`, `router.js` and `studio.css`.

Production target: Vercel project `prj_PRPdQn7ffboydExRD1rTSDHbMpJY`, team `team_6ukeAMsNaWMRhHombsc7EIwn`. The previous project-level catch-all proxy must be disabled for the combined deployment to serve the custom domain.
