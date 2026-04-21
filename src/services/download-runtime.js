const createDownloadRuntime = ({
  pool,
  Throttle,
  DEFAULT_SETTINGS
}) => {
  const isLocalhostRequest = (req) => {
    const ip = req.ip || req.connection.remoteAddress;
    return ip === "::1" || ip === "127.0.0.1" || ip === "::ffff:127.0.0.1";
  };

  const getUserGroupIds = async (userId) => {
    const [rows] = await pool.query(
      "SELECT group_id FROM user_group_members WHERE user_id = ?",
      [userId]
    );
    return rows.map(row => row.group_id);
  };

  const getUserDownloadSpeedLimit = async (userId, settings) => {
    const config = settings && settings.download ? settings.download : {};
    const globalEnabled = !!config.enabled;
    const globalSpeedLimit = Number(config.speedLimitKbPerSecond || DEFAULT_SETTINGS.download.speedLimitKbPerSecond);
    if (!globalEnabled || !Number.isFinite(globalSpeedLimit) || globalSpeedLimit <= 0) {
      return 0;
    }

    const userGroupIds = await getUserGroupIds(userId);
    if (userGroupIds.length === 0) {
      return globalSpeedLimit;
    }

    const [groupRows] = await pool.query(
      `SELECT min_download_speed_kbps FROM user_groups WHERE id IN (${userGroupIds.map(() => "?").join(",")}) AND min_download_speed_kbps IS NOT NULL`,
      userGroupIds
    );

    if (groupRows.length === 0) {
      return globalSpeedLimit;
    }

    const groupLimits = groupRows
      .map(row => Number(row.min_download_speed_kbps))
      .filter(limit => Number.isFinite(limit) && limit > 0);

    if (groupLimits.length === 0) {
      return globalSpeedLimit;
    }

    const maxGroupLimit = Math.max(...groupLimits);
    return Math.max(globalSpeedLimit, maxGroupLimit);
  };

  const createSpeedLimitedStream = (readStream, res, speedLimitKbPerSecond) => {
    if (!speedLimitKbPerSecond || speedLimitKbPerSecond <= 0) {
      return readStream;
    }

    const bytesPerSecond = speedLimitKbPerSecond * 1024;
    const throttle = new Throttle({
      rate: bytesPerSecond,
      chunksize: Math.max(1024, Math.floor(bytesPerSecond / 10))
    });

    readStream.on('error', (err) => {
      res.destroy(err);
    });

    return readStream.pipe(throttle);
  };

  return {
    isLocalhostRequest,
    getUserDownloadSpeedLimit,
    getUserGroupIds,
    createSpeedLimitedStream
  };
};

module.exports = {
  createDownloadRuntime
};
