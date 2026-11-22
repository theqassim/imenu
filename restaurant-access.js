"use strict";
// Access guard for restaurant settings writes (PATCH /api/v1/restaurants/:id).
// Before this guard the route only required a valid token: any authenticated
// user — including another venue's trial owner — could rewrite any restaurant
// by id (design, store page, offers, customUI, images).
//
// Legitimate writers, from the client audit:
// - admin (super admin panel, super.html edits any restaurant);
// - owner, only their own restaurant (admin.html settings/design/store-page/
//   categories/offers saves; those sections are owner-only in the dashboard);
// - staff roles (cashier/kitchen/waiter) have no UI path to these saves, so
//   they are denied. Unauthenticated requests never reach here (protect first).
//
// The owner check reuses the pattern from export-menu/import-menu and product
// delete: a restaurant row matching both the id and req.user._id as owner.

async function checkRestaurantWriteAccess(supabase, user, restaurantId) {
  if (!user || !user.role) return { ok: false, status: 401, message: "أنت غير مسجل دخول!" };
  if (user.role === "admin") return { ok: true };
  if (user.role !== "owner") return { ok: false, status: 403, message: "غير مصرح بهذه العملية" };
  const { data: ownCheck } = await supabase
    .from("restaurants")
    .select("_id")
    .eq("_id", restaurantId)
    .eq("owner", user._id)
    .single();
  if (!ownCheck) return { ok: false, status: 403, message: "غير مصرح بهذه العملية" };
  return { ok: true };
}

// Express middleware factory: rejects BEFORE multer parses/stores uploads, so a
// rejected request leaves nothing behind. Runs after protect, so req.user is set.
function createRestaurantWriteGuard(supabase) {
  return async function restaurantWriteGuard(req, res, next) {
    try {
      const access = await checkRestaurantWriteAccess(supabase, req.user, req.params && req.params.id);
      if (!access.ok) return res.status(access.status).json({ message: access.message });
      next();
    } catch (err) {
      res.status(400).json({ message: err.message });
    }
  };
}

module.exports = { checkRestaurantWriteAccess, createRestaurantWriteGuard };
