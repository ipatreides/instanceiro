# Discord Map Attachment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Attach a map image with the tomb point plotted when the Discord bot sends MVP alerts.

**Architecture:** New utility `src/lib/map-image.ts` generates a 512x512 PNG (map + tomb marker) using `sharp`. The alert processing route calls this utility and sends the image as a Discord embed attachment via multipart/form-data.

**Tech Stack:** sharp (already available via Next.js), Discord API multipart uploads, inline SVG for marker rendering.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/map-image.ts` | Create | `generateMapWithTomb()` — composites tomb marker SVG onto map PNG |
| `src/app/api/mvp-alerts/process/route.ts` | Modify | Add embed+image support, multipart upload, batch fetch map meta |

---

### Task 1: Install sharp as direct dependency

Sharp is available at runtime via Next.js but should be declared explicitly since we're using it directly.

- [ ] **Step 1: Add sharp dependency**

```bash
npm install sharp
npm install -D @types/sharp
```

- [ ] **Step 2: Verify installation**

```bash
node -e "const sharp = require('sharp'); sharp(Buffer.alloc(1,0)).metadata().then(()=>console.log('OK')).catch(e=>console.log(e.message))"
```

Expected: `OK` (or metadata error, not import error)

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add sharp as direct dependency for map image generation"
```

---

### Task 2: Create `generateMapWithTomb` utility

**Files:**
- Create: `src/lib/map-image.ts`

- [ ] **Step 1: Create `src/lib/map-image.ts`**

```typescript
import sharp from "sharp";
import path from "path";

const MAP_SIZE = 512;

const MARKER_SVG = `<svg width="24" height="24" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="glow">
      <feGaussianBlur stdDeviation="2" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <circle cx="12" cy="12" r="6" fill="#B87333" stroke="#F59E0B" stroke-width="2" filter="url(#glow)"/>
</svg>`;

/**
 * Generate a 512x512 map PNG with a tomb marker plotted at the given game coordinates.
 * Coordinate conversion mirrors MvpMapPicker: Y is inverted (game origin bottom-left, image origin top-left).
 */
export async function generateMapWithTomb(
  mapName: string,
  tombX: number,
  tombY: number,
  mapWidth: number,
  mapHeight: number
): Promise<Buffer> {
  const mapPath = path.join(process.cwd(), "public", "maps", `${mapName}.png`);

  const pixelX = Math.round((tombX / mapWidth) * MAP_SIZE);
  const pixelY = Math.round(((mapHeight - tombY) / mapHeight) * MAP_SIZE);

  // Clamp marker position so the 24x24 SVG stays within the image bounds
  const markerLeft = Math.max(0, Math.min(pixelX - 12, MAP_SIZE - 24));
  const markerTop = Math.max(0, Math.min(pixelY - 12, MAP_SIZE - 24));

  const mapBuffer = await sharp(mapPath)
    .resize(MAP_SIZE, MAP_SIZE, { fit: "fill" })
    .composite([
      {
        input: Buffer.from(MARKER_SVG),
        left: markerLeft,
        top: markerTop,
      },
    ])
    .png()
    .toBuffer();

  return mapBuffer;
}
```

- [ ] **Step 2: Verify the file compiles**

```bash
npx tsc --noEmit src/lib/map-image.ts
```

Expected: no errors (or run full build check)

- [ ] **Step 3: Quick smoke test**

```bash
node -e "
const { generateMapWithTomb } = require('./src/lib/map-image');
// Won't work directly with ESM/TS, but verify sharp import path is correct:
import('sharp').then(s => console.log('sharp resolves OK'));
"
```

If TS module, verify with:
```bash
npx tsx -e "import { generateMapWithTomb } from './src/lib/map-image'; console.log(typeof generateMapWithTomb);"
```

Expected: `function`

- [ ] **Step 4: Commit**

```bash
git add src/lib/map-image.ts
git commit -m "feat: add generateMapWithTomb utility for Discord map attachments"
```

---

### Task 3: Update `sendChannelMessage` to support multipart with image

**Files:**
- Modify: `src/app/api/mvp-alerts/process/route.ts`

- [ ] **Step 1: Replace `sendChannelMessage` with multipart-capable version**

Replace the existing `sendChannelMessage` function (lines 6-16) with:

```typescript
async function sendChannelMessage(
  botToken: string,
  channelId: string,
  content: string,
  embed?: { title: string; description: string; color: number },
  imageBuffer?: Buffer
): Promise<boolean> {
  const url = `${DISCORD_API}/channels/${channelId}/messages`;
  const headers: Record<string, string> = {
    Authorization: `Bot ${botToken}`,
  };

  // If we have an image, send as multipart/form-data with embed
  if (imageBuffer && embed) {
    const boundary = `----formdata-${Date.now()}`;
    headers["Content-Type"] = `multipart/form-data; boundary=${boundary}`;

    const payloadJson = JSON.stringify({
      content,
      embeds: [
        {
          title: embed.title,
          description: embed.description,
          image: { url: "attachment://map.png" },
          color: embed.color,
        },
      ],
      allowed_mentions: { parse: ["everyone"] },
    });

    const parts = [
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="payload_json"\r\n`,
      `Content-Type: application/json\r\n\r\n`,
      payloadJson,
      `\r\n--${boundary}\r\n`,
      `Content-Disposition: form-data; name="files[0]"; filename="map.png"\r\n`,
      `Content-Type: image/png\r\n\r\n`,
    ];
    const closing = `\r\n--${boundary}--\r\n`;

    const textEncoder = new TextEncoder();
    const prefixBytes = textEncoder.encode(parts.join(""));
    const suffixBytes = textEncoder.encode(closing);

    const body = Buffer.concat([
      Buffer.from(prefixBytes),
      imageBuffer,
      Buffer.from(suffixBytes),
    ]);

    const res = await fetch(url, { method: "POST", headers, body });
    return res.ok;
  }

  // No image — send JSON content-only (current behavior)
  headers["Content-Type"] = "application/json";
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ content, allowed_mentions: { parse: ["everyone"] } }),
  });
  return res.ok;
}
```

- [ ] **Step 2: Verify the file compiles**

```bash
npx tsc --noEmit src/app/api/mvp-alerts/process/route.ts
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/mvp-alerts/process/route.ts
git commit -m "feat: support multipart image upload in Discord alert sender"
```

---

### Task 4: Wire up map generation and embed in the alert loop

**Files:**
- Modify: `src/app/api/mvp-alerts/process/route.ts`

- [ ] **Step 1: Add import for `generateMapWithTomb`**

At the top of the file, after existing imports:

```typescript
import { generateMapWithTomb } from "@/lib/map-image";
```

- [ ] **Step 2: Add batch fetch for `mvp_map_meta`**

After the existing `Promise.all` that fetches kills and groups (around line 63), add map meta to the MVP fetch section. After the `mvpMap` is built (around line 82), add:

```typescript
  // Fetch map metadata for coordinate conversion
  const mapNames = [...new Set((mvpsData ?? []).map((m: Record<string, unknown>) => m.map_name as string))];
  const { data: mapMetaData } = await supabase
    .from("mvp_map_meta")
    .select("map_name, width, height")
    .in("map_name", mapNames);
  const mapMetaMap = new Map(
    (mapMetaData ?? []).map((m: Record<string, unknown>) => [
      m.map_name as string,
      { width: m.width as number, height: m.height as number },
    ])
  );
```

- [ ] **Step 3: Update the alert loop to build embeds and generate images**

Replace the message-building and sending section inside the `for (const alert of alerts)` loop (the block from line 103 `let message: string;` through line 126 `if (sent)`) with:

```typescript
    let content: string;
    let embed: { title: string; description: string; color: number } | undefined;
    let imageBuffer: Buffer | undefined;

    if (alert.alert_type === "pre_spawn") {
      const parts = [
        `@everyone`,
        `🔴 **${mvp.name}** (${mvp.map_name})`,
        `⏰ Spawn em ${discordConfig.alert_minutes} minutos (${formatBrt(spawnAt)} ~ ${formatBrt(spawnEnd)} BRT)`,
      ];
      if (kill.tomb_x != null) parts.push(`📍 Tumba: ${kill.tomb_x}, ${kill.tomb_y}`);
      content = parts.join("\n");

      // Build embed + image when tomb coords exist
      const mapMeta = mapMetaMap.get(mvp.map_name);
      if (kill.tomb_x != null && kill.tomb_y != null && mapMeta) {
        embed = {
          title: `🔴 ${mvp.name} (${mvp.map_name})`,
          description: `⏰ Spawn em ${discordConfig.alert_minutes} minutos (${formatBrt(spawnAt)} ~ ${formatBrt(spawnEnd)} BRT)\n📍 Tumba: ${kill.tomb_x}, ${kill.tomb_y}`,
          color: 12350259, // 0xB87333 copper
        };
        try {
          imageBuffer = await generateMapWithTomb(mvp.map_name, kill.tomb_x as number, kill.tomb_y as number, mapMeta.width, mapMeta.height);
        } catch {
          // Map file missing or sharp error — send without image
        }
      }
    } else {
      const parts = [
        `@everyone`,
        `🟢 **${mvp.name}** (${mvp.map_name}) pode ter nascido!`,
      ];
      if (kill.tomb_x != null) parts.push(`📍 Última tumba: ${kill.tomb_x}, ${kill.tomb_y}`);
      content = parts.join("\n");

      const mapMeta = mapMetaMap.get(mvp.map_name);
      if (kill.tomb_x != null && kill.tomb_y != null && mapMeta) {
        embed = {
          title: `🟢 ${mvp.name} (${mvp.map_name}) pode ter nascido!`,
          description: `📍 Última tumba: ${kill.tomb_x}, ${kill.tomb_y}`,
          color: 12350259,
        };
        try {
          imageBuffer = await generateMapWithTomb(mvp.map_name, kill.tomb_x as number, kill.tomb_y as number, mapMeta.width, mapMeta.height);
        } catch {
          // Map file missing or sharp error — send without image
        }
      }
    }

    const sent = await sendChannelMessage(botToken, discordConfig.bot_channel_id, content, embed, imageBuffer);
```

- [ ] **Step 4: Verify the file compiles**

```bash
npx tsc --noEmit src/app/api/mvp-alerts/process/route.ts
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/app/api/mvp-alerts/process/route.ts
git commit -m "feat: attach map image with tomb marker in Discord MVP alerts"
```

---

### Task 5: Build verification

- [ ] **Step 1: Run full project build**

```bash
npm run build
```

Expected: build succeeds with no errors

- [ ] **Step 2: Verify no lint errors**

```bash
npm run lint
```

Expected: no errors

- [ ] **Step 3: Final commit if any fixes needed**

If build/lint required fixes, commit them:

```bash
git add -A
git commit -m "fix: address build/lint issues for discord map attachment"
```
