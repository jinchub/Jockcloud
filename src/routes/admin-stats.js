module.exports = (app, deps) => {
  const { authRequired, adminRequired, pool, sendDbError } = deps;

  app.get("/api/admin/stats", authRequired, adminRequired, async (req, res) => {
    try {
      const [totalUsed] = await pool.query("SELECT SUM(size) AS total FROM files WHERE deleted_at IS NULL");
      const [userCount] = await pool.query("SELECT COUNT(*) AS total FROM users");
      
      res.json({
        totalUsed: Number(totalUsed[0].total || 0),
        userCount: userCount[0].total
      });
    } catch (error) {
      sendDbError(res, error);
    }
  });
};
