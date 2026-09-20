// Unified async boundary: replace this implementation with a same-origin API
// request when integrating Dify. Never put a Dify API key in the browser.
export async function sendMessage({ question }) {
  await new Promise(resolve => setTimeout(resolve, 850));
  if (/什么时候|何时|截止|时间/.test(question)) {
    return { text: '演示答复：储量年报应按主管部门当年度通知的时限提交。当前尚未接入政策资料，具体截止日期请以正式通知为准。' };
  }
  if (/材料|准备|清单/.test(question)) {
    return { text: '演示答复：可准备储量年报、相关统计表及佐证材料。此处仅展示问答效果，具体材料清单请以主管部门当年度要求为准。' };
  }
  if (/储量年报/.test(question) && /提交|交了吗|交了没/.test(question)) {
    return { text: '已提交。\n2026年度储量年报已提交。\n\n以上为演示矿山的 Mock 数据，不代表真实业务状态。' };
  }
  return { text: '当前为前端演示，暂时支持储量年报的提交状态、提交时间和材料准备三个示例问题。您可以点击上方示例体验。' };
}
