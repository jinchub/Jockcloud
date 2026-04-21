// Sort Handlers
document.querySelectorAll(".table-header > div").forEach(col => {
  if (col.classList.contains("cell-name")) {
    col.style.cursor = "pointer";
    col.onclick = () => {
      state.sortBy = "name";
      state.order = state.order === "asc" ? "desc" : "asc";
      refreshAll();
    };
  } else if (col.classList.contains("cell-size")) {
    col.style.cursor = "pointer";
    col.onclick = () => {
      state.sortBy = "size";
      state.order = state.order === "asc" ? "desc" : "asc";
      refreshAll();
    };
  } else if (col.classList.contains("cell-type")) {
    col.style.cursor = "pointer";
    col.onclick = () => {
      state.sortBy = "type";
      state.order = state.order === "asc" ? "desc" : "asc";
      refreshAll();
    };
  } else if (col.classList.contains("cell-time")) {
    col.style.cursor = "pointer";
    col.onclick = () => {
      state.sortBy = state.view === "recycle" ? "deletedAt" : "updatedAt";
      state.order = state.order === "asc" ? "desc" : "asc";
      refreshAll();
    };
  }
});
