// Init
const MENU_CACHE_KEY = "drive_allowed_menus_cache_v1";
const MOBILE_MENU_CACHE_KEY = "drive_mobile_visible_menus_cache_v1";

try {
  const hasAllowedMenusCache = localStorage.getItem(MENU_CACHE_KEY) !== null;
  const hasMobileMenusCache = localStorage.getItem(MOBILE_MENU_CACHE_KEY) !== null;
  if (hasAllowedMenusCache) {
    const cachedAllowedMenus = JSON.parse(localStorage.getItem(MENU_CACHE_KEY) || "[]");
    state.allowedMenus = normalizeAllowedMenus(cachedAllowedMenus);
  }
  if (hasMobileMenusCache) {
    const cachedMobileVisibleMenus = JSON.parse(localStorage.getItem(MOBILE_MENU_CACHE_KEY) || "[]");
    state.mobileVisibleMenus = normalizeAllowedMenus(cachedMobileVisibleMenus);
  }
} catch (_error) {}

applyMainMenuVisibility();
bindNav();
bindPrimaryNav();
bindDragUpload();
bindUserTableSortEvents();
bindProfileCenter();
switchTransferTaskTab("upload");
bindThemeToggle();
  bindRefreshPage();
