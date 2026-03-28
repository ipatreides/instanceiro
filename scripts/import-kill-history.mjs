#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GROUP_ID = process.argv[2]; // Pass group_id as first argument
const REGISTERED_BY = process.argv[3]; // Pass character_id of who "registered" these

// IMPORTANT: Before running, disable the alert trigger to avoid spam:
//   npx supabase db query --linked "ALTER TABLE mvp_kills DISABLE TRIGGER trg_queue_mvp_alerts;"
// After import, re-enable:
//   npx supabase db query --linked "ALTER TABLE mvp_kills ENABLE TRIGGER trg_queue_mvp_alerts;"

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !GROUP_ID || !REGISTERED_BY) {
  console.error('Usage: node --env-file=.env.local scripts/import-kill-history.mjs <group_id> <character_id>');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Excel serial to ISO date
function excelToDate(serial) {
  return new Date((serial - 25569) * 86400000).toISOString();
}

async function main() {
  const wb = XLSX.readFile('C:/Users/Marcel/Downloads/Team Eclipse MVP (1).xlsx');

  // Build planilha ID -> monster_id + map_name mapping
  const mvpData = XLSX.utils.sheet_to_json(wb.Sheets['MVPData'], { header: 1 });
  const idToMonster = new Map();
  const idToMap = new Map();
  for (let i = 1; i < mvpData.length; i++) {
    const row = mvpData[i];
    if (row[0] && row[1]) {
      idToMonster.set(row[0], row[1]);
      idToMap.set(row[0], row[2]);
    }
  }

  // Get our mvps table mapping: (monster_id, map_name) -> mvps.id for server 1
  const { data: dbMvps } = await supabase
    .from('mvps')
    .select('id, monster_id, map_name')
    .eq('server_id', 1);

  const mvpLookup = new Map();
  for (const m of (dbMvps ?? [])) {
    mvpLookup.set(`${m.monster_id}:${m.map_name}`, m.id);
  }

  // Parse kills
  const kills = XLSX.utils.sheet_to_json(wb.Sheets['Conteo Muertes'], { header: 1 });
  const rows = [];
  let skipped = 0;

  for (let i = 1; i < kills.length; i++) {
    const planilhaId = kills[i][0];
    const deadTime = kills[i][1];
    const mvpName = kills[i][2];
    const cardDrop = kills[i][3];

    if (!planilhaId || typeof deadTime !== 'number') { skipped++; continue; }

    const monsterId = idToMonster.get(planilhaId);
    const mapName = idToMap.get(planilhaId);
    if (!monsterId || !mapName) { skipped++; continue; }

    const dbMvpId = mvpLookup.get(`${monsterId}:${mapName}`);
    if (!dbMvpId) {
      console.warn(`  No DB MVP for monster_id=${monsterId} map=${mapName} (${mvpName})`);
      skipped++;
      continue;
    }

    rows.push({
      group_id: GROUP_ID,
      mvp_id: dbMvpId,
      killed_at: excelToDate(deadTime),
      tomb_x: null,
      tomb_y: null,
      killer_character_id: null, // No killer data in spreadsheet
      registered_by: REGISTERED_BY,
    });
  }

  console.log(`Parsed ${rows.length} kills (skipped ${skipped})`);

  // Insert in batches of 100
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { error } = await supabase.from('mvp_kills').insert(batch);
    if (error) {
      console.error(`Batch ${i}-${i + batch.length} error:`, error.message);
    } else {
      inserted += batch.length;
      console.log(`  Inserted ${inserted}/${rows.length}`);
    }
  }

  console.log(`Done! ${inserted} kills imported.`);
}

main().catch(console.error);
