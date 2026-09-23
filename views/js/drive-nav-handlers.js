let bindNav = () => {
  let myFilesHeader = document.getElementById("myFilesHeader");
  let quickAccessHeader = (
    myFilesHeader &&
      (myFilesHeader.onclick = async (event) => {
        let sidebarEl, overlayEl, toggleSecondaryBtn, toggleIcon;

        if (event.target && event.target.closest("#myFilesMoreBtn, #myFilesNamePanel")) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        if (event.target && event.target.closest(".toggle-icon")) {
          if (myFilesHeader.parentElement) {
            myFilesHeader.parentElement.classList.toggle("expanded");
          }
          return;
        }

        if (myFilesHeader.parentElement) {
          myFilesHeader.parentElement.classList.add("expanded");
        }

        sidebarEl = document.getElementById("secondarySidebar");
        overlayEl = document.getElementById("sidebarOverlay");

        if (
          window.matchMedia("(max-width: 768px)").matches &&
          sidebarEl &&
          !sidebarEl.classList.contains("collapsed")
        ) {
          sidebarEl.classList.add("collapsed");
          toggleSecondaryBtn = document.getElementById("toggleSecondaryBtn");
          toggleIcon = toggleSecondaryBtn ? toggleSecondaryBtn.querySelector("i") : null;
          if (toggleIcon) {
            toggleIcon.className = "fa-solid fa-angles-right";
            toggleSecondaryBtn.title = "展开侧边栏";
          }
          if (overlayEl) {
            overlayEl.classList.remove("show");
          }
        }

        await switchMainView("files");
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
        setUploadTasksViewVisible(!1);
        setMySharesViewVisible(!1);
        updateRouteQuery({ main: "files", side: "myFiles", category: null });
        await refreshAll();
        mainNavItems.forEach((item) => {
          item.classList.toggle("active", item.dataset.view === "files");
        });
        if (uploadTasksNavBtn) {
          uploadTasksNavBtn.classList.remove("active");
        }
        if (sidebarEl) {
          sidebarEl.style.display = "";
        }
        if (mobileCategoryBar) {
          mobileCategoryBar.style.display = "";
        }
      }),
    myFilesMoreBtn &&
      myFilesNamePanel &&
      ((myFilesMoreBtn.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        myFilesNamePanel.classList.toggle("visible");
      }),
      (myFilesNamePanel.onclick = (event) => {
        event.stopPropagation();
      }),
      myFilesNamePanel.querySelectorAll("input[data-category-visibility]").forEach((input) => {
        input.onchange = async () => {
          let nextVisibleCategories = Array.from(
            myFilesNamePanel.querySelectorAll("input[data-category-visibility]:checked")
          )
            .map((checkedInput) => String(checkedInput.dataset.categoryVisibility || "").trim().toLowerCase())
            .filter(
              (category, index, categories) =>
                FILE_CATEGORY_KEYS.includes(category) && categories.indexOf(category) === index
            );
          let previousVisibleCategories = state.visibleCategories.slice();
          let shouldResetCurrentCategory = state.category && !nextVisibleCategories.includes(state.category);

          state.visibleCategories = nextVisibleCategories;
          applyCategoryVisibilityUI();
          (shouldResetCurrentCategory
            ? (state.category = "",
              updateRouteQuery({ main: "files", side: "myFiles", category: null }),
              refreshAll())
            : updateNavState)();

          try {
            await persistCategoryVisibilityPreference();
          } catch (error) {
            state.visibleCategories = previousVisibleCategories;
            applyCategoryVisibilityUI();
            updateNavState();
            alert(error && error.message ? error.message : "分类显示偏好保存失败");
          }
        };
      })),
    document.getElementById("quickAccessHeader")
  );

  var mobileAllBtn;

  if (quickAccessHeader) {
    quickAccessHeader.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      quickAccessHeader.parentElement.classList.toggle("expanded");
    };
  }

  document.querySelectorAll(".secondary-nav-item").forEach((item) => {
    let text = item.textContent.trim();

    if (text.includes("回收站")) {
      item.onclick = (event) => {
        event.preventDefault();
        clearSelection();
        state.view = "recycle";
        state.category = "";
        state.keyword = "";
        state.currentFolderId = null;
        state.selectedEntry = null;
        if (detailsSidebar) {
          detailsSidebar.classList.add("hidden");
        }
        if (detailsSidebarOverlay) {
          detailsSidebarOverlay.classList.remove("show");
        }
        setUploadTasksViewVisible(!1);
        updateRouteQuery({ main: "files", side: "recycle", category: null, fileSpace: state.fileSpace });
        refreshAll();
      };
    } else if (item.id === "hiddenSpaceNavBtn" || text.includes("私密空间")) {
      item.onclick = async (event) => {
        event.preventDefault();
        if (await ensureHiddenSpaceAccess()) {
          await switchMainView("files");
          await switchFileSpace("hidden", "hidden");
        }
      };
    } else if (item.id === "mySharesNavBtn") {
      item.onclick = async (event) => {
        event.preventDefault();
        if (mySharesMainContainer && !mySharesMainContainer.classList.contains("hidden")) {
          setMySharesViewVisible(!1);
        } else {
          await loadMyShares();
          state.mySharesPage = 1;
          renderMyShares();
          setMySharesViewVisible(!0);
        }
        syncRouteByCurrentState();
      };
    }
  });

  if (uploadTasksNavBtn) {
    uploadTasksNavBtn.onclick = async (event) => {
      let filesView;

      event.preventDefault();
      filesView = document.getElementById("view-files");

      if (
        filesView &&
        filesView.style.display !== "none" &&
        uploadTasksMainContainer &&
        !uploadTasksMainContainer.classList.contains("hidden")
      ) {
        await switchMainView("files");
        setUploadTasksViewVisible(!1);
        await refreshAll();
        updateRouteQuery({
          main: "files",
          side: resolveCurrentFilesSide().side,
          category: resolveCurrentFilesSide().category,
          usersTab: null,
          mountId: null,
          syncTaskId: null,
          settingsMenu: null,
        });
      } else {
        state.view = "files";
        state.category = "";
        state.keyword = "";
        state.currentFolderId = null;
        await switchMainView("files");
        setUploadTasksViewVisible(!0);
        updateTransferTabIndicator();
        updateRouteQuery({
          main: "files",
          side: "uploadTasks",
          category: null,
          usersTab: null,
          mountId: null,
          syncTaskId: null,
          settingsMenu: null,
        });
      }
    };
  }

  document.querySelectorAll(".sub-nav-item[data-category]").forEach((item) => {
    let category = String(item.dataset.category || "").trim().toLowerCase();

    if (category === "all") {
      item.onclick = (event) => {
        event.preventDefault();
        clearSelection();
        setUploadTasksViewVisible(!1);
        state.fileSpace = "normal";
        state.view = "files";
        state.category = "";
        state.keyword = "";
        state.currentFolderId = null;
        state.selectedEntry = null;
        updateHiddenSpaceUiState();
        updateRouteQuery({ main: "files", side: "myFiles", category: null });
        refreshAll();
      };
    } else if (FILE_CATEGORY_KEYS.includes(category)) {
      item.onclick = (event) => {
        event.preventDefault();
        if (!isCategoryVisible(category)) {
          return;
        }
        clearSelection();
        setUploadTasksViewVisible(!1);
        state.fileSpace = "normal";
        state.view = "files";
        state.category = category;
        state.keyword = "";
        state.selectedEntry = null;
        updateHiddenSpaceUiState();
        updateRouteQuery({ main: "files", side: "category", category });
        refreshAll();
      };
    }
  });

  if (mobileCategoryBar && (mobileAllBtn = mobileCategoryBar.querySelector("[data-mobile-category-all]"))) {
    mobileAllBtn.onclick = (event) => {
      event.preventDefault();
      clearSelection();
      setUploadTasksViewVisible(!1);
      state.fileSpace = "normal";
      state.view = "files";
      state.category = "";
      state.keyword = "";
      state.currentFolderId = null;
      state.selectedEntry = null;
      updateHiddenSpaceUiState();
      updateRouteQuery({ main: "files", side: "myFiles", category: null });
      refreshAll();
    };
  }
},
bindThemeToggle = () => {
  var themeToggleBtn = document.getElementById("themeToggleBtn");
  if (themeToggleBtn) {
    themeToggleBtn.onclick = (event) => {
      let nextTheme;

      event.preventDefault();
      event.stopPropagation();
      event = getThemeMode();
      nextTheme = event === "auto" ? "light" : event === "light" ? "dark" : "auto";
      setThemeMode(nextTheme);
    };
  }
},
bindRefreshPage = () => {
  var refreshPageBtn = document.getElementById("refreshPageBtn");
  if (refreshPageBtn) {
    refreshPageBtn.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      window.location.reload();
    };
  }
},
bindPullToRefresh = () => {
  let indicator = document.getElementById("pullToRefreshIndicator"),
    fileList = document.getElementById("fileList");

  if (indicator && fileList) {
    let startY = 0,
      currentY = 0,
      isTouching = !1,
      isRefreshing = !1;

    fileList.addEventListener(
      "touchstart",
      (event) => {
        if (
          !window.matchMedia("(max-width: 768px)").matches ||
          isRefreshing ||
          fileList.scrollTop > 0
        ) {
          return;
        }
        startY = event.touches[0].clientY;
        isTouching = !0;
      },
      { passive: !0 }
    );

    fileList.addEventListener(
      "touchmove",
      (event) => {
        let deltaY;

        if (!isTouching || isRefreshing) {
          return;
        }
        deltaY = (currentY = event.touches[0].clientY) - startY;
        if (deltaY > 0 && deltaY < 120) {
          indicator.classList.add("visible");
          if (deltaY >= 60) {
            indicator.classList.add("pullable");
          } else {
            indicator.classList.remove("pullable");
          }
        } else {
          indicator.classList.remove("visible", "pullable");
        }
      },
      { passive: !1 }
    );

    fileList.addEventListener(
      "touchend",
      async () => {
        if (!isTouching || isRefreshing) {
          isTouching = !1;
          return;
        }

        isTouching = !1;
        if (currentY - startY >= 60) {
          isRefreshing = !0;
          indicator.classList.remove("pullable");
          indicator.classList.add("refreshing");
          try {
            await refreshAll();
          } catch (error) {
            console.error(error);
          } finally {
            indicator.classList.remove("refreshing", "visible");
            isRefreshing = !1;
          }
        } else {
          indicator.classList.remove("visible", "pullable");
        }

        startY = 0;
        currentY = 0;
      },
      { passive: !0 }
    );
  }
};
