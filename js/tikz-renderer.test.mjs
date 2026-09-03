/**
 * @module tikz-renderer.test
 * @description TikZ 渲染器 Node 回归测试入口。测试用例按主题拆分到 cases-*.mjs，
 *              本文件只负责组装套件与汇总退出码，保持每个模块职责单一、行数可控。
 *              运行：node js/tikz-renderer.test.mjs
 */

'use strict';

import { render, createHarness } from './tikz-renderer.test.helper.mjs';
import { runCoreCases } from './tikz-renderer.test.cases-core.mjs';
import { runRegressionCases } from './tikz-renderer.test.cases-regression.mjs';
import { runAuditCases } from './tikz-renderer.test.cases-audit.mjs';

const suites = [
    ['core', runCoreCases],
    ['history', runRegressionCases],
    ['audit', runAuditCases],
];

let totalFailures = 0;
for (const [name, run] of suites) {
    const h = createHarness();
    await run({ render: render, check: h.check });
    totalFailures += h.failures;
    if (h.failures) console.error(name + ' suite failed: ' + h.failures);
}

console.log(totalFailures === 0 ? '\nALL CHECKS PASSED' : `\n${totalFailures} CHECK(S) FAILED`);
process.exit(totalFailures === 0 ? 0 : 1);
