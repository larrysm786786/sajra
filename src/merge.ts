import type { AppState, Member } from "./types";

/**
 * Three-way merge used when two people save at the same time.
 *
 *   base   - the archive as we last saw it in Supabase
 *   local  - what this browser wants to save
 *   remote - what is in Supabase right now (someone else saved first)
 *
 * Everything this browser changed (added / edited / removed) is applied on top of
 * `remote`, so the other person's work is kept and ours is not thrown away.
 */
export function mergeStates(base: AppState, local: AppState, remote: AppState): AppState {
  const members = mergeById(base.members, local.members, remote.members);
  const users = mergeById(base.users, local.users, remote.users);
  const gallery = mergeById(base.gallery, local.gallery, remote.gallery);

  return {
    ...remote,
    appName: local.appName !== base.appName ? local.appName : remote.appName,
    language: local.language !== base.language ? local.language : remote.language,
    theme: local.theme !== base.theme ? local.theme : remote.theme,
    members: remapMemberLinks(members.items, members.localIds, members.idMap),
    users: users.items,
    gallery: gallery.items
  };
}

interface MergeResult<T> {
  items: T[];
  /** Ids of items that came from this browser (added or edited). */
  localIds: Set<number>;
  /** Old id -> new id, for items this browser added whose id was already taken remotely. */
  idMap: Map<number, number>;
}

function mergeById<T extends { id: number }>(base: T[], local: T[], remote: T[]): MergeResult<T> {
  const baseById = new Map(base.map((item) => [item.id, item]));
  const localById = new Map(local.map((item) => [item.id, item]));
  const remoteById = new Map(remote.map((item) => [item.id, item]));

  const removedIds = new Set<number>();
  for (const id of baseById.keys()) {
    if (!localById.has(id)) removedIds.add(id);
  }

  const localIds = new Set<number>();
  const idMap = new Map<number, number>();
  const items = remote.filter((item) => !removedIds.has(item.id));
  const positionById = new Map(items.map((item, index) => [item.id, index]));
  let maxId = Math.max(0, ...remote.map((item) => item.id), ...local.map((item) => item.id));

  for (const item of local) {
    const original = baseById.get(item.id);

    if (original) {
      // Edited here? Then our version wins. If it was deleted remotely, the deletion wins.
      if (JSON.stringify(item) === JSON.stringify(original)) continue;
      const position = positionById.get(item.id);
      if (position !== undefined) {
        items[position] = item;
        localIds.add(item.id);
      }
      continue;
    }

    // Added here.
    const taken = remoteById.get(item.id);
    if (!taken) {
      positionById.set(item.id, items.length);
      items.push(item);
      localIds.add(item.id);
    } else if (JSON.stringify(taken) !== JSON.stringify(item)) {
      // Someone else added a different item with the same id: give ours a fresh one.
      maxId += 1;
      idMap.set(item.id, maxId);
      positionById.set(maxId, items.length);
      items.push({ ...item, id: maxId });
      localIds.add(maxId);
    }
  }

  return { items, localIds, idMap };
}

/** Points links on this browser's members at their new ids when an id had to change. */
function remapMemberLinks(items: Member[], localIds: Set<number>, idMap: Map<number, number>): Member[] {
  if (!idMap.size) return items;
  const fix = (id?: number | null) => (id != null && idMap.has(id) ? idMap.get(id)! : id);
  return items.map((member) =>
    localIds.has(member.id)
      ? {
          ...member,
          fatherId: fix(member.fatherId),
          motherId: fix(member.motherId),
          spouseIds: member.spouseIds.map((id) => fix(id) as number)
        }
      : member
  );
}
