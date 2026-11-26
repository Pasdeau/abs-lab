/* `node --test tests/` 的统一入口。
 * 为什么要有这个文件：
 *   - Node 22 起，`node --test` 的参数按 glob 处理，"tests/" 匹配到的是目录本身，于是被当成一个模块来运行，
 *     解析成 tests/index.js；目录里的 *.test.js 不会被自动找出来（没有 index.js 时直接报错）。
 *   - Node 18 / 20 给的是目录时会递归查找测试文件，只认 *.test.js、test-*.js、test/ 目录下的文件等命名，
 *     index.js 不在其中（我们的目录叫 tests/ 不叫 test/），所以不会被当成测试再跑一遍，也就不会重复。
 * 这里把同目录下所有 *.test.js 按文件名排序后逐个 require，两种情况下都能把全部单元测试跑全。
 * 新增测试文件只要以 .test.js 结尾即可，不用改这里。
 */
"use strict";
var fs = require("fs");
var path = require("path");

fs.readdirSync(__dirname)
  .filter(function (f) { return /\.test\.js$/.test(f); })
  .sort()
  .forEach(function (f) { require(path.join(__dirname, f)); });
