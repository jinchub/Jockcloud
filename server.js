const { start, logError } = require("./src/app");

process.on("unhandledRejection", (reason) => {
  const isError = reason instanceof Error;
  logError("未处理的Promise异常", {
    errorMessage: isError ? reason.message : String(reason),
    stack: isError ? reason.stack : ""
  });
});

process.on("uncaughtException", (error) => {
  logError("未捕获异常", {
    errorMessage: error && error.message ? error.message : "unknown",
    stack: error && error.stack ? error.stack : ""
  });
  process.exit(1);
});

start();
