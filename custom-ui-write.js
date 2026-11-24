"use strict";
// Writes restaurants.customUI from the value just read. supabase-js turns an object passed to .eq() into
// "[object Object]", so the revision check compares the JSON text (Postgres casts it to jsonb). If the check
// cannot run or keeps failing, fall back to one plain update on a fresh read so the change is never lost.
async function writeCustomUI(client, restaurantId, buildUI, attempts = 3) {
  const read = async () => {
    const { data, error } = await client.from("restaurants").select("customUI").eq("_id", restaurantId).single();
    if (error) throw error;
    return data && data.customUI && typeof data.customUI === "object" ? data.customUI : {};
  };
  for (let i = 0; i < attempts; i++) {
    const current = await read();
    const merged = buildUI(current);
    const { data: wrote, error } = await client
      .from("restaurants").update({ customUI: merged }).eq("_id", restaurantId).eq("customUI", JSON.stringify(current)).select("_id");
    if (error) break;
    if (Array.isArray(wrote) && wrote.length > 0) return { ok: true, attempts: i + 1, customUI: merged };
  }
  const fresh = await read();
  const merged = buildUI(fresh);
  const { error } = await client.from("restaurants").update({ customUI: merged }).eq("_id", restaurantId);
  if (error) throw error;
  return { ok: true, fallback: true, customUI: merged };
}
module.exports = { writeCustomUI };
