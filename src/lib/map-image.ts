import sharp from "sharp";
import path from "path";

const MAP_SIZE = 512;

const MARKER_SIZE = 56;
const MARKER_HALF = MARKER_SIZE / 2;

const MARKER_SVG = `<svg width="${MARKER_SIZE}" height="${MARKER_SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="glow">
      <feGaussianBlur stdDeviation="5" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <circle cx="${MARKER_HALF}" cy="${MARKER_HALF}" r="14" fill="#FF6B00" stroke="#FFFFFF" stroke-width="3.5" filter="url(#glow)"/>
  <circle cx="${MARKER_HALF}" cy="${MARKER_HALF}" r="5" fill="#FFFFFF"/>
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

  // Clamp marker position so the SVG stays within the image bounds
  const markerLeft = Math.max(0, Math.min(pixelX - MARKER_HALF, MAP_SIZE - MARKER_SIZE));
  const markerTop = Math.max(0, Math.min(pixelY - MARKER_HALF, MAP_SIZE - MARKER_SIZE));

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
