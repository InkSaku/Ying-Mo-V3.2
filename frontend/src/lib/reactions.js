export const REACTION_DEFINITIONS = [
  { kind: "heart", emoji: "❤️", label: "喜欢" },
  { kind: "like", emoji: "👍", label: "赞" },
  { kind: "laugh", emoji: "😄", label: "开心" },
  { kind: "celebrate", emoji: "🎉", label: "庆祝" },
  { kind: "wow", emoji: "😮", label: "惊喜" },
  { kind: "support", emoji: "🤗", label: "支持" },
];

export function normalizeReactions(value) {
  const source = new Map((value?.items || []).map((item) => [item.kind, item]));
  return {
    selected: REACTION_DEFINITIONS.some((item) => item.kind === value?.selected)
      ? value.selected
      : null,
    items: REACTION_DEFINITIONS.map((definition) => ({
      ...definition,
      count: Math.max(0, Number.parseInt(source.get(definition.kind)?.count || 0, 10) || 0),
    })),
  };
}

export function optimisticReaction(value, requestedKind) {
  const current = normalizeReactions(value);
  const nextKind = current.selected === requestedKind ? null : requestedKind;
  return {
    selected: nextKind,
    items: current.items.map((item) => ({
      ...item,
      count: Math.max(0, item.count
        - (item.kind === current.selected ? 1 : 0)
        + (item.kind === nextKind ? 1 : 0)),
    })),
  };
}
