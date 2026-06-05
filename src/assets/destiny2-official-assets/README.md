# Destiny 2 Official Asset Pack

No generated images are included.

## Backgrounds

- `backgrounds/steam_destiny2_library_hero_3840x1240.jpg`
  - Official Destiny 2 Steam CDN library hero.
  - Dimensions: 3840x1240, so it satisfies an "at least 1920x1080" background requirement.
- `backgrounds/steam_destiny2_library_hero_1920x620.jpg`
  - Same official Steam image at standard library-hero size.
- `backgrounds/steam_destiny2_page_bg_1438x810.jpg`
  - Official Steam page background. Included for reference, but it is below 1920x1080.

## Expansion / Year Icons

- `expansion-watermarks/old-lights-expansion-years/`
  - Named folders for the Old Lights expansion-year checklist:
    - Destiny 2 / Red War year
    - Forsaken year
    - Shadowkeep year
    - Beyond Light year
    - Witch Queen year
    - Lightfall year
    - The Final Shape year
    - Year of Prophecy / Edge of Fate
    - Year of Prophecy / Renegades
  - Each folder contains all official Bungie watermark variants mapped to that season/year by DIM's public season data.

- `expansion-watermarks/all-watermarks/`
  - All 95 official Bungie watermark PNGs referenced by DIM's `all-watermarks.json`.

- Contact sheets:
  - `expansion-watermarks/old-lights-expansion-years-contact-sheet.png`
  - `expansion-watermarks/watermark-contact-sheet.png`

## Old Lights Reward Icon

I could not verify/download the specific Old Lights emblem/reward icon from the available public sources in this environment. Bungie, Light.gg, Destiny Emblem Collector, and DestinySets pages/API routes were blocked for direct terminal retrieval, and the provided app screenshot shows the reward tile but no loaded emblem art.

If the emblem becomes available through the public Destiny manifest, its icon should be fetchable from Bungie's CDN and can be added later.

## Sources

- Backgrounds: Steam static CDN for app `1085660` (Destiny 2), publisher-provided official Steam media.
- Watermarks/icons: Bungie CDN image files referenced by Destiny Item Manager's public `d2-additional-info` data.
