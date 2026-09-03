/**
 * @module tikz-renderer.test.helper
 * @description Node 回归测试共享工具：DOM 桩、render 包装与独立失败计数器。
 *              生产模块在浏览器使用 window/document；测试在 Node 中按需注入最小桩。
 */

import { renderTikz } from './tikz-renderer.js';

let stubReady = false;

/**
 * 为 Node 环境提供最小 DOM 桩。首次 render 前才注入，避免模块被 import 时
 * 就修改 globalThis（控制副作用时机，防止影响其它测试/工具）。
 */
function ensureDomStub() {
    if (stubReady) return;
    globalThis.window = {};
    globalThis.document = {
        createElement() {
            throw new Error('no-dom');
        },
        head: { appendChild() {} },
    };
    stubReady = true;
}

/**
 * 渲染一段 TikZ 源码，返回 SVG 字符串（或降级错误 HTML）。
 * @param {string} src
 * @returns {Promise<string>}
 */
export async function render(src) {
    ensureDomStub();
    const el = {
        innerHTML: '',
        classList: { add() {} },
        getAttribute(n) {
            return n === 'data-tikz' ? src : null;
        },
    };
    const container = {
        querySelectorAll() {
            return [el];
        },
    };
    await renderTikz(container);
    return el.innerHTML;
}

/**
 * 每个测试套件持有自己的失败计数，套件之间不共享可变状态。
 * @returns {{check:Function, failures:number}}
 */
export function createHarness() {
    const h = {
        failures: 0,
        check(name, cond, detail) {
            console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (cond ? '' : ' | ' + detail));
            if (!cond) h.failures++;
        },
    };
    return h;
}
