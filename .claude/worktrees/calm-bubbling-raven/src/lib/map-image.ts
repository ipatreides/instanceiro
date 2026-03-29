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
