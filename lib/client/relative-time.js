/** Presentation only: original timestamps remain unchanged for audit and sorting. */
export function relativeTime(timestamp, now = Date.now()) {
    const date = new Date(timestamp);
    if (!Number.isFinite(timestamp) || !Number.isFinite(date.getTime()) || !Number.isFinite(now))
        return { label: '时间未知', title: '宿主未提供有效时间' };
    const seconds = Math.abs(now - timestamp) / 1000, future = timestamp > now;
    let label;
    if (seconds < 60)
        label = future ? '即将' : '刚刚';
    else {
        const [value, unit] = seconds < 3600 ? [Math.floor(seconds / 60), '分钟'] : seconds < 86400 ? [Math.floor(seconds / 3600), '小时'] : seconds < 2592000 ? [Math.floor(seconds / 86400), '天'] : seconds < 31536000 ? [Math.floor(seconds / 2592000), '个月'] : [Math.floor(seconds / 31536000), '年'];
        label = `${value}${unit}${future ? '后' : '前'}`;
    }
    return { label, title: date.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }), dateTime: date.toISOString() };
}
