# FormNerd

The entropy narrative and the A11, Canon TV-16 50 mm, A8, A9 and A10 studio share one deployment at https://formnerd.iverfinne.no.

`/` opens the 14-scene narrative. `/kamera`, `/canon50mm`, `/a8`, `/a9` and `/a10` open the interactive studio components with shared navigation and a return to `/#kameraet`. `/a15` is the A15 industrial design study, showing source form, the partial screenless rear study and proposed handling. `/bygg` retains the separate project and parts record.

Run `npm run build` and `npm test` with Node 22 or later. There are no installation dependencies. The build downloads the existing A11, A8 and lens assets from the original public studio, verifies their pinned SHA-256 hashes, and includes them in `dist` alongside the local A9 and A10 models. The deployed site serves these files locally and does not proxy the studio.

Narrative source: FormNerd Sites version 17, commit `9c5787deafdfd208d60f2ef2be51684fa22b94b4`.

Studio source: https://formnerd-kamerastudio.lukketsvane.chatgpt.site, retrieved 2026-10-10, with A9 and A10 changes from local studio source commit `86b8bc5b957374c699f71a5eff898a2b1dc0ac70`. Retained distribution modules include the camera, lens and caustic renderers, React components, Three.js loaders, controls and styles. The editable integration lives in `public/studio/studio.js`, `router.js` and `studio.css`.

Production target: Vercel project `prj_PRPdQn7ffboydExRD1rTSDHbMpJY`, team `team_6ukeAMsNaWMRhHombsc7EIwn`. The previous project-level catch-all proxy must be disabled for the combined deployment to serve the custom domain.
