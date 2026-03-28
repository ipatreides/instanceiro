# Discord Map Attachment Design

## Summary

When the Discord bot sends MVP alerts (pre_spawn at 15/10/5 min and spawn), attach a map image with the tomb point plotted — matching the visual style of the site's `MvpMapPicker`.

## Image Generation

- **Library:** `sharp`
- **Output:** 512x512 PNG (maps resized/normalized to this size regardless of source resolution)
- **Marker:** ~12px circle, copper fill (`#B87333`), amber border (`#F59E0B`), glow effect via Gaussian blur — generated as inline SVG composed onto the map

### Coordinate Conversion

Same logic as `MvpMapPicker`:

```
pixelX = (tombX / mapMeta.width) * 512
pixelY = ((mapMeta.height - tombY) / mapMeta.height) * 512
```

Y is inverted (game origin is bottom-left, image origin is top-left).

### Marker SVG

```svg
<svg width="24" height="24" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="glow">
      <feGaussianBlur stdDeviation="2" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <circle cx="12" cy="12" r="6" fill="#B87333" stroke="#F59E0B" stroke-width="2" filter="url(#glow)"/>
</svg>
```

Composed at `(pixelX - 12, pixelY - 12)` to center the marker on the tomb point.

## New File

### `src/lib/map-image.ts`

```typescript
generateMapWithTomb(mapName: string, tombX: number, tombY: number, mapWidth: number, mapHeight: number): Promise<Buffer>
```

1. Read map PNG from `public/maps/{mapName}.png`
2. Resize to 512x512 with `sharp.resize(512, 512, { fit: 'fill' })`
3. Convert game coords to pixel coords
4. Composite marker SVG at computed position
5. Return PNG buffer

## Changes to Alert Processing

### `src/app/api/mvp-alerts/process/route.ts`

1. **`sendChannelMessage()`** — accept optional `imageBuffer: Buffer` parameter. When present, send as `multipart/form-data` with `files[0]` (the map image) and `payload_json` (content + embed). When absent, send JSON with `content` only (current behavior).

2. **Alert loop** — after building the message text:
   - Build `content` string with full info (same as today — works for push notifications)
   - If `tomb_x` and `tomb_y` exist, fetch `mvp_map_meta` for the MVP's `map_name`
   - If map meta exists, call `generateMapWithTomb()` to get the image buffer
   - Pass content + buffer to `sendChannelMessage()`

3. **Batch fetch `mvp_map_meta`** — fetch all needed map metadata in one query alongside the existing batch fetches (kills, groups, MVPs, discord configs).

### Message Strategy: content + embed

Discord push notifications only show the `content` field — embed content is invisible in notifications. To serve both users who only see notifications and users who read the channel:

- **`content`** — `@everyone` + full text info (MVP name, map, spawn time, tomb coords). This is what appears in push notifications. Same format as today.
- **`embed`** — same info formatted nicely + map image. This is the visual bonus for users who open the channel.

#### Pre-spawn example

```json
{
  "content": "@everyone\n🔴 Eddga (pay_fild10)\n⏰ Spawn em 15 minutos (14:30 ~ 14:40 BRT)\n📍 Tumba: 182, 234",
  "embeds": [{
    "title": "🔴 Eddga (pay_fild10)",
    "description": "⏰ Spawn em 15 minutos (14:30 ~ 14:40 BRT)\n📍 Tumba: 182, 234",
    "image": { "url": "attachment://map.png" },
    "color": 12350259
  }],
  "allowed_mentions": { "parse": ["everyone"] }
}
```

#### Spawn example

```json
{
  "content": "@everyone\n🟢 Eddga (pay_fild10) pode ter nascido!\n📍 Última tumba: 182, 234",
  "embeds": [{
    "title": "🟢 Eddga (pay_fild10) pode ter nascido!",
    "description": "📍 Última tumba: 182, 234",
    "image": { "url": "attachment://map.png" },
    "color": 12350259
  }],
  "allowed_mentions": { "parse": ["everyone"] }
}
```

- **Embed color:** `12350259` (`0xB87333` copper, matches project identity)
- Without tomb/map: no embed, no image — `content`-only message (current behavior)

### Discord API Multipart Format

```
Content-Type: multipart/form-data

--boundary
Content-Disposition: form-data; name="payload_json"
Content-Type: application/json

{"content":"@everyone\n...","embeds":[...],"allowed_mentions":{"parse":["everyone"]}}
--boundary
Content-Disposition: form-data; name="files[0]"; filename="map.png"
Content-Type: image/png

<binary PNG data>
--boundary--
```

## Conditions

- Image + embed is attached when `tomb_x` AND `tomb_y` are non-null AND `mvp_map_meta` exists for the map
- If any condition fails, message is sent as `content`-only (current behavior, no regression)

## Dependencies

- `sharp` (add to `package.json` if not already present as direct dependency)
