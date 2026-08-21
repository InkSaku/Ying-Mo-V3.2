export function cleanMemoryPage(value) {
  const parsed = Number.parseInt(value || "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function groupMemories(items = []) {
  const groups = [];
  for (const item of items) {
    const year = Number(item.memory_year);
    const current = groups.at(-1);
    if (!current || current.year !== year) {
      groups.push({ year, yearsAgo: Number(item.years_ago), items: [item] });
    } else {
      current.items.push(item);
    }
  }
  return groups;
}

export function memoryDayLabel(data) {
  if (!data?.month || !data?.day) return "今天";
  return `${data.month} 月 ${data.day} 日`;
}
