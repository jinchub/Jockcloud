// Nav Click Handlers
const bindNav = () => {
  const myFilesHeader = document.getElementById("myFilesHeader");
  if (myFilesHeader) {
    myFilesHeader.onclick = async (event) => {
      if (event.target && event.target.closest("#myFilesMoreBtn, #myFilesNamePanel")) return;
      event.preventDefault();
      event.stopPropagation();
      
      const isExpanding = !myFilesHeader.parentElement.classList.contains("expanded");
      myFilesHeader.parentElement.classList.toggle("expanded");
      
      if (!isExpanding) {
        return;
      }
      
      const secondarySidebar = document.getElementById("secondarySidebar");
      const sidebarOverlay = document.getElementById("sidebarOverlay");
      if (window.matchMedia("(max-width: 768px)").matches && secondarySidebar && !secondarySidebar.classList.contains("collapsed")) {
        secondarySidebar.classList.add("collapsed");
        const toggleSecondaryBtn = document.getElementById("toggleSecondaryBtn");
        if (toggleSecondaryBtn) {
          const icon = toggleSecondaryBtn.querySelector("i");
          if (icon) {
            icon.className = "fa-solid fa-angles-right";
            toggleSecondaryBtn.title = "展开侧边栏";
          }
        }
        if (sidebarOverlay) {
          sidebarOverlay.classList.remove("show");
        }
      }
      await switchMainView("files");
      if (state.fileSpace === "hidden") {
        setHiddenSpaceUnlocked(false);
      }
      await switchFileSpace("normal", "myFiles");
      state.view = "files";
      state.category = "";
      state.keyword = "";
      state.currentFolderId = null;
      state.selectedEntry = null;
      clearSelection();
      if (searchInput) {
        searchInput.value = "";
      }
      setUploadTasksViewVisible(false);
      setMySharesViewVisible(false);
      updateRouteQuery({ main: "files", side: "myFiles", category: null });
      await refreshAll();
      mainNavItems.forEach(el => {
        el.classList.toggle("active", el.dataset.view === "files");
      });
      if (uploadTasksNavBtn) {
        uploadTasksNavBtn.classList.remove("active");
      }
      if (secondarySidebar) {
        secondarySidebar.style.display = "";
      }
      if (mobileCategoryBar) {
        mobileCategoryBar.style.display = "";
      }
    };
  }
  if (myFilesMoreBtn && myFilesNamePanel) {
    myFilesMoreBtn.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      myFilesNamePanel.classList.toggle("visible");
    };
    myFilesNamePanel.onclick = (event) => {
      event.stopPropagation();
    };
    myFilesNamePanel.querySelectorAll("input[data-category-visibility]").forEach((input) => {
      input.onchange = async () => {
        const nextVisible = Array.from(myFilesNamePanel.querySelectorAll("input[data-category-visibility]:checked"))
          .map((item) => String(item.dataset.categoryVisibility || "").trim().toLowerCase())
          .filter((item, index, list) => FILE_CATEGORY_KEYS.includes(item) && list.indexOf(item) === index);
        const prevVisible = state.visibleCategories.slice();
        const categoryWillBeHidden = state.category && !nextVisible.includes(state.category);
        state.visibleCategories = nextVisible;
        applyCategoryVisibilityUI();
        if (categoryWillBeHidden) {
          state.category = "";
          updateRouteQuery({ main: "files", side: "myFiles", category: null });
          refreshAll();
        } else {
          updateNavState();
        }
        try {
          await persistCategoryVisibilityPreference();
        } catch (error) {
          state.visibleCategories = prevVisible;
          applyCategoryVisibilityUI();
          updateNavState();
          alert(error && error.message ? error.message : "分类显示偏好保存失败");
        }
      };
    });
  }
  
  const quickAccessHeader = document.getElementById("quickAccessHeader");
  if (quickAccessHeader) {
     quickAccessHeader.onclick = (event) => {
       event.preventDefault();
       event.stopPropagation();
       quickAccessHeader.parentElement.classList.toggle("expanded");
     };
  }

  // Recycle Bin
  // Find items by text content because class usage changed
  const navItems = document.querySelectorAll(".secondary-nav-item");
  navItems.forEach(item => {
    const text = item.textContent.trim();
    if (text.includes("回收站")) {
      item.onclick = (e) => {
        e.preventDefault();
        clearSelection();
        state.view = "recycle";
        state.category = "";
        state.keyword = "";
        state.currentFolderId = null;
        state.selectedEntry = null;
        setUploadTasksViewVisible(false);
        updateRouteQuery({ main: "files", side: "recycle", category: null, fileSpace: state.fileSpace });
        refreshAll();
      };
    } else if (text.includes("隐藏空间")) {
       item.onclick = async (e) => {
         e.preventDefault();
         const pass = await ensureHiddenSpaceAccess();
         if (!pass) return;
         await switchMainView("files");
         await switchFileSpace("hidden", "hidden");
       };
    } else if (item.id === "mySharesNavBtn") {
      item.onclick = async (e) => {
        e.preventDefault();
        const visible = mySharesMainContainer && !mySharesMainContainer.classList.contains("hidden");
        if (visible) {
          setMySharesViewVisible(false);
          syncRouteByCurrentState();
          return;
        }
        await loadMyShares();
        state.mySharesPage = 1;
        renderMyShares();
        setMySharesViewVisible(true);
        syncRouteByCurrentState();
      };
    }
  });
  if (uploadTasksNavBtn) {
    uploadTasksNavBtn.onclick = async (e) => {
      e.preventDefault();
      const visible = uploadTasksMainContainer && !uploadTasksMainContainer.classList.contains("hidden");
      if (visible) {
        await switchMainView("files");
        setUploadTasksViewVisible(false);
        await refreshAll();
        updateRouteQuery({ main: "files", side: resolveCurrentFilesSide().side, category: resolveCurrentFilesSide().category, usersTab: null, mountId: null, syncTaskId: null, settingsMenu: null });
        return;
      }
      if (state.view === "recycle") {
        state.view = "files";
        state.category = "";
        state.currentFolderId = null;
      }
      await switchMainView("files");
      setUploadTasksViewVisible(true);
      updateRouteQuery({ main: "files", side: "uploadTasks", category: null, usersTab: null, mountId: null, syncTaskId: null, settingsMenu: null });
    };
  }

  // Categories
  document.querySelectorAll(".sub-nav-item[data-category]").forEach(el => {
    const catKey = String(el.dataset.category || "").trim().toLowerCase();
    if (catKey === "all") {
      el.onclick = (e) => {
        e.preventDefault();
        clearSelection();
        setUploadTasksViewVisible(false);
        state.fileSpace = "normal";
        state.view = "files";
        state.category = "";
        state.keyword = "";
        state.currentFolderId = null;
        state.selectedEntry = null;
        updateRouteQuery({ main: "files", side: "myFiles", category: null });
        refreshAll();
      };
    } else if (FILE_CATEGORY_KEYS.includes(catKey)) {
      el.onclick = (e) => {
        e.preventDefault();
        if (!isCategoryVisible(catKey)) return;
        clearSelection();
        setUploadTasksViewVisible(false);
        state.fileSpace = "normal";
        state.view = "files";
        state.category = catKey;
        state.keyword = "";
        state.selectedEntry = null;
        updateRouteQuery({ main: "files", side: "category", category: catKey });
        refreshAll();
      };
    }
  });
  if (mobileCategoryBar) {
    const mobileCategoryAllBtn = mobileCategoryBar.querySelector("[data-mobile-category-all]");
    if (mobileCategoryAllBtn) {
      mobileCategoryAllBtn.onclick = (e) => {
        e.preventDefault();
        clearSelection();
        setUploadTasksViewVisible(false);
        state.fileSpace = "normal";
        state.view = "files";
        state.category = "";
        state.keyword = "";
        state.currentFolderId = null;
        state.selectedEntry = null;
        updateRouteQuery({ main: "files", side: "myFiles", category: null });
        refreshAll();
      };
    }
  }
};

const bindThemeToggle = () => {
  const themeToggleBtn = document.getElementById("themeToggleBtn");
  if (!themeToggleBtn) return;
  themeToggleBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const currentMode = getThemeMode();
    let nextMode;
    if (currentMode === "auto") {
      nextMode = "light";
    } else if (currentMode === "light") {
      nextMode = "dark";
    } else {
      nextMode = "auto";
    }
    setThemeMode(nextMode);
  };
};

const bindRefreshPage = () => {
  const refreshPageBtn = document.getElementById("refreshPageBtn");
  if (!refreshPageBtn) return;
  refreshPageBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.location.reload();
  };
};
