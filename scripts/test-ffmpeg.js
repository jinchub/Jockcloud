/**
 * 测试 ffmpeg 是否可用
 */
const fs = require("fs");
const path = require("path");

try {
  const ffmpegPath = require("ffmpeg-static");
  console.log("ffmpeg-static 路径:", ffmpegPath);
  console.log("文件存在:", fs.existsSync(ffmpegPath));
  
  const ffmpeg = require("fluent-ffmpeg");
  console.log("fluent-ffmpeg 加载成功");
  
  // 测试一个视频文件
  const testVideo = "C:\\Users\\emucoo\\Desktop\\jockcloud\\uploads\\admin-1\\20260615\\1781509910941-fd0500dae5e15e6c-video_20260601_101118 (1).mp4";
  console.log("\n测试视频文件:", testVideo);
  console.log("文件存在:", fs.existsSync(testVideo));
  
  const outputPath = path.join(__dirname, "test-thumb.jpg");
  
  ffmpeg(testVideo)
    .inputOptions(["-ss", "0"])
    .outputOptions(["-vframes", "1", "-f", "image2", "-vf", "scale=320:-1"])
    .output(outputPath)
    .on("end", () => {
      console.log("\n✓ 缩略图生成成功:", outputPath);
      console.log("文件大小:", fs.statSync(outputPath).size, "bytes");
      fs.unlinkSync(outputPath);
    })
    .on("error", (err) => {
      console.log("\n✗ 生成失败:", err.message);
      console.log("错误详情:", err);
    })
    .run(ffmpegPath);
    
} catch (err) {
  console.log("错误:", err.message);
  console.log(err.stack);
}
