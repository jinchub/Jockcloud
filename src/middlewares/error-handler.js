const createErrorHandler = ({ multer, getCurrentMaxUploadFileSize }) => {
  return (error, _req, res, next) => {
    if (!error) {
      next();
      return;
    }
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        const maxSizeMb = Math.floor(getCurrentMaxUploadFileSize() / 1024 / 1024);
        if (maxSizeMb <= 0) {
          res.status(413).json({ message: "文件过大" });
          return;
        }
        res.status(413).json({ message: `文件过大，单文件最大支持 ${maxSizeMb}MB` });
        return;
      }
      res.status(400).json({ message: error.message || "上传请求不合法" });
      return;
    }
    next(error);
  };
};

module.exports = {
  createErrorHandler
};
