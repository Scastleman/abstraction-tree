import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { TreeNode } from "@abstraction-tree/core";
import { nodeFiles, nodeLevel, nodeName } from "../nodeAccessors.js";

export interface TreeListProps {
  nodes: TreeNode[];
  selectedId?: string;
  query?: string;
  onSelect: (id: string) => void;
}

export interface TreeItem {
  node: TreeNode;
  depth: number;
  children: TreeItem[];
}

export function TreeList({ nodes, selectedId, query = "", onSelect }: TreeListProps) {
  const fullTreeItems = useMemo(() => buildTreeItems(nodes), [nodes]);
  const treeItems = useMemo(() => buildTreeItems(nodes, query), [nodes, query]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(defaultExpandedIds(fullTreeItems)));
  const isSearching = query.trim().length > 0;
  const flatItems = isSearching ? flattenTreeItems(treeItems) : flattenVisibleTreeItems(treeItems, expandedIds);
  const visibleIds = flatItems.map(item => item.node.id);
  const focusId = selectedId && visibleIds.includes(selectedId) ? selectedId : visibleIds[0];

  useEffect(() => {
    setExpandedIds(previous => {
      const next = new Set<string>();
      const validIds = new Set(flattenTreeItems(fullTreeItems).map(item => item.node.id));
      for (const id of previous) {
        if (validIds.has(id)) next.add(id);
      }
      for (const id of defaultExpandedIds(fullTreeItems)) {
        next.add(id);
      }
      for (const id of selectedId ? ancestorIds(fullTreeItems, selectedId) : []) {
        next.add(id);
      }
      return sameSet(previous, next) ? previous : next;
    });
  }, [fullTreeItems, selectedId]);

  if (!nodes.length) return <p className="muted">No tree nodes are available.</p>;
  if (!flatItems.length) return <p className="muted">No nodes match this search.</p>;

  return (
    <nav className="tree-list" aria-label="Abstraction tree">
      <div className="tree-items" role="tree" aria-label="Abstraction tree nodes">
        {treeItems.map(item => (
          <TreeBranch
            focusId={focusId}
            forceExpanded={isSearching}
            expandedIds={expandedIds}
            item={item}
            key={item.node.id}
            onSelect={onSelect}
            onToggle={toggleTreeItem}
            selectedId={selectedId}
            visibleIds={visibleIds}
          />
        ))}
      </div>
    </nav>
  );

  function toggleTreeItem(id: string, expanded?: boolean) {
    setExpandedIds(previous => {
      const next = new Set(previous);
      const shouldExpand = expanded ?? !next.has(id);
      if (shouldExpand) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }
}

export function buildTreeItems(nodes: TreeNode[], query = ""): TreeItem[] {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const order = new Map(nodes.map((node, index) => [node.id, index]));
  const childIdsByParent = new Map(nodes.map(node => [node.id, new Set<string>()]));
  const referencedChildIds = new Set<string>();

  for (const node of nodes) {
    for (const childId of node.children) {
      if (!byId.has(childId) || childId === node.id) continue;
      childIdsByParent.get(node.id)?.add(childId);
      referencedChildIds.add(childId);
    }
  }

  for (const node of nodes) {
    const parentId = node.parent ?? node.parentId;
    if (!parentId || !byId.has(parentId) || parentId === node.id) continue;
    childIdsByParent.get(parentId)?.add(node.id);
    referencedChildIds.add(node.id);
  }

  const rootIds = nodes
    .filter(node => !referencedChildIds.has(node.id))
    .map(node => node.id);
  const effectiveRootIds = rootIds.length ? rootIds : nodes.map(node => node.id);
  const emittedIds = new Set<string>();
  const treeItems = effectiveRootIds
    .map(id => createTreeItem(id, 0, new Set()))
    .filter((item): item is TreeItem => Boolean(item));

  for (const node of nodes) {
    if (emittedIds.has(node.id)) continue;
    const item = createTreeItem(node.id, 0, new Set());
    if (item) treeItems.push(item);
  }

  const normalizedQuery = query.trim().toLowerCase();
  return normalizedQuery ? treeItems.map(item => filterTreeItem(item, normalizedQuery)).filter((item): item is TreeItem => Boolean(item)) : treeItems;

  function createTreeItem(id: string, depth: number, ancestry: Set<string>): TreeItem | undefined {
    const node = byId.get(id);
    if (!node || ancestry.has(id)) return undefined;
    emittedIds.add(id);

    const nextAncestry = new Set(ancestry);
    nextAncestry.add(id);
    const childIds = [...(childIdsByParent.get(id) ?? [])].sort((left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0));
    const children = childIds
      .map(childId => createTreeItem(childId, depth + 1, nextAncestry))
      .filter((item): item is TreeItem => Boolean(item));

    return { node, depth, children };
  }
}

export function flattenTreeItems(items: TreeItem[]): TreeItem[] {
  return items.flatMap(item => [item, ...flattenTreeItems(item.children)]);
}

export function flattenVisibleTreeItems(items: TreeItem[], expandedIds: ReadonlySet<string>): TreeItem[] {
  return items.flatMap(item => {
    const visible = [item];
    if (expandedIds.has(item.node.id)) visible.push(...flattenVisibleTreeItems(item.children, expandedIds));
    return visible;
  });
}

export function moveTreeSelection(visibleIds: string[], currentId: string, key: string): string | undefined {
  if (!visibleIds.length) return undefined;

  const currentIndex = Math.max(0, visibleIds.indexOf(currentId));
  if (key === "ArrowDown") return visibleIds[Math.min(currentIndex + 1, visibleIds.length - 1)];
  if (key === "ArrowUp") return visibleIds[Math.max(currentIndex - 1, 0)];
  if (key === "Home") return visibleIds[0];
  if (key === "End") return visibleIds[visibleIds.length - 1];
  return undefined;
}

function TreeBranch({
  item,
  selectedId,
  focusId,
  forceExpanded,
  expandedIds,
  visibleIds,
  onToggle,
  onSelect
}: {
  item: TreeItem;
  selectedId?: string;
  focusId?: string;
  forceExpanded: boolean;
  expandedIds: ReadonlySet<string>;
  visibleIds: string[];
  onToggle: (id: string, expanded?: boolean) => void;
  onSelect: (id: string) => void;
}) {
  const hasChildren = item.children.length > 0;
  const isExpanded = forceExpanded || expandedIds.has(item.node.id);
  const isSelected = item.node.id === selectedId;

  return (
    <div className="tree-branch" role="none">
      <div className="tree-row" style={{ paddingLeft: `${item.depth * 18}px` }}>
        {hasChildren ? (
          <button
            aria-label={`${isExpanded ? "Collapse" : "Expand"} ${nodeName(item.node)}`}
            className="tree-toggle"
            onClick={() => onToggle(item.node.id)}
            type="button"
          >
            {isExpanded ? <ChevronDown aria-hidden="true" size={16} /> : <ChevronRight aria-hidden="true" size={16} />}
          </button>
        ) : <span className="tree-toggle-spacer" aria-hidden="true" />}
        <button
          aria-expanded={hasChildren ? isExpanded : undefined}
          aria-label={`Select ${nodeName(item.node)} at ${nodeLevel(item.node)}`}
          aria-level={item.depth + 1}
          aria-selected={isSelected}
          className={treeButtonClassName(isSelected, hasChildren)}
          id={treeButtonId(item.node.id)}
          onClick={() => onSelect(item.node.id)}
          onKeyDown={event => handleTreeKeyDown(event, visibleIds, item, isExpanded, onToggle, onSelect)}
          role="treeitem"
          tabIndex={item.node.id === focusId ? 0 : -1}
          type="button"
        >
          <span className="tree-level">{nodeLevel(item.node)}</span>
          <span className="tree-title">{nodeName(item.node)}</span>
        </button>
      </div>
      {hasChildren && isExpanded ? (
        <div className="tree-children" role="group">
          {item.children.map(child => (
            <TreeBranch
              focusId={focusId}
              forceExpanded={forceExpanded}
              expandedIds={expandedIds}
              item={child}
              key={child.node.id}
              onSelect={onSelect}
              onToggle={onToggle}
              selectedId={selectedId}
              visibleIds={visibleIds}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function filterTreeItem(item: TreeItem, normalizedQuery: string): TreeItem | undefined {
  if (matchesNode(item.node, normalizedQuery)) return item;

  const children = item.children
    .map(child => filterTreeItem(child, normalizedQuery))
    .filter((child): child is TreeItem => Boolean(child));

  return children.length ? { ...item, children } : undefined;
}

function matchesNode(node: TreeNode, normalizedQuery: string): boolean {
  return (
    nodeName(node).toLowerCase().includes(normalizedQuery) ||
    node.summary.toLowerCase().includes(normalizedQuery) ||
    (node.explanation?.toLowerCase().includes(normalizedQuery) ?? false) ||
    (node.separationLogic?.toLowerCase().includes(normalizedQuery) ?? false) ||
    nodeFiles(node).some(filePath => filePath.toLowerCase().includes(normalizedQuery))
  );
}

function handleTreeKeyDown(
  event: KeyboardEvent<HTMLButtonElement>,
  visibleIds: string[],
  item: TreeItem,
  isExpanded: boolean,
  onToggle: (id: string, expanded?: boolean) => void,
  onSelect: (id: string) => void
) {
  if (item.children.length && event.key === "ArrowRight" && !isExpanded) {
    event.preventDefault();
    onToggle(item.node.id, true);
    return;
  }
  if (item.children.length && event.key === "ArrowLeft" && isExpanded) {
    event.preventDefault();
    onToggle(item.node.id, false);
    return;
  }

  const nextId = moveTreeSelection(visibleIds, item.node.id, event.key);
  if (!nextId || nextId === item.node.id) return;

  event.preventDefault();
  onSelect(nextId);
  if (typeof document !== "undefined") {
    requestAnimationFrame(() => document.getElementById(treeButtonId(nextId))?.focus());
  }
}

function treeButtonClassName(isSelected: boolean, hasChildren: boolean): string {
  return [
    "tree-item",
    isSelected ? "active" : undefined,
    hasChildren ? "has-children" : undefined
  ].filter(Boolean).join(" ");
}

function treeButtonId(nodeId: string): string {
  return `tree-node-${nodeId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function defaultExpandedIds(items: TreeItem[]): string[] {
  return items.filter(item => item.children.length > 0).map(item => item.node.id);
}

function ancestorIds(items: TreeItem[], targetId: string, ancestors: string[] = []): string[] {
  for (const item of items) {
    if (item.node.id === targetId) return ancestors;
    const found = ancestorIds(item.children, targetId, [...ancestors, item.node.id]);
    if (found.length) return found;
  }
  return [];
}

function sameSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}
