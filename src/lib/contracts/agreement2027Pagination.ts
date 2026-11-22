type DocumentBlock = { id: string; height: number; keepWithNext?: boolean };
type BlockGroup<T> = { blocks: T[]; height: number };

// PDF point coordinates often contain decimals. Ignore only arithmetic
// rounding when an exact sum lands a fraction above the page boundary.
const toleranceFor = (capacity: number) => Math.max(1, capacity) * Number.EPSILON * 8;
const fits = (height: number, capacity: number) => height <= capacity || height - capacity <= toleranceFor(capacity);

function groupBlocks<T extends DocumentBlock>(
 blocks: readonly T[],
 capacity: number,
): BlockGroup<T>[] {
 if (!Number.isFinite(capacity) || capacity <= 0) throw new RangeError('Page capacity must be a positive finite height.');
 for (const block of blocks) {
  if (!Number.isFinite(block.height) || block.height < 0) throw new RangeError('Block ' + block.id + ' must have a finite non-negative height.');
  if (block.height > capacity) throw new RangeError('Block ' + block.id + ' exceeds the page capacity and must be split before pagination.');
 }
 const groups: BlockGroup<T>[] = [];
 for (let index = 0; index < blocks.length;) {
  const group: T[] = [blocks[index]];
  let height = blocks[index].height;
  // A heading and its following block move together. Consecutive headings
  // also stay with the following content when that entire run fits a page.
  // A longer-than-page keep run breaks at its latest fitting boundary.
  while (blocks[index].keepWithNext && index + 1 < blocks.length && fits(height + blocks[index + 1].height, capacity)) {
   index++;
   group.push(blocks[index]);
   height += blocks[index].height;
  }
  groups.push({ blocks: group, height });
  index++;
 }
 return groups;
}

/**
 * Pack already measured, indivisible document blocks into pages in source
 * order. The caller must split an oversized block before paginating it.
 */
export function paginateAgreement2027Blocks<T extends DocumentBlock>(blocks: readonly T[], capacity: number): T[][] {
 const pages: T[][] = [];
 let page: T[] = [];
 let used = 0;
 for (const group of groupBlocks(blocks, capacity)) {
  if (page.length && !fits(used + group.height, capacity)) {
   pages.push(page);
   page = [];
   used = 0;
  }
  page.push(...group.blocks);
  used += group.height;
 }
 if (page.length) pages.push(page);
 return pages;
}

/**
 * Keep the greedy minimum page count, then choose the ordered partition with
 * the greatest minimum used page height. Linked blocks remain indivisible at
 * the actual page capacity, even while the content is balanced.
 */
export function balancedAgreement2027Pages<T extends DocumentBlock>(blocks: readonly T[], capacity: number): T[][] {
 const greedy = paginateAgreement2027Blocks(blocks, capacity);
 const pageCount = greedy.length;
 if (pageCount < 2) return greedy;
 const groups = groupBlocks(blocks, capacity);
 const prefix = [0];
 for (const group of groups) prefix.push(prefix[prefix.length - 1] + group.height);
 const scores: number[][] = Array.from({ length: pageCount + 1 }, () => Array(groups.length + 1).fill(-Infinity));
 const previous: number[][] = Array.from({ length: pageCount + 1 }, () => Array(groups.length + 1).fill(-1));
 scores[0][0] = Infinity;
 for (let pages = 1; pages <= pageCount; pages++) {
  for (let end = pages; end <= groups.length; end++) {
   for (let start = end - 1; start >= pages - 1; start--) {
    const height = prefix[end] - prefix[start];
    if (!fits(height, capacity)) break;
    if (scores[pages - 1][start] === -Infinity) continue;
    const score = Math.min(scores[pages - 1][start], height);
    if (score > scores[pages][end]) {
     scores[pages][end] = score;
     previous[pages][end] = start;
    }
   }
  }
 }
 const balanced: T[][] = [];
 let end = groups.length;
 for (let pages = pageCount; pages > 0; pages--) {
  const start = previous[pages][end];
  if (start < 0) throw new Error('Unable to balance contract pages without exceeding the page capacity.');
  balanced.unshift(groups.slice(start, end).flatMap(group => group.blocks));
  end = start;
 }
 return balanced;
}
