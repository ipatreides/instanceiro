#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DIVINE_PRIDE_KEY = '78ce39ae8c2f15f269d1a8f542b76ffb';
const LATAM_JSON_URL = 'https://raw.githubusercontent.com/RagnarokMvpTimer/frontend/main/src/data/LATAM.json';
const MAPS_DIR = join(process.cwd(), 'public', 'maps');

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// Read PNG dimensions from header
function readPngDimensions(buffer) {
  if (buffer[0] !== 0x89 || buffer[1] !== 0x50) return null;
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

async function main() {
  console.log('Fetching LATAM.json...');
  const mvps = await fetchJSON(LATAM_JSON_URL);
  console.log(`Found ${mvps.length} MVPs`);

  // Prepare maps dir
  if (!existsSync(MAPS_DIR)) mkdirSync(MAPS_DIR, { recursive: true });

  // Collect unique maps and MVP rows
  const mapSet = new Set();
  const mvpRows = [];
  const monsterIds = new Set();

  for (const mvp of mvps) {
    monsterIds.add(mvp.id);
    for (const spawn of mvp.spawn) {
      mapSet.add(spawn.mapname);
      // Insert for both servers (1=Freya, 2=Nidhogg)
      for (const serverId of [1, 2]) {
        mvpRows.push({
          server_id: serverId,
          monster_id: mvp.id,
          name: mvp.name,
          map_name: spawn.mapname,
          respawn_ms: spawn.respawnTime,
          delay_ms: 600000, // Default 10 min window
          level: mvp.stats?.level ?? null,
          hp: mvp.stats?.health ?? null,
        });
      }
    }
  }

  // 1. Seed MVPs
  console.log(`Inserting ${mvpRows.length} MVP rows...`);
  const { error: mvpErr } = await supabase.from('mvps').upsert(mvpRows, {
    onConflict: 'server_id,monster_id,map_name',
  });
  if (mvpErr) console.error('MVP insert error:', mvpErr);
  else console.log('MVPs seeded.');

  // 2. Download map images + collect dimensions
  const maps = [...mapSet];
  console.log(`Processing ${maps.length} unique maps...`);
  const mapMeta = [];

  for (const mapName of maps) {
    const filePath = join(MAPS_DIR, `${mapName}.png`);

    if (!existsSync(filePath)) {
      try {
        const res = await fetch(`https://www.divine-pride.net/img/map/raw/${mapName}`);
        if (res.ok) {
          const buffer = Buffer.from(await res.arrayBuffer());
          writeFileSync(filePath, buffer);
          console.log(`  Downloaded ${mapName}.png`);
        } else {
          console.warn(`  Failed to download ${mapName}: HTTP ${res.status}`);
          continue;
        }
      } catch (e) {
        console.warn(`  Error downloading ${mapName}:`, e.message);
        continue;
      }
      await sleep(200); // Rate limit
    }

    const buffer = readFileSync(filePath);
    const dims = readPngDimensions(buffer);
    if (dims) {
      mapMeta.push({ map_name: mapName, width: dims.width, height: dims.height });
    }
  }

  console.log(`Inserting ${mapMeta.length} map metadata rows...`);
  const { error: mapErr } = await supabase.from('mvp_map_meta').upsert(mapMeta, {
    onConflict: 'map_name',
  });
  if (mapErr) console.error('Map meta insert error:', mapErr);
  else console.log('Map metadata seeded.');

  // 3. Fetch drops from Divine Pride
  console.log(`Fetching drops for ${monsterIds.size} monsters...`);
  const dropRows = [];

  for (const monsterId of monsterIds) {
    try {
      const monster = await fetchJSON(
        `https://www.divine-pride.net/api/database/Monster/${monsterId}?apiKey=${DIVINE_PRIDE_KEY}`
      );
      for (const drop of (monster.drops || [])) {
        // Fetch item name
        let itemName = `Item #${drop.itemId}`;
        try {
          const item = await fetchJSON(
            `https://www.divine-pride.net/api/database/Item/${drop.itemId}?apiKey=${DIVINE_PRIDE_KEY}`
          );
          itemName = item.name || itemName;
          await sleep(100);
        } catch { /* keep default name */ }

        dropRows.push({
          mvp_monster_id: monsterId,
          item_id: drop.itemId,
          item_name: itemName,
          drop_rate: drop.chance / 100, // Divine Pride returns basis points
        });
      }
      console.log(`  ${monster.name}: ${monster.drops?.length ?? 0} drops`);
      await sleep(200);
    } catch (e) {
      console.warn(`  Error fetching monster ${monsterId}:`, e.message);
    }
  }

  console.log(`Inserting ${dropRows.length} drop rows...`);
  const { error: dropErr } = await supabase.from('mvp_drops').upsert(dropRows, {
    onConflict: 'mvp_monster_id,item_id',
  });
  if (dropErr) console.error('Drop insert error:', dropErr);
  else console.log('Drops seeded.');

  console.log('Done!');
}

main().catch(console.error);
